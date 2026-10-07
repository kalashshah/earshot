import AVFoundation
import Combine
import UserNotifications

/// Keeps the mic open while "on", and cuts the stream into conversation clips:
/// a clip starts on the first voiced buffer (plus ~2s of pre-roll so the first word isn't lost)
/// and ends after `silenceToClose` without voice, or at `maxClip`. Silence is never written.
final class Recorder: ObservableObject {
    static let shared = Recorder()

    @Published private(set) var isOn = false
    @Published private(set) var inConversation = false
    @Published private(set) var since: Date?
    @Published private(set) var clipsToday = 0
    @Published var lastError: String?

    var onClip: ((URL) -> Void)?
    var onStateChange: (() -> Void)?

    // Tuning knobs — real mics/rooms differ; adjust after wearing it for a day.
    private let voiceMarginDb: Float = 12      // how far above the noise floor counts as voice
    private let voiceFloorDb: Float = -55      // never call anything quieter than this voice
    private let silenceToClose: Double = 30    // seconds of quiet that end a conversation
    private let maxClip: Double = 10 * 60      // rotate long conversations into 10-min clips
    private let minVoiced: Double = 3          // drop clips with less voice than this (a cough, a door)
    private let preRollSeconds: Double = 2

    private let engine = AVAudioEngine()
    private let q = DispatchQueue(label: "earshot.recorder")
    private let outFormat = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1)!
    private var converter: AVAudioConverter?

    // Only touched on `q`.
    private var noiseFloorDb: Float = -50
    private var preRoll: [AVAudioPCMBuffer] = []
    private var file: AVAudioFile?
    private var clipURL: URL?
    private var clipID = UUID()
    private var clipStart = Date()
    private var clipSeconds: Double = 0
    private var voicedSeconds: Double = 0
    private var silenceSeconds: Double = 0

    private init() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
            self?.handleInterruption(n)
        }
        nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            guard let self, self.isOn else { return }
            self.restart(reason: "audio route changed")
        }
    }

    // MARK: on / off

    func start() {
        guard !isOn else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard let self else { return }
                guard granted else { self.lastError = "Microphone access is off. Enable it in Settings → Privacy."; return }
                do {
                    try self.startEngine()
                    self.isOn = true
                    self.since = Date()
                    self.lastError = nil
                    self.onStateChange?()
                } catch {
                    self.lastError = "Couldn't start: \(error.localizedDescription)"
                    self.onStateChange?()
                }
            }
        }
    }

    func stop() {
        guard isOn else { return }
        isOn = false
        since = nil
        inConversation = false
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        q.async { self.closeClip() }
        onStateChange?()
    }

    private func startEngine() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .default)
        try session.setActive(true)

        let input = engine.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0 else { throw NSError(domain: "Earshot", code: 1, userInfo: [NSLocalizedDescriptionKey: "No microphone input"]) }
        // Mono float at the hardware rate in, 16 kHz mono out.
        let tapFormat = AVAudioFormat(standardFormatWithSampleRate: inFormat.sampleRate, channels: 1)!
        converter = AVAudioConverter(from: tapFormat, to: outFormat)

        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 4096, format: tapFormat) { [weak self] buffer, _ in
            guard let self, let copy = buffer.copy() as? AVAudioPCMBuffer else { return }
            self.q.async { self.process(copy) }
        }
        engine.prepare()
        try engine.start()
    }

    private func restart(reason: String) {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        do {
            try startEngine()
        } catch {
            isOn = false
            since = nil
            lastError = "Stopped: \(reason)"
            q.async { self.closeClip() }
            notifyStopped(reason)
            onStateChange?()
        }
    }

    private func handleInterruption(_ n: Notification) {
        guard isOn, let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            q.async { self.closeClip() }   // a call/Siri took the mic: ship what we have
        case .ended:
            restart(reason: "interrupted by another app")
        @unknown default:
            break
        }
    }

    private func notifyStopped(_ reason: String) {
        let content = UNMutableNotificationContent()
        content.title = "Earshot stopped recording"
        content.body = "\(reason.prefix(1).uppercased())\(reason.dropFirst()). Tap to turn it back on."
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "stopped", content: content, trigger: nil))
    }

    // MARK: audio (on q)

    private func process(_ buffer: AVAudioPCMBuffer) {
        guard let pcm = resample(buffer), pcm.frameLength > 0 else { return }
        let seconds = Double(pcm.frameLength) / outFormat.sampleRate
        let db = Self.levelDb(pcm)

        // Noise floor drops instantly to quieter levels and creeps up slowly (~a minute),
        // so steady background noise (fan, car) stops counting as voice.
        noiseFloorDb = db < noiseFloorDb ? db : noiseFloorDb + (db - noiseFloorDb) * Float(seconds / 60)
        let voiced = db > max(noiseFloorDb + voiceMarginDb, voiceFloorDb)

        if file == nil {
            preRoll.append(pcm)
            var total = preRoll.reduce(0) { $0 + Double($1.frameLength) } / outFormat.sampleRate
            while total > preRollSeconds, let first = preRoll.first {
                total -= Double(first.frameLength) / outFormat.sampleRate
                preRoll.removeFirst()
            }
            guard voiced else { return }
            openClip()
            return
        }

        write(pcm)
        clipSeconds += seconds
        if voiced { voicedSeconds += seconds; silenceSeconds = 0 } else { silenceSeconds += seconds }
        if silenceSeconds >= silenceToClose || clipSeconds >= maxClip { closeClip() }
    }

    private func openClip() {
        clipID = UUID()
        clipStart = Date().addingTimeInterval(-preRoll.reduce(0) { $0 + Double($1.frameLength) } / outFormat.sampleRate)
        clipSeconds = 0; voicedSeconds = 0; silenceSeconds = 0
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(clipID.uuidString).m4a")
        file = try? AVAudioFile(forWriting: url, settings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 24000,
        ], commonFormat: .pcmFormatFloat32, interleaved: false)
        clipURL = url
        for b in preRoll { write(b); clipSeconds += Double(b.frameLength) / outFormat.sampleRate }
        voicedSeconds += Double(preRoll.last?.frameLength ?? 0) / outFormat.sampleRate
        preRoll.removeAll()
        DispatchQueue.main.async { self.inConversation = true }
    }

    private func write(_ pcm: AVAudioPCMBuffer) {
        do { try file?.write(from: pcm) } catch { DispatchQueue.main.async { self.lastError = "Write failed: \(error.localizedDescription)" } }
    }

    private func closeClip() {
        guard file != nil, let url = clipURL else { return }
        file = nil   // releasing the AVAudioFile finalizes the m4a
        clipURL = nil
        DispatchQueue.main.async { self.inConversation = false }

        // Trailing silence was written; don't count it as the clip's length.
        let durationMs = Int64(max(0, clipSeconds - silenceSeconds) * 1000)
        guard voicedSeconds >= minVoiced else { try? FileManager.default.removeItem(at: url); return }
        let dest = Clip.outbox().appendingPathComponent(Clip.filename(id: clipID, startedAt: clipStart, durationMs: durationMs))
        do {
            try FileManager.default.moveItem(at: url, to: dest)
            DispatchQueue.main.async {
                self.clipsToday += 1
                self.onClip?(dest)
            }
        } catch {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private func resample(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let converter else { return nil }
        let ratio = outFormat.sampleRate / buffer.format.sampleRate
        guard let out = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32) else { return nil }
        var fed = false
        var error: NSError?
        converter.convert(to: out, error: &error) { _, status in
            if fed { status.pointee = .noDataNow; return nil }
            fed = true
            status.pointee = .haveData
            return buffer
        }
        return error == nil ? out : nil
    }

    static func levelDb(_ pcm: AVAudioPCMBuffer) -> Float {
        guard let data = pcm.floatChannelData?[0], pcm.frameLength > 0 else { return -120 }
        var sum: Float = 0
        for i in 0..<Int(pcm.frameLength) { sum += data[i] * data[i] }
        let rms = (sum / Float(pcm.frameLength)).squareRoot()
        return 20 * log10(max(rms, 1e-6))
    }
}

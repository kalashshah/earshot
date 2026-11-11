import AVFoundation
import Combine
import SoundAnalysis
import UserNotifications

/// Keeps the mic open while "on", and cuts the stream into conversation clips. Apple's on-device sound
/// classifier decides what is speech (any language, and fan or traffic noise doesn't count), with the
/// loudness gate as a fallback. A clip starts on speech (plus the held seconds before it, so the first word
/// isn't lost) and ends after `silenceToClose` without it, or at `maxClip`. Pauses are written only up to
/// `tailSeconds` + `holdSeconds`: transcription is billed per minute of audio, and silence transcribes to nothing.
final class Recorder: ObservableObject {
    static let shared = Recorder()

    @Published private(set) var isOn = false
    @Published private(set) var inConversation = false
    /// 0…1 loudness above the noise floor, smoothed, for the orb and bars. UI only; never stored.
    @Published private(set) var level: Double = 0
    @Published private(set) var since: Date?
    @Published private(set) var clipsToday = 0
    @Published var lastError: String?

    var onClip: ((URL) -> Void)?
    var onStateChange: (() -> Void)?

    // Tuning knobs — real mics/rooms differ; adjust after wearing it for a day.
    private let voiceMarginDb: Float = 9       // how far above the noise floor counts as voice (people across a table are quiet)
    private let voiceFloorDb: Float = -60      // never call anything quieter than this voice
    private let silenceToClose: Double = 45    // seconds of quiet that end a conversation
    private let targetDb: Float = -23          // voiced audio is boosted toward this before encoding
    private let maxGainDb: Float = 24          // the watch's input gain isn't settable, so this is all software
    private let gainDrop: Float = 0.6          // share of the way down per buffer when something is loud: near-instant, or the next word clips
    private let gainLift: Float = 0.05         // share of the way up per buffer on quiet speech (~2 s to settle)
    private let liftMarginDb: Float = 3        // only lift on sound this far above the noise floor, never on the hush between words
    private let rumbleHz: Double = 80          // cut below this before anything is measured: bumps and wind, not voice
    private let stallSeconds: Double = 10      // no audio from the mic for this long while on → restart it
    private let interruptionGrace: Double = 120 // Siri, dictation or a call has the mic: wait this long for it to come back by itself
    private let maxClip: Double = 10 * 60      // rotate long conversations into clips: past this, cut at the next pause…
    private let hardClip: Double = 12 * 60     // …and here even mid-sentence (a cut mid-word loses the word and renumbers speakers)
    private let minVoiced: Double = 3          // drop clips with less voice than this (a cough, a door)
    // Tuned on real Hindi/English clips: tighter settings (0.1 / 2 s / 1 s / 3 s) cut quiet one-liners like "क्या हुआ?".
    private let speechThreshold = 0.03         // classifier confidence; fan noise ≈ 0.01, a far voice in noise 0.05–0.4
    private let speechHang: Double = 4         // speech counts as ongoing this long after the last speech window
    private let tailSeconds: Double = 4        // of each pause, written right after speech
    private let holdSeconds: Double = 5        // of each pause, kept to write before speech resumes (covers classifier lag)

    private let engine = AVAudioEngine()
    private let q = DispatchQueue(label: "earshot.recorder")
    private let outFormat = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1)!
    private var converter: AVAudioConverter?

    // Only touched on `q`.
    private var noiseFloorDb: Float = -50
    private var gainDb: Float = 0
    private var heldSeconds: Double = 0
    private var framePos: AVAudioFramePosition = 0
    private var speechUntil = -Double.infinity   // stream position (s) where speech was last heard
    // ponytail: the classifier runs on every buffer while recording; if battery suffers, feed it only when the loudness gate is open.
    private lazy var speech: (SNAudioStreamAnalyzer, SpeechObserver)? = {
        guard let req = try? SNClassifySoundRequest(classifierIdentifier: .version1) else { return nil }
        req.windowDuration = CMTime(seconds: 1.5, preferredTimescale: 16000)
        req.overlapFactor = 0.5
        let analyzer = SNAudioStreamAnalyzer(format: outFormat)
        let observer = SpeechObserver(threshold: speechThreshold) { [weak self] end in
            guard let self else { return }
            self.q.async { self.speechUntil = max(self.speechUntil, end) }
        }
        guard (try? analyzer.add(req, withObserver: observer)) != nil else { return nil }
        return (analyzer, observer)
    }()
    private var held: [(pcm: AVAudioPCMBuffer, rawDb: Float)] = []
    private var clip: ClipWriter?
    private lazy var highPass = HighPass(cutoff: rumbleHz, sampleRate: outFormat.sampleRate)
    private var squeezed = false   // part of the current pause was dropped: the audio written next doesn't follow on
    private var lastBufferAt = Date()
    private let encodeQ = DispatchQueue(label: "earshot.encode", qos: .utility)
    // Only touched on main.
    private var watchdog: Timer?
    private var interruptedAt: Date?
    private var stalled = false
    private var clipSeconds: Double = 0
    private var voicedSeconds: Double = 0
    private var silenceSeconds: Double = 0
    private var lastLevelAt = Date.distantPast

    private init() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
            self?.handleInterruption(n)
        }
        nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            guard let self, self.isOn else { return }
            self.restart(reason: "audio route changed")
        }
        encodeQ.async {
            let recovered = ClipWriter.recover(minSeconds: self.minVoiced)
            DispatchQueue.main.async { recovered.forEach { self.onClip?($0) } }
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
                    self.interruptedAt = nil
                    self.stalled = false
                    self.q.async { self.lastBufferAt = Date() }
                    self.watchdog = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in self?.checkAlive() }
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
        level = 0
        watchdog?.invalidate()
        watchdog = nil
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        q.async { self.closeClip() }
        onStateChange?()
    }

    private func startEngine() throws {
        let session = AVAudioSession.sharedInstance()
        // Default mode's processing is tuned for you talking into a raised wrist and treats voices across the
        // room as noise. Measurement mode turns it off; the software gain below makes up the level.
        try session.setCategory(.record, mode: session.availableModes.contains(.measurement) ? .measurement : .default)
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
            watchdog?.invalidate()
            watchdog = nil
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
            interruptedAt = Date()
            q.async { self.closeClip() }   // a call/Siri took the mic: ship what we have
        case .ended:
            interruptedAt = nil
            restart(reason: "interrupted by another app")
        @unknown default:
            break
        }
    }

    /// The system doesn't always say when an interruption is over, and a tap can simply stop delivering: either way
    /// the watch showed "on" while recording nothing. If the mic has gone quiet, restart it, and keep trying;
    /// say so once if a minute passes, without turning off, so recording resumes by itself when it can.
    func checkAlive() {
        guard isOn else { return }
        let quiet = q.sync { Date().timeIntervalSince(lastBufferAt) }
        guard quiet > stallSeconds else {
            if stalled { stalled = false; lastError = nil; onStateChange?() }
            return
        }
        if let interruptedAt, Date().timeIntervalSince(interruptedAt) < interruptionGrace { return }   // don't grab the mic back mid-dictation
        q.async { self.closeClip() }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? startEngine()   // if this worked, buffers arrive and the next check clears `stalled`
        if !stalled, quiet > 60 {
            stalled = true
            lastError = "Not hearing anything. Open Earshot to resume."
            notifyStopped("the microphone went quiet")
            onStateChange?()
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
        highPass.apply(pcm)
        let seconds = Double(pcm.frameLength) / outFormat.sampleRate
        let db = Self.levelDb(pcm)
        lastBufferAt = Date()

        // Noise floor drops instantly to quieter levels and creeps up slowly (~a minute),
        // so steady background noise (fan, car) stops counting as voice.
        noiseFloorDb = db < noiseFloorDb ? db : noiseFloorDb + (db - noiseFloorDb) * Float(seconds / 60)
        let loud = db > max(noiseFloorDb + voiceMarginDb, voiceFloorDb)
        let voiced = speech == nil ? loud : Double(framePos) / outFormat.sampleRate - speechUntil < speechHang
        publishLevel(db)
        // Lift speech toward targetDb. Down is near-instant on anything loud, speech or not: a gain left high by a
        // quiet stretch squares off the next word. Up is slow, and only on speech sounding right now: `voiced` also
        // covers the hang after speech, where following the level would pump the gain to its maximum in every pause.
        let gainWas = gainDb
        let want = min(max(targetDb - db, 0), maxGainDb)
        if want < gainDb { gainDb += (want - gainDb) * gainDrop }
        else if voiced && db > noiseFloorDb + liftMarginDb { gainDb += (want - gainDb) * gainLift }
        Self.amplify(pcm, fromDb: gainWas, toDb: gainDb)
        speech?.0.analyze(pcm, atAudioFramePosition: framePos)   // its verdict arrives a window later; `held` covers that
        framePos += AVAudioFramePosition(pcm.frameLength)

        if voiced {
            if clip == nil { openClip() }
            if squeezed { Self.fadeIn(held.first?.pcm ?? pcm); squeezed = false }   // a hard cut clicks
            for b in held { write(b.pcm, rawDb: b.rawDb); clipSeconds += Double(b.pcm.frameLength) / outFormat.sampleRate }
            held.removeAll(); heldSeconds = 0
            write(pcm, rawDb: db)
            clipSeconds += seconds; voicedSeconds += seconds; silenceSeconds = 0
        } else if clip != nil && silenceSeconds < tailSeconds {
            write(pcm, rawDb: db)
            clipSeconds += seconds; silenceSeconds += seconds
        } else {
            // Outside a clip this is pre-roll; inside, the middle of a pause. Only the last holdSeconds survive.
            held.append((pcm, db)); heldSeconds += seconds
            while heldSeconds > holdSeconds, let first = held.first { heldSeconds -= Double(first.pcm.frameLength) / outFormat.sampleRate; held.removeFirst(); squeezed = clip != nil }
            if clip != nil { silenceSeconds += seconds }
        }
        let rotate = clipSeconds >= maxClip && (silenceSeconds >= 1 || clipSeconds >= hardClip)
        if silenceSeconds >= silenceToClose || rotate { closeClip() }
    }

    /// ~12 updates a second at most; fast attack, slower release so the orb doesn't flicker.
    private func publishLevel(_ db: Float) {
        let now = Date()
        guard now.timeIntervalSince(lastLevelAt) > 0.08 else { return }
        lastLevelAt = now
        let n = Double(max(0, min(1, (db - noiseFloorDb) / 30)))
        DispatchQueue.main.async { self.level += (n - self.level) * (n > self.level ? 0.6 : 0.25) }
    }

    private func openClip() {
        clipSeconds = 0; voicedSeconds = 0; silenceSeconds = 0; squeezed = false
        clip = ClipWriter(start: Date().addingTimeInterval(-heldSeconds))
        guard clip != nil else { DispatchQueue.main.async { self.lastError = "Couldn't save audio: storage unavailable" }; return }
        DispatchQueue.main.async { self.inConversation = true; self.onStateChange?() }
    }

    private func write(_ pcm: AVAudioPCMBuffer, rawDb: Float) {
        do { try clip?.write(pcm, rawDb: rawDb) } catch { DispatchQueue.main.async { self.lastError = "Write failed: \(error.localizedDescription)" } }
    }

    private func closeClip() {
        guard let clip else { return }
        self.clip = nil
        DispatchQueue.main.async { self.inConversation = false; self.onStateChange?() }
        let keep = voicedSeconds >= minVoiced   // less than this is a cough or a door
        encodeQ.async {
            guard let dest = clip.finish(keep: keep) else { return }
            DispatchQueue.main.async {
                self.clipsToday += 1
                self.onClip?(dest)
            }
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

    /// Gain ramps across the buffer (a step clicks at the seam) and tanh soft-limits: quiet speech passes
    /// unchanged, a laugh or a word right at the mic rounds off instead of squaring off into clipping.
    static func amplify(_ pcm: AVAudioPCMBuffer, fromDb: Float, toDb: Float) {
        guard max(fromDb, toDb) > 0.5, let data = pcm.floatChannelData?[0] else { return }
        let n = Int(pcm.frameLength)
        let g0 = pow(10, fromDb / 20), g1 = pow(10, toDb / 20)
        for i in 0..<n { data[i] = tanh(data[i] * (g0 + (g1 - g0) * Float(i) / Float(n))) }
    }

    /// 10 ms ramp up from silence.
    static func fadeIn(_ pcm: AVAudioPCMBuffer) {
        guard let data = pcm.floatChannelData?[0] else { return }
        let n = min(160, Int(pcm.frameLength))
        for i in 0..<n { data[i] *= Float(i) / Float(n) }
    }

    static func levelDb(_ pcm: AVAudioPCMBuffer) -> Float {
        guard let data = pcm.floatChannelData?[0], pcm.frameLength > 0 else { return -120 }
        var sum: Float = 0
        for i in 0..<Int(pcm.frameLength) { sum += data[i] * data[i] }
        let rms = (sum / Float(pcm.frameLength)).squareRoot()
        return 20 * log10(max(rms, 1e-6))
    }
}

/// Reports the end (stream seconds) of each classifier window that sounds like speech.
private final class SpeechObserver: NSObject, SNResultsObserving {
    let threshold: Double
    let onSpeech: (Double) -> Void
    init(threshold: Double, onSpeech: @escaping (Double) -> Void) { self.threshold = threshold; self.onSpeech = onSpeech }

    func request(_ request: SNRequest, didProduce result: SNResult) {
        guard let c = result as? SNClassificationResult, (c.classification(forIdentifier: "speech")?.confidence ?? 0) >= threshold else { return }
        onSpeech(c.timeRange.end.seconds)
    }
}

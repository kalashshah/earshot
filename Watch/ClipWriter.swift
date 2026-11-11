import AVFoundation

/// One conversation on its way to disk. Audio is appended as raw 16 kHz mono Int16, which stays readable up to
/// the last write, and is encoded to m4a only when the clip closes. An m4a can't be read until it is finalized,
/// so writing one directly lost the whole conversation whenever the app was killed mid-clip.
final class ClipWriter {
    static let sampleRate = 16000.0

    let start: Date
    /// Loudness at the mic before any gain, one character per second of written audio (see `levelChar`).
    /// The server lines it up with the transcript: the voice nearest the watch is usually the wearer's.
    private(set) var levels = ""

    private let url: URL
    private let handle: FileHandle
    private var power = 0.0, frames = 0

    init?(start: Date) {
        self.start = start
        url = Self.dir().appendingPathComponent("\(UUID().uuidString)_\(Int64(start.timeIntervalSince1970 * 1000)).pcm")
        guard FileManager.default.createFile(atPath: url.path, contents: nil), let h = try? FileHandle(forWritingTo: url) else { return nil }
        handle = h
    }

    func write(_ pcm: AVAudioPCMBuffer, rawDb: Float) throws {
        guard let data = pcm.floatChannelData?[0] else { return }
        let n = Int(pcm.frameLength)
        var out = [Int16](repeating: 0, count: n)
        for i in 0..<n where data[i].isFinite { out[i] = Int16(max(-1, min(1, data[i])) * 32767) }
        try out.withUnsafeBytes { try handle.write(contentsOf: Data($0)) }

        // Whole frames, not summed seconds: the characters have to stay lined up with the audio for a whole clip.
        power += pow(10, Double(rawDb) / 10) * Double(n)
        frames += n
        if frames >= Int(Self.sampleRate) {
            levels.append(Self.levelChar(Float(10 * log10(power / Double(frames)))))
            power = 0; frames -= Int(Self.sampleRate)
        }
    }

    /// Closes the clip. Kept clips are encoded into the outbox and their URL returned.
    func finish(keep: Bool) -> URL? {
        try? handle.close()
        guard keep else { try? FileManager.default.removeItem(at: url); return nil }
        return Self.ship(url, levels: levels)   // on failure the pcm stays, and `recover` tries once more at next launch
    }

    /// Ships the clips a killed run left open. Call at launch, before recording starts.
    static func recover(minSeconds: Double) -> [URL] {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir(), includingPropertiesForKeys: nil)) ?? []
        return files.compactMap { url in
            if duration(url) >= minSeconds, let m4a = ship(url, levels: "") { return m4a }
            try? FileManager.default.removeItem(at: url)
            return nil
        }
    }

    /// 62 steps of 1.5 dB from -93 dBFS, as one header-safe character. The server's `levelDb` is the inverse.
    static func levelChar(_ db: Float) -> Character {
        let alphabet = Array("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
        return alphabet[max(0, min(alphabet.count - 1, Int(((db + 93) / 1.5).rounded())))]
    }

    static func encode(_ pcm: URL, to m4a: URL) throws {
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        let out = try AVAudioFile(forWriting: m4a, settings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 48000,   // 32k smeared consonants on quiet, far voices; ~360 KB per minute of talk
        ], commonFormat: .pcmFormatFloat32, interleaved: false)
        let input = try FileHandle(forReadingFrom: pcm)
        defer { try? input.close() }
        while let chunk = try input.read(upToCount: 2 * Int(sampleRate) * 10), chunk.count >= 2 {   // 10 s at a time
            let n = chunk.count / 2
            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(n)), let dst = buffer.floatChannelData?[0] else { break }
            chunk.withUnsafeBytes { raw in
                for i in 0..<n { dst[i] = Float(raw.loadUnaligned(fromByteOffset: i * 2, as: Int16.self)) / 32767 }
            }
            buffer.frameLength = AVAudioFrameCount(n)
            try out.write(from: buffer)
        }
    }   // releasing the AVAudioFile finalizes the m4a

    private static func duration(_ pcm: URL) -> Double {
        let bytes = (try? FileManager.default.attributesOfItem(atPath: pcm.path)[.size] as? Int) ?? 0
        return Double(bytes / 2) / sampleRate
    }

    private static func ship(_ pcm: URL, levels: String) -> URL? {
        let parts = pcm.deletingPathExtension().lastPathComponent.split(separator: "_")
        guard parts.count == 2, let id = UUID(uuidString: String(parts[0])), let startMs = Double(parts[1]) else { return nil }
        // Pauses are squeezed, so this is talk time (what transcription bills), not wall-clock time.
        let name = Clip.filename(id: id, startedAt: Date(timeIntervalSince1970: startMs / 1000), durationMs: Int64(duration(pcm) * 1000))
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        let dest = Clip.outbox().appendingPathComponent(name)
        do {
            try? FileManager.default.removeItem(at: tmp)
            try encode(pcm, to: tmp)
            try FileManager.default.moveItem(at: tmp, to: dest)
        } catch {
            try? FileManager.default.removeItem(at: tmp)
            return nil
        }
        if !levels.isEmpty { try? levels.write(to: Clip.levelsURL(for: dest), atomically: true, encoding: .utf8) }
        try? FileManager.default.removeItem(at: pcm)
        return dest
    }

    private static func dir() -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Open", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
}

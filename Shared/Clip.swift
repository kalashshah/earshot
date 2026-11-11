import Foundation

/// A finished recording on disk. Its metadata lives in the filename
/// (`<uuid>_<startedAtMs>_<durationMs>.m4a`), so the watch→phone→server hand-offs need no
/// database: whatever is in an outbox folder is what still has to be sent.
struct Clip {
    let url: URL
    let id: String
    let startedAtMs: Int64
    let durationMs: Int64

    static func filename(id: UUID, startedAt: Date, durationMs: Int64) -> String {
        "\(id.uuidString)_\(Int64(startedAt.timeIntervalSince1970 * 1000))_\(durationMs).m4a"
    }

    init?(url: URL) {
        let parts = url.deletingPathExtension().lastPathComponent.split(separator: "_")
        guard url.pathExtension == "m4a", parts.count == 3, UUID(uuidString: String(parts[0])) != nil,
              let started = Int64(parts[1]), let duration = Int64(parts[2]) else { return nil }
        self.url = url
        self.id = String(parts[0])
        self.startedAtMs = started
        self.durationMs = duration
    }

    /// Sidecar with the clip's per-second mic loudness (`ClipWriter.levels`); travels with the clip to the server.
    static func levelsURL(for clip: URL) -> URL { clip.appendingPathExtension("lvl") }

    /// Deletes a clip and its sidecar once the next hop has it.
    static func remove(_ clip: URL) {
        try? FileManager.default.removeItem(at: clip)
        try? FileManager.default.removeItem(at: levelsURL(for: clip))
    }

    static func outbox() -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Outbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func pending() -> [Clip] {
        let urls = (try? FileManager.default.contentsOfDirectory(at: outbox(), includingPropertiesForKeys: nil)) ?? []
        return urls.compactMap(Clip.init(url:)).sorted { $0.startedAtMs < $1.startedAtMs }
    }
}

/// Keys for watch ↔ phone messages.
enum Link {
    static let command = "cmd"        // "start" | "stop" | "status"
    static let isOn = "isOn"
    static let since = "since"        // ms epoch the current session started
    static let error = "error"
    static let pending = "pending"    // clips still on the watch
    static let capturing = "capturing" // a conversation is being recorded right now
    static let token = "token"        // phone → watch device token; "" = unpaired
    static let beat = "beat"          // watch → phone user info, every 10 min while recording: true = still on, false = turned off
    static let levels = "levels"      // file-transfer metadata: the clip's per-second mic loudness
}

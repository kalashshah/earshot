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
}

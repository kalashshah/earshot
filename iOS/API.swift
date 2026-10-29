import Foundation

struct Recording: Decodable, Identifiable, Hashable {
    let id: String
    let startedAt: Int64
    let durationMs: Int64
    let status: String
    let title: String?
    let summary: String?
    let transcript: String?
    let memoriesAdded: Int

    var date: Date { Date(timeIntervalSince1970: Double(startedAt) / 1000) }
    var duration: Duration { .milliseconds(durationMs) }
}

struct Memory: Decodable, Identifiable, Hashable {
    let id: String
    let content: String
    let type: String
    let createdAt: Int64
    var date: Date { Date(timeIntervalSince1970: Double(createdAt) / 1000) }
}

/// Something said in a conversation that someone has to do. `owner` is "you" or the other person.
struct Promise: Decodable, Identifiable, Hashable {
    let id: String
    let owner: String
    let counterpart: String?
    let what: String
    let due: String?
    let draft: String?
    let recordingTitle: String?
    let recordingStartedAt: Int64?

    var mine: Bool { owner == "you" }
    var date: Date? { recordingStartedAt.map { Date(timeIntervalSince1970: Double($0) / 1000) } }
}

/// A dated thing heard in conversation or asked for on the watch: "Your anniversary with Sara".
struct Moment: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let title: String
    let prep: String?
    let ideas: String?
    let time: String?
    let next: String   // YYYY-MM-DD, the next time it happens

    var day: Date? { Reminders.parse(next + "T00:00") }
}

/// Everything to schedule on this phone, from GET /reminders.
struct ReminderSync: Decodable {
    /// One-off notification: `at` is wall-clock time in the user's timezone.
    struct Once: Decodable { let id, at, title, body: String }
    /// Repeats on iOS weekdays (Sunday = 1; empty = every day) at `time` ("HH:MM").
    struct Repeating: Decodable { let id: String; let weekdays: [Int]; let time, title: String }
    /// Fires on arriving at (or leaving) `place`: "grocery store", "home", "Priya's office".
    struct AtPlace: Decodable { let id, title, body, place: String; let leave: Bool }
    let reminders: [Once]
    let repeating: [Repeating]
    let places: [AtPlace]
}

/// A routine or place reminder asked for on the watch.
struct Routine: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String   // "time" | "place"
    let title: String
    let days: String?  // JSON ["mon", "fri"]
    let time: String?
    let place: String?
    let leave: Int?

    var detail: String {
        if kind == "place" { return "\(leave == 1 ? "When you leave" : "When you get to") \(place ?? "")" }
        let names = (try? JSONDecoder().decode([String].self, from: Data((days ?? "[]").utf8))) ?? []
        return "\(names.isEmpty ? "Every day" : names.map(\.capitalized).joined(separator: ", ")) at \(time ?? "")"
    }
}

struct PrepCard: Decodable {
    let card: String
    let bullets: [String]
}

/// Error body the server sends with 4xx/5xx: {"error": "..."}.
private struct ServerError: Decodable { let error: String }

enum API {
    static func recordings(before: Int64? = nil) async throws -> [Recording] {
        var path = "recordings?limit=30"
        if let before { path += "&before=\(before)" }
        struct R: Decodable { let recordings: [Recording] }
        return try await get(path, as: R.self).recordings
    }

    static func memories(offset: Int = 0) async throws -> [Memory] {
        struct R: Decodable { let memories: [Memory] }
        return try await get("memories?limit=50&offset=\(offset)", as: R.self).memories
    }

    static func searchMemories(_ query: String) async throws -> [Memory] {
        struct R: Decodable { let memories: [Memory] }
        return try await send("memories/search", method: "POST", body: ["query": query], as: R.self).memories
    }

    static func retry(_ id: String) async throws {
        struct R: Decodable { let status: String? }
        _ = try await send("recordings/\(id)/retry", method: "POST", as: R.self)
    }

    static func delete(_ id: String) async throws {
        struct R: Decodable { let ok: Bool? }
        _ = try await send("recordings/\(id)", method: "DELETE", as: R.self)
    }

    static func promises() async throws -> [Promise] {
        struct R: Decodable { let actions: [Promise] }
        return try await get("actions?status=open", as: R.self).actions
    }

    /// status: "done" | "dismissed"
    static func close(_ id: String, status: String) async throws {
        struct R: Decodable { let ok: Bool? }
        _ = try await send("actions/\(id)", method: "PATCH", body: ["status": status], as: R.self)
    }

    static func moments() async throws -> [Moment] {
        struct R: Decodable { let moments: [Moment] }
        return try await get("moments", as: R.self).moments
    }

    static func forget(moment id: String) async throws {
        struct R: Decodable { let ok: Bool? }
        _ = try await send("moments/\(id)", method: "DELETE", as: R.self)
    }

    static func reminders() async throws -> ReminderSync {
        try await get("reminders", as: ReminderSync.self)
    }

    static func routines() async throws -> [Routine] {
        struct R: Decodable { let routines: [Routine] }
        return try await get("routines", as: R.self).routines
    }

    static func forget(routine id: String) async throws {
        struct R: Decodable { let ok: Bool? }
        _ = try await send("routines/\(id)", method: "DELETE", as: R.self)
    }

    static func prep(title: String, attendees: [String]) async throws -> PrepCard {
        struct B: Encodable { let title: String; let attendees: [String] }
        return try await send("prep", method: "POST", body: B(title: title, attendees: attendees), as: PrepCard.self)
    }

    private static func get<T: Decodable>(_ path: String, as: T.Type) async throws -> T {
        try await send(path, method: "GET", as: T.self)
    }

    /// Exchanges a pairing code from the website (Settings → Pair your iPhone) for this device's token.
    /// `verifier` is set when the code came from in-app sign-in (bound to its challenge).
    static func claim(code: String, name: String, verifier: String? = nil) async throws -> String {
        struct R: Decodable { let token: String }
        struct B: Encodable { let code: String; let name: String; let verifier: String? }
        return try await send("devices/claim", method: "POST", body: B(code: code, name: name, verifier: verifier), auth: false, as: R.self).token
    }

    private static func send<T: Decodable>(_ path: String, method: String, body: (any Encodable)? = nil, auth: Bool = true, as: T.Type) async throws -> T {
        var req = URLRequest(url: URL(string: path, relativeTo: Secrets.apiBase)!)
        req.httpMethod = method
        if auth { req = try DeviceToken.authorize(req) }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, res) = try await URLSession.shared.data(for: req)
        if auth { DeviceToken.check(res, for: req) }
        guard let http = res as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? String(data: data, encoding: .utf8) ?? "Request failed"
            throw URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey: message])
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }
}

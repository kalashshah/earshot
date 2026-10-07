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

    private static func get<T: Decodable>(_ path: String, as: T.Type) async throws -> T {
        try await send(path, method: "GET", as: T.self)
    }

    private static func send<T: Decodable>(_ path: String, method: String, body: [String: String]? = nil, as: T.Type) async throws -> T {
        var req = URLRequest(url: URL(string: path, relativeTo: Secrets.apiBase)!)
        req.httpMethod = method
        req.setValue("Bearer \(Secrets.appToken)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey: String(data: data, encoding: .utf8) ?? "Request failed"])
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }
}

import SwiftUI
import WatchConnectivity

/// "What did Sam say about the launch?" — dictate a question, get an answer from your conversations.
/// Calls the server directly (the watch has network through the phone); the recorder keeps running.
struct AskButton: View {
    @State private var question: String?

    var body: some View {
        TextFieldLink(prompt: Text("Ask your memory")) {
            ParticleQuestion().frame(width: 40, height: 44)
        } onSubmit: { q in
            let q = q.trimmingCharacters(in: .whitespacesAndNewlines)
            if !q.isEmpty { question = q }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ask")
        .sheet(isPresented: Binding(get: { question != nil }, set: { if !$0 { question = nil } })) {
            if let question { AskView(question: question) }
        }
    }
}

/// A "?" made of the orb's grey dots, each twinkling on its own, floating a little: Earshot's own
/// button rather than a toolbar blob.
private struct ParticleQuestion: View {
    @State private var born = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isLuminanceReduced) private var dimmed

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || dimmed)) { tl in
            let t = reduceMotion ? 0 : tl.date.timeIntervalSince(born)
            Canvas { ctx, size in
                ctx.blendMode = .plusLighter
                let step: CGFloat = 2.6
                for gy in stride(from: step / 2, to: size.height, by: step) {
                    for gx in stride(from: step / 2, to: size.width, by: step) {
                        let seed = Double(gx * 12.9 + gy * 78.2)
                        let jitter = sin(seed) * 0.3
                        let glow = 0.55 + 0.4 * sin(t * 1.8 + seed)
                        let d: CGFloat = 1.5
                        let rect = CGRect(x: gx - d / 2 + jitter, y: gy - d / 2, width: d, height: d)
                        ctx.fill(Path(ellipseIn: rect), with: .color(Color(white: 0.8).opacity(glow)))
                    }
                }
            }
            .mask(Text("?").font(.system(size: 42, weight: .black, design: .rounded)))
            .offset(y: sin(t * 1.4) * 1.5)
        }
        .onAppear { born = Date() }
    }
}

private struct Answer: Decodable {
    struct Source: Decodable, Identifiable {
        let id: String
        let startedAt: Int64
        let title: String?
        var date: Date { Date(timeIntervalSince1970: Double(startedAt) / 1000) }
    }
    let answer: String
    let sources: [Source]
    let remembered: Bool?
}

private struct AskView: View {
    let question: String
    @State private var answer: Answer?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(question).font(.footnote).foregroundStyle(Color(white: 0.6))
                if let answer {
                    Text(answer.answer).foregroundStyle(.white)
                    ForEach(answer.sources) { s in
                        Text("\(s.title ?? "Conversation") · \(s.date.formatted(.dateTime.weekday(.abbreviated).hour().minute()))")
                            .font(.caption2).foregroundStyle(Color(white: 0.6))
                    }
                } else if let error {
                    Text(error).font(.footnote).foregroundStyle(.orange)
                    Button("Try again") { Task { await ask() } }
                } else {
                    ProgressView("Thinking…").frame(maxWidth: .infinity)
                }
            }
        }
        .task { await ask() }
    }

    private func ask() async {
        error = nil
        do {
            var req = URLRequest(url: URL(string: "ask", relativeTo: Secrets.apiBase)!)
            req.httpMethod = "POST"
            req.timeoutInterval = 60
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(["question": question])
            req = try DeviceToken.authorize(req)
            let (data, res) = try await URLSession.shared.data(for: req)
            DeviceToken.check(res, for: req)
            guard (res as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) == true else {
                throw URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey: String(data: data, encoding: .utf8) ?? "Request failed"])
            }
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            answer = try decoder.decode(Answer.self, from: data)
            // "remind me…" was saved: have the phone schedule it (transferUserInfo queues if it's away)
            if answer?.remembered == true { WCSession.default.transferUserInfo(["sync": true]) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

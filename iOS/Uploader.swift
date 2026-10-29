import Foundation
import SoundAnalysis

/// Uploads outbox clips with a background URLSession, so uploads finish even after the app
/// is suspended or killed. A clip leaves the outbox only after the server accepted it.
final class Uploader: NSObject, ObservableObject, URLSessionTaskDelegate {
    static let shared = Uploader()
    static let sessionID = "com.kalashshah.earshot.upload"

    @Published private(set) var pending = Clip.pending().count
    @Published private(set) var lastUploadAt: Date?
    var backgroundCompletion: (() -> Void)?

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionID)
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    /// Starts an upload for every outbox clip that doesn't already have one in flight.
    func flush() {
        session.getAllTasks { tasks in
            let inFlight = Set(tasks.compactMap(\.taskDescription))
            for clip in Clip.pending() where !inFlight.contains(clip.url.lastPathComponent) {
                var req = URLRequest(url: Secrets.apiBase.appendingPathComponent("recordings/\(clip.id)"))
                req.httpMethod = "PUT"
                // Read at upload time; unpaired clips wait in the outbox until pairing flushes again.
                guard let authed = try? DeviceToken.authorize(req) else { break }
                req = authed
                req.setValue("audio/mp4", forHTTPHeaderField: "Content-Type")
                req.setValue(String(clip.startedAtMs), forHTTPHeaderField: "x-started-at")
                req.setValue(String(clip.durationMs), forHTTPHeaderField: "x-duration-ms")
                if let sounds = Self.listen(clip.url) {
                    req.setValue(String(sounds.music), forHTTPHeaderField: "x-music")
                    if !sounds.ambient.isEmpty { req.setValue(sounds.ambient, forHTTPHeaderField: "x-ambient") }
                }
                let task = self.session.uploadTask(with: req, fromFile: clip.url)
                task.taskDescription = clip.url.lastPathComponent
                task.resume()
            }
            self.refresh()
        }
    }

    /// What else the clip sounds like, from Apple's on-device classifier (a few seconds a clip):
    /// `music` is the share (0–100) with music in it — a film or show on nearby scores 17–32, a call under 6 —
    /// and the server uses it to keep a film's dialogue out of your memories. `ambient` names the non-speech
    /// sounds heard through a good part of the clip ("crowd, dishes", "vehicle car"), so the model knows the setting.
    private static func listen(_ url: URL) -> (music: Int, ambient: String)? {
        guard let analyzer = try? SNAudioFileAnalyzer(url: url),
              let request = try? SNClassifySoundRequest(classifierIdentifier: .version1) else { return nil }
        let counter = SoundCounter()
        guard (try? analyzer.add(request, withObserver: counter)) != nil else { return nil }
        analyzer.analyze()
        guard counter.windows > 0 else { return nil }
        // ponytail: ≥15% of windows, top 3 — tune after a day of real clips.
        let ambient = counter.heard.filter { $0.value * 100 >= counter.windows * 15 }
            .sorted { $0.value > $1.value }.prefix(3)
            .map { $0.key.replacingOccurrences(of: "_", with: " ") }.joined(separator: ", ")
        return (100 * counter.music / counter.windows, ambient)
    }

    private func refresh() {
        let n = Clip.pending().count
        DispatchQueue.main.async { self.pending = n }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
        DeviceToken.check(task.response, for: task.originalRequest)
        if error == nil, (200..<300).contains(status), let name = task.taskDescription {
            try? FileManager.default.removeItem(at: Clip.outbox().appendingPathComponent(name))
            DispatchQueue.main.async { self.lastUploadAt = Date() }
        }
        // Failures stay in the outbox; the next flush (new clip / app foreground) retries them.
        refresh()
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.backgroundCompletion?()
            self.backgroundCompletion = nil
        }
    }
}

private final class SoundCounter: NSObject, SNResultsObserving {
    var windows = 0, music = 0
    var heard: [String: Int] = [:]   // non-speech label → windows it was confidently in
    func request(_ request: SNRequest, didProduce result: SNResult) {
        guard let c = result as? SNClassificationResult else { return }
        windows += 1
        if (c.classification(forIdentifier: "music")?.confidence ?? 0) >= 0.3 { music += 1 }
        for k in c.classifications where k.confidence >= 0.3 && k.identifier != "speech" && k.identifier != "music" {
            heard[k.identifier, default: 0] += 1
        }
    }
}

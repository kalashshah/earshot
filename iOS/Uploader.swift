import Foundation

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
                req.setValue("Bearer \(Secrets.appToken)", forHTTPHeaderField: "Authorization")
                req.setValue("audio/mp4", forHTTPHeaderField: "Content-Type")
                req.setValue(String(clip.startedAtMs), forHTTPHeaderField: "x-started-at")
                req.setValue(String(clip.durationMs), forHTTPHeaderField: "x-duration-ms")
                let task = self.session.uploadTask(with: req, fromFile: clip.url)
                task.taskDescription = clip.url.lastPathComponent
                task.resume()
            }
            self.refresh()
        }
    }

    private func refresh() {
        let n = Clip.pending().count
        DispatchQueue.main.async { self.pending = n }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
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

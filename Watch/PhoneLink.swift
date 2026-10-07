import Foundation
import WatchConnectivity

/// Ships finished clips to the iPhone and takes start/stop commands from it.
/// `transferFile` queues while the phone is away and survives app relaunches; the clip is
/// deleted only once the phone confirms receipt.
final class PhoneLink: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = PhoneLink()
    @Published private(set) var pending = 0

    private let recorder = Recorder.shared

    func activate() {
        recorder.onClip = { [weak self] url in self?.send(url) }
        recorder.onStateChange = { [weak self] in self?.pushState() }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func send(_ url: URL) {
        guard WCSession.default.activationState == .activated else { refreshPending(); return }
        WCSession.default.transferFile(url, metadata: nil)
        refreshPending()
    }

    /// Re-queue anything in the outbox the session isn't already carrying (e.g. after a failed
    /// transfer or an app relaunch).
    private func flush() {
        let inFlight = Set(WCSession.default.outstandingFileTransfers.map { $0.file.fileURL.lastPathComponent })
        for clip in Clip.pending() where !inFlight.contains(clip.url.lastPathComponent) {
            WCSession.default.transferFile(clip.url, metadata: nil)
        }
        refreshPending()
    }

    private func refreshPending() {
        let n = Clip.pending().count
        DispatchQueue.main.async { self.pending = n; self.pushState() }
    }

    private func state() -> [String: Any] {
        var s: [String: Any] = [Link.isOn: recorder.isOn, Link.pending: Clip.pending().count]
        if let since = recorder.since { s[Link.since] = Int64(since.timeIntervalSince1970 * 1000) }
        if let e = recorder.lastError { s[Link.error] = e }
        return s
    }

    private func pushState() {
        guard WCSession.default.activationState == .activated else { return }
        try? WCSession.default.updateApplicationContext(state())
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated { DispatchQueue.main.async { self.flush() } }
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        if error == nil { try? FileManager.default.removeItem(at: fileTransfer.file.fileURL) }
        refreshPending()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async {
            switch message[Link.command] as? String {
            case "start": self.recorder.start()
            case "stop": self.recorder.stop()
            default: break
            }
            // start() finishes asynchronously (mic permission); reply once it settles.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { replyHandler(self.state()) }
        }
    }
}

import Foundation
import WatchConnectivity

/// Receives clips from the watch (the system wakes this app in the background to deliver them)
/// and relays start/stop commands.
final class WatchLink: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchLink()

    @Published private(set) var isOn = false
    @Published private(set) var since: Date?
    @Published private(set) var watchPending = 0
    @Published private(set) var error: String?
    @Published private(set) var reachable = false
    @Published private(set) var paired = false
    @Published private(set) var installed = false
    @Published private(set) var busy = false

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func setRecording(_ on: Bool) {
        guard WCSession.default.isReachable else {
            error = on ? "Open Earshot on your watch to start recording." : "Watch isn't reachable right now."
            return
        }
        busy = true
        WCSession.default.sendMessage([Link.command: on ? "start" : "stop"], replyHandler: { reply in
            DispatchQueue.main.async { self.busy = false; self.apply(reply) }
        }, errorHandler: { err in
            DispatchQueue.main.async { self.busy = false; self.error = err.localizedDescription }
        })
    }

    private func apply(_ state: [String: Any]) {
        isOn = state[Link.isOn] as? Bool ?? false
        since = (state[Link.since] as? Int64).map { Date(timeIntervalSince1970: Double($0) / 1000) }
        watchPending = state[Link.pending] as? Int ?? 0
        error = state[Link.error] as? String
    }

    private func refreshDeviceState(_ session: WCSession) {
        DispatchQueue.main.async {
            self.reachable = session.isReachable
            self.paired = session.isPaired
            self.installed = session.isWatchAppInstalled
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        refreshDeviceState(session)
        let ctx = session.receivedApplicationContext
        if !ctx.isEmpty { DispatchQueue.main.async { self.apply(ctx) } }
    }

    func sessionReachabilityDidChange(_ session: WCSession) { refreshDeviceState(session) }
    func sessionWatchStateDidChange(_ session: WCSession) { refreshDeviceState(session) }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async { self.apply(applicationContext) }
    }

    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        // The system deletes `file.fileURL` when this returns: move it synchronously.
        let name = file.fileURL.lastPathComponent
        let dest = Clip.outbox().appendingPathComponent(name)
        guard Clip(url: dest) != nil else { return }
        try? FileManager.default.removeItem(at: dest)
        try? FileManager.default.moveItem(at: file.fileURL, to: dest)
        Uploader.shared.flush()
    }
}

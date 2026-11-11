import Foundation
import WatchConnectivity

/// Ships finished clips to the iPhone and takes start/stop commands and the device token from it.
/// `transferFile` queues while the phone is away and survives app relaunches; the clip is
/// deleted only once the phone confirms receipt.
final class PhoneLink: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = PhoneLink()
    @Published private(set) var pending = 0

    private let recorder = Recorder.shared
    private var beating = false
    private var beat: Timer?

    func activate() {
        recorder.onClip = { [weak self] _ in self?.flush() }
        recorder.onStateChange = { [weak self] in self?.pushState() }
        WCSession.default.delegate = self
        WCSession.default.activate()
        // If watchOS kills the app mid-recording nothing here can say so. The phone can: each beat pushes back a
        // notification on the phone, which fires once the beats stop.
        beat = Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in
            guard let self, self.beating, WCSession.default.activationState == .activated else { return }
            WCSession.default.transferUserInfo([Link.beat: true])
        }
    }

    /// Queue everything in the outbox the session isn't already carrying: the new clip, and any whose
    /// transfer failed earlier or that a previous run left behind.
    private func flush() {
        guard WCSession.default.activationState == .activated else { refreshPending(); return }
        let inFlight = Set(WCSession.default.outstandingFileTransfers.map { $0.file.fileURL.lastPathComponent })
        for clip in Clip.pending() where !inFlight.contains(clip.url.lastPathComponent) {
            let levels = try? String(contentsOf: Clip.levelsURL(for: clip.url), encoding: .utf8)
            WCSession.default.transferFile(clip.url, metadata: levels.map { [Link.levels: $0] })
        }
        refreshPending()
    }

    private func refreshPending() {
        let n = Clip.pending().count
        DispatchQueue.main.async { self.pending = n; self.pushState() }
    }

    private func state() -> [String: Any] {
        var s: [String: Any] = [Link.isOn: recorder.isOn, Link.capturing: recorder.inConversation, Link.pending: Clip.pending().count]
        if let since = recorder.since { s[Link.since] = Int64(since.timeIntervalSince1970 * 1000) }
        if let e = recorder.lastError { s[Link.error] = e }
        return s
    }

    private func pushState() {
        guard WCSession.default.activationState == .activated else { return }
        try? WCSession.default.updateApplicationContext(state())
        if recorder.isOn != beating {
            beating = recorder.isOn
            WCSession.default.transferUserInfo([Link.beat: beating])
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated { DispatchQueue.main.async { self.flush() } }
        applyToken(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        applyToken(applicationContext)
    }

    private func applyToken(_ ctx: [String: Any]) {
        #if DEBUG
        // simulator WatchConnectivity is unreliable: `SIMCTL_CHILD_EARSHOT_TOKEN=… simctl launch` hands the token over directly
        if let t = ProcessInfo.processInfo.environment["EARSHOT_TOKEN"] { return DispatchQueue.main.async { DeviceToken.save(t) } }
        #endif
        guard let token = ctx[Link.token] as? String else { return }
        token.isEmpty ? DeviceToken.clear() : DeviceToken.save(token)
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        if error == nil { Clip.remove(fileTransfer.file.fileURL) }
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

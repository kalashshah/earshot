import Foundation
import WatchConnectivity
import UserNotifications

/// Receives clips from the watch (the system wakes this app in the background to deliver them)
/// and relays start/stop commands. Also hands the device token to the watch via application context.
final class WatchLink: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchLink()

    @Published private(set) var isOn = false
    @Published private(set) var capturing = false
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
        NotificationCenter.default.addObserver(forName: DeviceToken.changed, object: nil, queue: nil) { [weak self] _ in self?.pushToken() }
    }

    /// The context persists, so the watch gets the latest token whenever its app next runs.
    private func pushToken() {
        let s = WCSession.default
        guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        try? s.updateApplicationContext([Link.token: DeviceToken.current ?? ""])
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
        capturing = isOn && (state[Link.capturing] as? Bool ?? false)
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
        pushToken()
        let ctx = session.receivedApplicationContext
        if !ctx.isEmpty { DispatchQueue.main.async { self.apply(ctx) } }
    }

    func sessionReachabilityDidChange(_ session: WCSession) { refreshDeviceState(session) }
    func sessionWatchStateDidChange(_ session: WCSession) { refreshDeviceState(session); pushToken() }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async { self.apply(applicationContext) }
    }

    // The watch saved a reminder ("remind me…"): this wakes the app in the background to schedule it.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let on = userInfo[Link.beat] as? Bool { return Self.armSilenceAlarm(on) }
        Task { await Reminders.sync() }
    }

    /// The watch sends a beat every 10 minutes while it records. Each one pushes this notification 30 minutes out,
    /// so it only fires when the beats stop without the watch saying it was turned off: the app was killed, or
    /// the watch died or went out of range.
    private static func armSilenceAlarm(_ on: Bool) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["watch-silent"])
        guard on else { return }
        center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
        let content = UNMutableNotificationContent()
        content.title = "Earshot may have stopped"
        content.body = "Your watch hasn't checked in for 30 minutes. If you meant to be recording, open Earshot on the watch."
        content.sound = .default
        center.add(UNNotificationRequest(identifier: "watch-silent", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 30 * 60, repeats: false)))
    }

    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        // The system deletes `file.fileURL` when this returns: move it synchronously.
        let name = file.fileURL.lastPathComponent
        let dest = Clip.outbox().appendingPathComponent(name)
        guard Clip(url: dest) != nil else { return }
        try? FileManager.default.removeItem(at: dest)
        try? FileManager.default.moveItem(at: file.fileURL, to: dest)
        if let levels = file.metadata?[Link.levels] as? String {
            try? levels.write(to: Clip.levelsURL(for: dest), atomically: true, encoding: .utf8)
        }
        Uploader.shared.flush()
    }
}

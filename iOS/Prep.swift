import BackgroundTasks
import EventKit
import SwiftUI
import UserNotifications

/// Before each meeting in the next two hours, asks the server for a prep card and schedules it as a
/// notification 10 minutes before the start. With the phone locked, iOS mirrors it to the watch.
/// Runs when the app becomes active and from a ~30-minute background refresh, which also re-syncs reminders.
@MainActor
final class Prep: ObservableObject {
    static let shared = Prep()
    nonisolated static let taskID = "com.kalashshah.earshot.prep"

    @Published private(set) var status: String?
    @Published private(set) var running = false

    private let store = EKEventStore()
    private let preppedKey = "preppedEvents"

    var authorized: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }

    /// Called from the "Prep me before meetings" row, never on launch.
    func enable() async {
        do {
            guard try await store.requestFullAccessToEvents() else {
                status = "Calendar access is off. Enable it in Settings → Privacy → Calendars."
                return
            }
        } catch {
            status = error.localizedDescription
            return
        }
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
        objectWillChange.send()   // `authorized` flipped
        schedule()
        await run()
    }

    // MARK: background refresh

    /// Must be called before the app finishes launching.
    nonisolated static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskID, using: nil) { task in
            Task { @MainActor in
                Prep.shared.schedule()
                let work = Task { await Reminders.sync(); await Prep.shared.run() }
                task.expirationHandler = { work.cancel() }
                await work.value
                task.setTaskCompleted(success: true)
            }
        }
    }

    func schedule() {
        let req = BGAppRefreshTaskRequest(identifier: Self.taskID)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)   // iOS decides the real time
        try? BGTaskScheduler.shared.submit(req)
    }

    // MARK: the check

    func run() async {
        guard authorized, !running else { return }
        running = true
        defer { running = false }

        let now = Date()
        let events = store.events(matching: store.predicateForEvents(withStart: now, end: now.addingTimeInterval(2 * 3600), calendars: nil))
            .filter { !$0.isAllDay && $0.startDate > now }
        var prepped = UserDefaults.standard.stringArray(forKey: preppedKey) ?? []
        var sent = 0, failed: String?

        for event in events {
            let key = "\(event.eventIdentifier ?? event.title ?? "")@\(Int(event.startDate.timeIntervalSince1970))"
            guard !prepped.contains(key), !Task.isCancelled else { continue }
            let title = event.title ?? "Meeting"
            let attendees = (event.attendees ?? []).filter { !$0.isCurrentUser }.compactMap(\.name)
            do {
                let prep = try await API.prep(title: title, attendees: attendees)
                try await notify(id: key, title: title, card: prep, at: event.startDate.addingTimeInterval(-10 * 60))
                prepped.append(key)
                sent += 1
            } catch {
                failed = error.localizedDescription
            }
        }

        // ponytail: keeps the last 200 keys; only events in the next 2 h ever get looked up.
        UserDefaults.standard.set(Array(prepped.suffix(200)), forKey: preppedKey)
        if let failed { status = "Couldn't prep: \(failed)" }
        else if events.isEmpty { status = "No meetings in the next 2 hours" }
        else { status = sent > 0 ? "Prepped \(sent) meeting\(sent == 1 ? "" : "s")" : "Upcoming meetings already prepped" }
    }

    private func notify(id: String, title: String, card: PrepCard, at date: Date) async throws {
        let content = UNMutableNotificationContent()
        content.title = "Before \(title)"
        content.body = ([card.card] + card.bullets.map { "• \($0)" }).joined(separator: "\n")
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(5, date.timeIntervalSinceNow), repeats: false)
        try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }

    /// Debug: forget what was prepped so "Prep now" re-sends upcoming meetings.
    func prepNow() async {
        UserDefaults.standard.removeObject(forKey: preppedKey)
        await run()
    }
}

/// The meeting-prep row on the Record tab: opt in, then "Prep now".
struct PrepRow: View {
    @ObservedObject private var prep = Prep.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Label("Meeting prep", systemImage: "calendar.badge.clock").foregroundStyle(.secondary)
                Spacer()
                if prep.running {
                    ProgressView()
                } else if prep.authorized {
                    Button("Prep now") { Task { await prep.prepNow() } }
                } else {
                    Button("Turn on") { Task { await prep.enable() } }
                }
            }
            Text(prep.status ?? (prep.authorized
                ? "A card on your wrist 10 minutes before each meeting."
                : "Reads your calendar to brief you before meetings."))
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

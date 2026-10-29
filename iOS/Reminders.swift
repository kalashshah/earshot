import CoreLocation
import Foundation
import UserNotifications

/// Earshot's reminders as local notifications: dates and promise due dates once, routines on repeat, and
/// errands when you arrive at or leave a place. They fire with the app closed, and with the phone locked
/// iOS shows them on the watch. Each sync replaces everything Earshot scheduled with the server's list.
enum Reminders {
    private static let prefix = "r:"

    static func sync() async {
        guard DeviceToken.current != nil, let sync = try? await API.reminders() else { return }
        let center = UNUserNotificationCenter.current()
        if !(sync.reminders.isEmpty && sync.repeating.isEmpty && sync.places.isEmpty) {
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
        }
        let old = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: old)

        func add(_ id: String, _ title: String, _ body: String, _ trigger: UNNotificationTrigger) async {
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            try? await center.add(UNNotificationRequest(identifier: prefix + id, content: content, trigger: trigger))
        }

        // ponytail: iOS keeps 64 pending per app and 20 regions; these caps leave room for meeting prep.
        for r in sync.repeating.prefix(8) {
            let hm = r.time.split(separator: ":").compactMap { Int($0) }
            guard hm.count == 2 else { continue }
            for day in r.weekdays.isEmpty ? [nil] : r.weekdays.map(Optional.some) {
                let when = DateComponents(hour: hm[0], minute: hm[1], weekday: day)
                await add("\(r.id):\(day ?? 0)", r.title, "", UNCalendarNotificationTrigger(dateMatching: when, repeats: true))
            }
        }
        for item in sync.reminders.prefix(40) {
            guard let date = parse(item.at), date > .now else { continue }
            let when = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
            await add(item.id, item.title, item.body, UNCalendarNotificationTrigger(dateMatching: when, repeats: false))
        }
        var regions = 0
        for p in sync.places {
            for (i, spot) in await Places.shared.spots(for: p.place).enumerated() where regions < 18 {
                let region = CLCircularRegion(center: spot, radius: 150, identifier: "\(p.id):\(i)")
                region.notifyOnEntry = !p.leave
                region.notifyOnExit = p.leave
                await add("\(p.id):\(i)", p.title, p.body, UNLocationNotificationTrigger(region: region, repeats: false))
                regions += 1
            }
        }
        await Places.shared.noteMissing(sync.places.map(\.place))
    }

    /// "2026-11-01T09:00" in this device's timezone.
    static func parse(_ s: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return f.date(from: s)
    }
}

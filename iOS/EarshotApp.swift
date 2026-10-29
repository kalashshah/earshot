import SwiftUI
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        WatchLink.shared.activate()
        Uploader.shared.flush()
        Prep.register()
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // Show prep cards even while the app is open (e.g. right after "Prep now").
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        Uploader.shared.backgroundCompletion = completionHandler
    }
}

@main
struct EarshotApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @Environment(\.scenePhase) private var phase
    @State private var paired = DeviceToken.current != nil

    var body: some Scene {
        WindowGroup {
            Group { if paired { tabs } else { PairView() } }
                // Pairing, unpairing, or a 401 anywhere (device removed on the website).
                .onReceive(NotificationCenter.default.publisher(for: DeviceToken.changed)) { _ in
                    paired = DeviceToken.current != nil
                }
        }
        .onChange(of: phase) { _, phase in
            guard phase == .active, paired else { return }
            Uploader.shared.flush()
            Task { await Reminders.sync(); await Prep.shared.run(); Prep.shared.schedule() }
        }
    }

    private var tabs: some View {
        TabView {
            RecordView().tabItem { Label("Record", systemImage: "applewatch.radiowaves.left.and.right") }
            ConversationsView().tabItem { Label("Conversations", systemImage: "text.bubble") }
            PromisesView().tabItem { Label("Reminders", systemImage: "bell") }
            MemoriesView().tabItem { Label("Memories", systemImage: "brain") }
        }
        .tint(.ember)
        .task { await Reminders.sync() }   // right after signing in
    }
}

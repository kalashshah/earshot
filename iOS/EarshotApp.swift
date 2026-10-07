import SwiftUI

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        WatchLink.shared.activate()
        Uploader.shared.flush()
        return true
    }

    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        Uploader.shared.backgroundCompletion = completionHandler
    }
}

@main
struct EarshotApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            TabView {
                RecordView().tabItem { Label("Record", systemImage: "applewatch.radiowaves.left.and.right") }
                ConversationsView().tabItem { Label("Conversations", systemImage: "text.bubble") }
                MemoriesView().tabItem { Label("Memories", systemImage: "brain") }
            }
            .tint(.red)
        }
        .onChange(of: phase) { _, phase in
            if phase == .active { Uploader.shared.flush() }
        }
    }
}

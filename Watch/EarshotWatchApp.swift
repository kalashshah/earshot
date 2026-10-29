import SwiftUI

@main
struct EarshotWatchApp: App {
    init() { PhoneLink.shared.activate() }

    var body: some Scene {
        WindowGroup { NavigationStack { WatchHome() }.tint(.ember) }
    }
}

struct WatchHome: View {
    @ObservedObject private var recorder = Recorder.shared
    @ObservedObject private var link = PhoneLink.shared
    @State private var paired = DeviceToken.current != nil

    var body: some View {
        VStack(spacing: 10) {
            Button {
                recorder.isOn ? recorder.stop() : recorder.start()
            } label: {
                ZStack {
                    ParticleOrb(level: recorder.level, active: recorder.isOn, count: 220, dotSize: 2.4)
                    if !recorder.isOn {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(Color.ember)
                    }
                }
                .frame(width: 110, height: 110)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(recorder.isOn ? "Stop recording" : "Start recording")

            ListeningBars(level: recorder.level, active: recorder.isOn, bars: 12)
                .frame(width: 60, height: 14)
            Text(status).font(.headline)
            if let since = recorder.since {
                Text("Since \(since.formatted(date: .omitted, time: .shortened))")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let error = recorder.lastError {
                Text(error).font(.footnote).foregroundStyle(.orange).multilineTextAlignment(.center)
            } else if link.pending > 0 {
                Text("\(link.pending) waiting for iPhone").font(.footnote).foregroundStyle(.secondary)
            } else if recorder.clipsToday > 0 {
                Text("\(recorder.clipsToday) sent").font(.footnote).foregroundStyle(.secondary)
            }
            if !paired {
                Text("Open Earshot on your iPhone to pair").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
        .toolbar {
            if paired { ToolbarItem(placement: .topBarTrailing) { AskButton() } }
        }
        .onReceive(NotificationCenter.default.publisher(for: DeviceToken.changed)) { _ in paired = DeviceToken.current != nil }
    }

    private var status: String {
        guard recorder.isOn else { return "Off" }
        return recorder.inConversation ? "Capturing" : "Listening"
    }
}

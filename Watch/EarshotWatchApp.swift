import SwiftUI

@main
struct EarshotWatchApp: App {
    init() { PhoneLink.shared.activate() }

    var body: some Scene {
        WindowGroup { WatchHome() }
    }
}

struct WatchHome: View {
    @ObservedObject private var recorder = Recorder.shared
    @ObservedObject private var link = PhoneLink.shared

    var body: some View {
        VStack(spacing: 10) {
            Button {
                recorder.isOn ? recorder.stop() : recorder.start()
            } label: {
                ZStack {
                    Circle()
                        .fill(recorder.isOn ? Color.red.gradient : Color.gray.opacity(0.35).gradient)
                    Image(systemName: recorder.isOn ? (recorder.inConversation ? "waveform" : "ear") : "mic.slash")
                        .font(.system(size: 34, weight: .semibold))
                        .symbolEffect(.variableColor.iterative, isActive: recorder.inConversation)
                        .foregroundStyle(.white)
                }
                .frame(width: 96, height: 96)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(recorder.isOn ? "Stop recording" : "Start recording")

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
        }
    }

    private var status: String {
        guard recorder.isOn else { return "Off" }
        return recorder.inConversation ? "Capturing" : "Listening"
    }
}

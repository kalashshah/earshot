import SwiftUI

// MARK: Record

struct RecordView: View {
    @ObservedObject private var watch = WatchLink.shared
    @ObservedObject private var uploader = Uploader.shared

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Spacer()
                Button {
                    watch.setRecording(!watch.isOn)
                } label: {
                    ZStack {
                        Circle()
                            .fill(watch.isOn ? Color.red.gradient : Color.secondary.opacity(0.25).gradient)
                            .shadow(color: watch.isOn ? .red.opacity(0.4) : .clear, radius: 24)
                        if watch.busy {
                            ProgressView().tint(.white).controlSize(.large)
                        } else {
                            Image(systemName: watch.isOn ? "stop.fill" : "mic.fill")
                                .font(.system(size: 54, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(width: 180, height: 180)
                }
                .buttonStyle(.plain)
                .disabled(watch.busy)
                .accessibilityLabel(watch.isOn ? "Stop recording on watch" : "Start recording on watch")

                VStack(spacing: 6) {
                    Text(watch.isOn ? "Recording on your watch" : "Not recording")
                        .font(.title2.bold())
                    if let since = watch.since, watch.isOn {
                        Text("Since \(since.formatted(date: .omitted, time: .shortened))")
                            .foregroundStyle(.secondary)
                    }
                    if let error = watch.error {
                        Text(error).font(.callout).foregroundStyle(.orange).multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal)

                Spacer()

                VStack(alignment: .leading, spacing: 10) {
                    StatusRow(icon: "applewatch", label: "Watch", value: watchStatus)
                    StatusRow(icon: "arrow.up.circle", label: "Waiting to upload", value: "\(uploader.pending + watch.watchPending)")
                    if let last = uploader.lastUploadAt {
                        StatusRow(icon: "checkmark.circle", label: "Last upload", value: last.formatted(.relative(presentation: .named)))
                    }
                }
                .padding()
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal)

                Text("Only conversations are kept: silence is skipped on the watch, and very short clips are dropped.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .padding(.bottom)
            .navigationTitle("Earshot")
        }
    }

    private var watchStatus: String {
        if !watch.paired { return "Not paired" }
        if !watch.installed { return "App not installed" }
        return watch.reachable ? "Connected" : "Not reachable"
    }
}

private struct StatusRow: View {
    let icon: String, label: String, value: String
    var body: some View {
        HStack {
            Label(label, systemImage: icon).foregroundStyle(.secondary)
            Spacer()
            Text(value).monospacedDigit()
        }
    }
}

// MARK: Conversations

@MainActor
final class ConversationsModel: ObservableObject {
    @Published var items: [Recording] = []
    @Published var error: String?
    @Published var loading = false
    private var exhausted = false

    func reload() async {
        exhausted = false
        await load(before: nil)
    }

    func loadMore(after item: Recording) async {
        guard item.id == items.last?.id, !exhausted, !loading else { return }
        await load(before: item.startedAt)
    }

    private func load(before: Int64?) async {
        loading = true
        defer { loading = false }
        do {
            let page = try await API.recordings(before: before)
            exhausted = page.count < 30
            items = before == nil ? page : items + page
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func retry(_ r: Recording) async {
        try? await API.retry(r.id)
        await reload()
    }

    func delete(_ r: Recording) async {
        items.removeAll { $0.id == r.id }
        try? await API.delete(r.id)
    }

    var byDay: [(day: Date, items: [Recording])] {
        let groups = Dictionary(grouping: items) { Calendar.current.startOfDay(for: $0.date) }
        return groups.keys.sorted(by: >).map { ($0, groups[$0]!) }
    }
}

struct ConversationsView: View {
    @StateObject private var model = ConversationsModel()

    var body: some View {
        NavigationStack {
            List {
                ForEach(model.byDay, id: \.day) { group in
                    Section(group.day.formatted(.dateTime.weekday(.wide).month().day())) {
                        ForEach(group.items) { r in
                            NavigationLink(value: r) { ConversationRow(r: r) }
                                .task { await model.loadMore(after: r) }
                                .swipeActions {
                                    Button("Delete", role: .destructive) { Task { await model.delete(r) } }
                                }
                        }
                    }
                }
            }
            .overlay {
                if model.items.isEmpty && !model.loading {
                    ContentUnavailableView(model.error == nil ? "No conversations yet" : "Couldn't load",
                                           systemImage: "text.bubble",
                                           description: Text(model.error ?? "Turn on recording on your watch. Conversations show up here a minute or two after they end."))
                }
            }
            .navigationTitle("Conversations")
            .navigationDestination(for: Recording.self) { r in ConversationDetail(r: r, model: model) }
            .refreshable { await model.reload() }
            .task { await model.reload() }
        }
    }
}

private struct ConversationRow: View {
    let r: Recording
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(r.title ?? (r.status == "failed" ? "Couldn't process" : "Transcribing…"))
                    .font(.headline).lineLimit(1)
                Spacer()
                Text(r.date.formatted(date: .omitted, time: .shortened))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let summary = r.summary, !summary.isEmpty {
                Text(summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
            }
            HStack(spacing: 10) {
                Label(r.duration.formatted(.units(allowed: [.hours, .minutes, .seconds], width: .narrow, maximumUnitCount: 2)), systemImage: "clock")
                if r.memoriesAdded > 0 { Label("\(r.memoriesAdded)", systemImage: "brain") }
                if r.status == "queued" { ProgressView().controlSize(.mini) }
                if r.status == "failed" { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange) }
            }
            .font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

private struct ConversationDetail: View {
    let r: Recording
    let model: ConversationsModel

    var body: some View {
        List {
            Section {
                LabeledContent("When", value: r.date.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Length", value: r.duration.formatted(.units(allowed: [.hours, .minutes, .seconds], width: .abbreviated, maximumUnitCount: 2)))
                LabeledContent("Memories saved", value: "\(r.memoriesAdded)")
            }
            if r.status == "failed" {
                Section { Button("Retry processing") { Task { await model.retry(r) } } }
            }
            if let summary = r.summary, !summary.isEmpty {
                Section("Summary") { Text(summary) }
            }
            Section("Transcript") {
                if let t = r.transcript, !t.isEmpty {
                    ForEach(Array(t.split(separator: "\n").enumerated()), id: \.offset) { _, line in
                        TranscriptLine(line: String(line))
                    }
                } else {
                    Text("Not transcribed yet.").foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(r.title ?? "Conversation")
        .navigationBarTitleDisplayMode(.inline)
        .textSelection(.enabled)
    }
}

private struct TranscriptLine: View {
    let line: String
    var body: some View {
        if let colon = line.firstIndex(of: ":"), line.hasPrefix("Speaker ") {
            let speaker = String(line[..<colon])
            VStack(alignment: .leading, spacing: 2) {
                Text(speaker == "Speaker 0" ? "You (probably)" : speaker)
                    .font(.caption.bold()).foregroundStyle(speaker == "Speaker 0" ? .red : .blue)
                Text(line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces))
            }
        } else {
            Text(line)
        }
    }
}

// MARK: Memories

@MainActor
final class MemoriesModel: ObservableObject {
    @Published var items: [Memory] = []
    @Published var query = ""
    @Published var error: String?
    @Published var loading = false

    func load() async {
        loading = true
        defer { loading = false }
        do {
            let q = query.trimmingCharacters(in: .whitespaces)
            items = q.isEmpty ? try await API.memories() : try await API.searchMemories(q)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct MemoriesView: View {
    @StateObject private var model = MemoriesModel()

    var body: some View {
        NavigationStack {
            List(model.items) { m in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: icon(m.type))
                        .foregroundStyle(.red)
                        .frame(width: 22)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(m.content)
                        Text("\(m.type.capitalized) · \(m.date.formatted(.relative(presentation: .named)))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
                .textSelection(.enabled)
            }
            .overlay {
                if model.items.isEmpty && !model.loading {
                    ContentUnavailableView(model.error == nil ? "No memories yet" : "Couldn't load",
                                           systemImage: "brain",
                                           description: Text(model.error ?? "Facts, plans and people from your conversations collect here."))
                }
            }
            .navigationTitle("Memories")
            .searchable(text: $model.query, prompt: "Ask your memory")
            .onSubmit(of: .search) { Task { await model.load() } }
            .onChange(of: model.query) { _, q in if q.isEmpty { Task { await model.load() } } }
            .refreshable { await model.load() }
            .task { await model.load() }
        }
    }

    private func icon(_ type: String) -> String {
        switch type {
        case "person": "person.fill"
        case "event": "calendar"
        case "task": "checklist"
        case "preference": "heart.fill"
        case "decision": "signpost.right.fill"
        case "org": "building.2.fill"
        default: "lightbulb.fill"
        }
    }
}

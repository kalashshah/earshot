import SwiftUI
import VoiceGlowKit

// MARK: Record

struct RecordView: View {
    @ObservedObject private var watch = WatchLink.shared
    @ObservedObject private var uploader = Uploader.shared
    @State private var confirmUnpair = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Spacer()
                Button {
                    watch.setRecording(!watch.isOn)
                } label: {
                    ZStack {
                        ParticleOrb(level: orbLevel, active: watch.isOn, count: 520, dotSize: 2.6)
                        if watch.busy {
                            ProgressView().controlSize(.large)
                        } else if !watch.isOn {
                            Image(systemName: "mic.fill")
                                .font(.system(size: 40, weight: .semibold))
                                .foregroundStyle(Color.ember)
                        }
                    }
                    .frame(width: 260, height: 260)
                    .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(watch.busy)
                .accessibilityLabel(watch.isOn ? "Stop recording on watch" : "Start recording on watch")

                VStack(spacing: 6) {
                    ListeningBars(level: orbLevel, active: watch.isOn)
                        .frame(width: 120, height: 26)
                        .padding(.bottom, 4)
                    Text(watch.isOn ? (watch.capturing ? "Capturing a conversation" : "Listening on your watch") : "Not recording")
                        .font(.title2.bold())
                    if watch.isOn {
                        Text("Tap the orb to stop").font(.footnote).foregroundStyle(.secondary)
                    }
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
                    Divider()
                    PrepRow()
                }
                .padding()
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal)

                Text("Only conversations are kept: silence is skipped on the watch, and very short clips are dropped.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .padding(.bottom)
            // VoiceGlow along the bottom edge, in Earshot's ember. The phone doesn't record, so it follows
            // the watch's state (listening / capturing) rather than a microphone here.
            .voiceGlow(type: .mobile, levelProvider: { orbLevel }, active: watch.isOn, cornerRadius: 0, options: Self.glow)
            .navigationTitle("Earshot")
            .toolbar {
                Menu {
                    Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { confirmUnpair = true }
                } label: {
                    Image(systemName: "gearshape")
                }
                .accessibilityLabel("Settings")
            }
            .confirmationDialog("Sign out of Earshot?", isPresented: $confirmUnpair, titleVisibility: .visible) {
                // ponytail: local only; the website still lists the device until removed there.
                Button("Sign out", role: .destructive) { DeviceToken.clear() }
            } message: {
                Text("Earshot on this iPhone and your watch stops syncing until you sign in again.")
            }
        }
    }

    /// The watch sends state, not audio levels, so the phone shows a gentle sway while capturing.
    private var orbLevel: Double {
        guard watch.isOn else { return 0 }
        guard watch.capturing else { return 0.1 }
        let t = Date().timeIntervalSinceReferenceDate
        return 0.45 + 0.25 * sin(t * 3.1) * cos(t * 1.7)
    }

    private static let glow: VoiceGlowOptions = {
        var o = VoiceGlowOptions()
        // centre, neighbours, outer pair, far pair: ember into amber
        o.colors = ["#ff4d00", "#ff7a1f", "#ff7a1f", "#ffb347", "#ffb347", "#d93a00", "#d93a00"].compactMap { VoiceGlowColor(hex: $0) }
        return o
    }()

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

// MARK: Promises

@MainActor
final class PromisesModel: ObservableObject {
    @Published var items: [Promise] = []
    @Published var moments: [Moment] = []
    @Published var routines: [Routine] = []
    @Published var error: String?
    @Published var loading = false

    var mine: [Promise] { items.filter(\.mine) }
    var theirs: [Promise] { items.filter { !$0.mine } }

    func load() async {
        loading = true
        defer { loading = false }
        do {
            async let m = API.moments()
            async let r = API.routines()
            items = try await API.promises()
            moments = try await m
            routines = try await r
            await Reminders.sync()   // also works out which places still need pinning
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func close(_ p: Promise, _ status: String) async {
        items.removeAll { $0.id == p.id }
        do { try await API.close(p.id, status: status) } catch { self.error = error.localizedDescription; await load() }
    }

    func forget(_ r: Routine) async {
        routines.removeAll { $0.id == r.id }
        do { try await API.forget(routine: r.id); await Reminders.sync() } catch { self.error = error.localizedDescription; await load() }
    }

    func forget(_ m: Moment) async {
        moments.removeAll { $0.id == m.id }
        do { try await API.forget(moment: m.id); await Reminders.sync() } catch { self.error = error.localizedDescription; await load() }
    }
}

struct PromisesView: View {
    @StateObject private var model = PromisesModel()
    @ObservedObject private var places = Places.shared

    var body: some View {
        NavigationStack {
            List {
                if !model.moments.isEmpty {
                    Section("Coming up") {
                        ForEach(model.moments) { m in
                            MomentRow(m: m).swipeActions {
                                Button("Forget", role: .destructive) { Task { await model.forget(m) } }
                            }
                        }
                    }
                }
                if !model.routines.isEmpty || !places.missing.isEmpty {
                    Section {
                        ForEach(model.routines) { r in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.title).font(.headline)
                                Text(r.detail).font(.caption).foregroundStyle(.secondary)
                            }
                            .swipeActions { Button("Forget", role: .destructive) { Task { await model.forget(r) } } }
                        }
                        ForEach(places.missing, id: \.self) { place in
                            HStack {
                                Label("Where is \(place)?", systemImage: "mappin.slash").font(.subheadline)
                                Spacer()
                                Button("I'm here now") { Task { await places.pinHere(place) } }.buttonStyle(.bordered)
                            }
                        }
                    } header: {
                        Text("Routines & places")
                    } footer: {
                        if !places.missing.isEmpty { Text("Maps couldn't find these nearby. Next time you're there, tap I'm here now. Your location stays on this iPhone.") }
                    }
                }
                if !model.mine.isEmpty {
                    Section("You promised") { ForEach(model.mine) { row($0) } }
                }
                if !model.theirs.isEmpty {
                    Section("Owed to you") { ForEach(model.theirs) { row($0) } }
                }
            }
            .overlay {
                if model.items.isEmpty && model.moments.isEmpty && model.routines.isEmpty && !model.loading {
                    ContentUnavailableView(model.error == nil ? "No reminders yet" : "Couldn't load",
                                           systemImage: "checklist",
                                           description: Text(model.error ?? "Promises and dates you mention in conversation show up here, and Earshot reminds you ahead of time. You can also tell your watch things like \u{201C}Our anniversary is November 2, remind me\u{201D} or \u{201C}Remind me to buy milk when I'm at a grocery store.\u{201D}"))
                }
            }
            .navigationTitle("Reminders")
            .refreshable { await model.load() }
            .task { await model.load() }
        }
    }

    private func row(_ p: Promise) -> some View {
        PromiseRow(p: p) { status in Task { await model.close(p, status) } }
            .swipeActions {
                Button("Dismiss", role: .destructive) { Task { await model.close(p, "dismissed") } }
            }
    }
}

private struct MomentRow: View {
    let m: Moment

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(m.title).font(.headline)
                Spacer()
                if let day = m.day {
                    Text(day.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
                        .font(.subheadline).foregroundStyle(Color.ember)
                }
            }
            if let prep = m.prep { Text(prep.prefix(1).uppercased() + prep.dropFirst()).font(.subheadline) }
            if let ideas = m.ideas { Text(ideas).font(.caption).foregroundStyle(.secondary) }
        }
        .padding(.vertical, 2)
    }
}

private struct PromiseRow: View {
    let p: Promise
    let close: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(p.what).font(.headline)
            Text(context).font(.caption).foregroundStyle(.secondary)
            if p.mine, let draft = p.draft, !draft.isEmpty {
                Text(draft)
                    .font(.subheadline)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
                    .textSelection(.enabled)
            }
            HStack {
                if p.mine {
                    if let draft = p.draft, !draft.isEmpty {
                        ShareLink("Send", item: draft)
                    }
                } else {
                    Label("Waiting on \(p.owner)", systemImage: "hourglass").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { close("done") }
            }
            // Bordered styles keep each button tappable on its own inside a List row.
            .buttonStyle(.bordered)
        }
        .padding(.vertical, 4)
    }

    private var context: String {
        var parts: [String] = []
        if p.mine, let to = p.counterpart, !to.isEmpty { parts.append("To \(to)") }
        if let due = p.due, !due.isEmpty { parts.append("Due \(due)") }
        if let title = p.recordingTitle { parts.append(title) }
        if let date = p.date { parts.append(date.formatted(.relative(presentation: .named))) }
        return parts.joined(separator: " · ")
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

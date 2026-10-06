import SwiftUI

enum SortKey: Hashable {
    case cpu, memory
}

struct OverviewView: View {
    @EnvironmentObject private var store: Store
    let report: Report
    @State private var sort: SortKey = .cpu
    @State private var expanded: Set<String> = []

    private var rows: [ProcGroup] {
        switch sort {
        case .cpu:
            report.groups.filter { $0.cpu >= 0.5 }.sorted { $0.cpu > $1.cpu }.prefix(25).map { $0 }
        case .memory:
            report.groups.sorted { $0.memory > $1.memory }.prefix(25).map { $0 }
        }
    }

    private var maxValue: Double {
        switch sort {
        case .cpu: rows.map(\.cpu).max() ?? 1
        case .memory: Double(rows.map(\.memory).max() ?? 1)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                StatusHeader(status: report.status)
                StatTiles(system: report.system)

                ForEach(report.findings, id: \.self) { FindingCard(finding: $0, status: report.status) }

                if store.live {
                    SpikesCard(spikes: store.sortedSpikes, since: store.liveSince)
                }

                HStack {
                    Text("What's running")
                        .font(.title3.weight(.semibold))
                    Spacer()
                    Picker("Sort by", selection: $sort) {
                        Text("CPU").tag(SortKey.cpu)
                        Text("Memory").tag(SortKey.memory)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .frame(width: 180)
                }
                .padding(.top, 6)

                LazyVStack(spacing: 6) {
                    ForEach(rows) { group in
                        GroupRow(group: group, sort: sort, maxValue: maxValue, isExpanded: binding(for: group))
                    }
                }
                if sort == .cpu && rows.isEmpty {
                    Text("Nothing is using noticeable CPU.")
                        .foregroundStyle(.secondary)
                }
            }
            .padding(24)
            .frame(maxWidth: 960)
            .frame(maxWidth: .infinity)
        }
    }

    private func binding(for group: ProcGroup) -> Binding<Bool> {
        Binding(
            get: { expanded.contains(group.id) },
            set: { open in
                if open { expanded.insert(group.id) } else { expanded.remove(group.id) }
            })
    }
}

struct StatusHeader: View {
    let status: String

    private var subtitle: String {
        switch status {
        case "Struggling": "Your Mac is overloaded. Here's what's doing it."
        case "Busy": "Your Mac is working hard. Here's why."
        default: "Nothing is straining your Mac right now."
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            Circle()
                .fill(statusColor(status).gradient)
                .frame(width: 18, height: 18)
                .shadow(color: statusColor(status).opacity(0.6), radius: 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(status)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                Text(subtitle)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct StatTiles: View {
    let system: SystemInfo

    var body: some View {
        let load = system.load.first ?? 0
        let memUsed = system.memFreePct >= 0 ? 1 - Double(system.memFreePct) / 100 : 0
        let lowMem = system.memFreePct >= 0 && system.memFreePct < 25
        // Same thresholds as the CLI's diagnosis.
        let diskLow = system.diskTotal > 0 && (system.diskFree < system.diskTotal / 10 || system.diskFree < 10 << 30)
        HStack(spacing: 12) {
            StatTile(title: "CPU", icon: "cpu",
                     value: String(format: "%.1f", load),
                     detail: "load on \(system.cores) cores",
                     fraction: load / Double(max(system.cores, 1)),
                     warn: load > Double(system.cores))
            StatTile(title: "Memory", icon: "memorychip",
                     value: system.memFreePct >= 0 ? "\(system.memFreePct)% free" : "?",
                     detail: "of \(bytes(system.memTotal))",
                     fraction: memUsed,
                     warn: lowMem)
            StatTile(title: "Swap", icon: "arrow.left.arrow.right",
                     value: bytes(system.swapUsed),
                     detail: "memory moved to disk",
                     fraction: system.swapTotal > 0 ? Double(system.swapUsed) / Double(system.swapTotal) : 0,
                     warn: lowMem && system.swapUsed > 1 << 30)
            StatTile(title: "Disk", icon: "internaldrive",
                     value: "\(bytes(system.diskFree)) free",
                     detail: "of \(bytes(system.diskTotal))",
                     fraction: system.diskTotal > 0 ? 1 - Double(system.diskFree) / Double(system.diskTotal) : 0,
                     warn: diskLow)
        }
    }
}

struct SpikesCard: View {
    let spikes: [Spike]
    let since: Date

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Label("Spikes since \(since.formatted(date: .omitted, time: .shortened))",
                      systemImage: "waveform.path.ecg")
                    .font(.headline)
                if spikes.isEmpty {
                    Text("Nothing has gone above 30% CPU yet. Leave this running and come back when it feels slow.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(spikes, id: \.title) { s in
                        HStack {
                            Text(String(format: "%.0f%%", s.cpu))
                                .monospacedDigit()
                                .frame(width: 56, alignment: .trailing)
                            Text(s.title)
                            Spacer()
                            Text(s.at.formatted(date: .omitted, time: .standard))
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                    }
                }
            }
        }
    }
}

struct GroupRow: View {
    @EnvironmentObject private var store: Store
    let group: ProcGroup
    let sort: SortKey
    let maxValue: Double
    @Binding var isExpanded: Bool

    private var amount: String {
        sort == .cpu ? String(format: "%.0f%%", group.cpu) : bytes(group.memory)
    }

    private var fraction: Double {
        let v = sort == .cpu ? group.cpu : Double(group.memory)
        return maxValue > 0 ? v / maxValue : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.snappy(duration: 0.2)) { isExpanded.toggle() }
            } label: {
                HStack(spacing: 12) {
                    Text(amount)
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .frame(width: 72, alignment: .trailing)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(group.title)
                                .font(.headline)
                            if group.procs.count > 1 {
                                Text(verbatim: "×\(group.procs.count)")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Text(group.command ?? firstSentence(group.what))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 12)
                    VerdictPill(verdict: group.verdict)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(alignment: .leading) {
                    GeometryReader { geo in
                        Rectangle()
                            .fill(verdictColor(group.verdict).opacity(0.12))
                            .frame(width: geo.size.width * fraction)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                GroupDetail(group: group)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 14)
                    .padding(.leading, 84)
            }
        }
        .background(.quaternary.opacity(0.35))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

struct GroupDetail: View {
    @EnvironmentObject private var store: Store
    let group: ProcGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
            Text(group.what)
            if let why = group.why {
                Text(why).foregroundStyle(.secondary)
            }
            if let tip = group.tip {
                Label(tip, systemImage: "lightbulb")
                    .foregroundStyle(.secondary)
            }
            if let command = group.command {
                Text(command)
                    .font(.system(.callout, design: .monospaced))
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 6))
            }

            Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 4) {
                GridRow {
                    Text("PID")
                    Text("CPU")
                    Text("Memory")
                    Text("Up")
                    Text("Started by")
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                ForEach(group.procs.prefix(8)) { p in
                    GridRow {
                        Text(verbatim: String(p.pid))
                        Text(String(format: "%.1f%%", p.cpu))
                        Text(bytes(p.memory))
                        Text(uptime(p.uptime))
                        Text(p.parent.isEmpty ? "?" : p.parent)
                    }
                    .font(.callout)
                    .monospacedDigit()
                }
            }
            if group.procs.count > 8 {
                Text("…and \(group.procs.count - 8) more")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let path = group.procs.first?.path {
                Text(path)
                    .font(.caption.monospaced())
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            HStack {
                if group.verdict == "quit", let app = store.runningApp(for: group) {
                    Button("Quit \(app.localizedName ?? group.title)") { store.quit(app) }
                        .buttonStyle(.borderedProminent)
                }
                if let path = group.procs.first?.path, path.hasPrefix("/") {
                    Button("Reveal in Finder") { store.reveal(path) }
                }
                Button("Open Activity Monitor") { store.openActivityMonitor() }
            }
            .controlSize(.small)
            .padding(.top, 2)
        }
        .textSelection(.enabled)
    }
}

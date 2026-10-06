import SwiftUI

struct PortsView: View {
    let ports: [ListeningPort]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Programs waiting for network connections. \u{201C}Your network\u{201D} means other devices on your Wi-Fi can connect to them. Only your own processes are shown.")
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 6)
                if ports.isEmpty {
                    ContentUnavailableView("Nothing is listening", systemImage: "network.slash",
                                           description: Text("None of your processes are waiting for connections."))
                }
                ForEach(ports) { PortRow(port: $0) }
            }
            .padding(24)
            .frame(maxWidth: 960)
            .frame(maxWidth: .infinity)
        }
    }
}

struct PortRow: View {
    @EnvironmentObject private var store: Store
    let port: ListeningPort
    @State private var request: StopRequest?

    // Only offer Stop for things you started (scripts, apps), not macOS's own.
    private var canStop: Bool { port.canStop && (port.verdict == "check" || port.verdict == "quit") }

    var body: some View {
        Card {
            HStack(alignment: .top, spacing: 16) {
                Text(verbatim: String(port.port))
                    .font(.system(size: 22, weight: .bold, design: .monospaced))
                    .frame(width: 84, alignment: .trailing)
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(port.title)
                            .font(.headline)
                        Text(port.exposed ? "Your network" : "This Mac only")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .foregroundStyle(port.exposed ? .orange : .secondary)
                            .background((port.exposed ? Color.orange : Color.gray).opacity(0.15), in: Capsule())
                        Text(verbatim: "up \(uptime(port.uptime)) · pid \(port.pid)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text(port.detail)
                        .foregroundStyle(.secondary)
                    if let note = port.note {
                        Label(note, systemImage: "info.circle")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
                .textSelection(.enabled)
                Spacer()
                if canStop {
                    Button("Stop") {
                        request = StopRequest(title: "Stop \(port.title) on port \(String(port.port))?", targets: [port.target])
                    }
                    .stopConfirmation($request, verdict: port.verdict, what: port.title, store: store)
                }
            }
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var store: Store
    let vendors: [Vendor]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    Text("Background jobs that apps have installed: updaters, sync services, VPN helpers and servers. A green dot means it's running right now. Switching a company off in Login Items settings stops its jobs from starting, but they stay listed here because the app leaves them installed.")
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 16)
                    Button("Open Login Items Settings…") { store.openLoginItemsSettings() }
                }
                if vendors.isEmpty {
                    ContentUnavailableView("Nice and clean", systemImage: "sparkles",
                                           description: Text("No third-party background jobs are installed."))
                }
                ForEach(vendors) { VendorCard(vendor: $0) }
            }
            .padding(24)
            .frame(maxWidth: 960)
            .frame(maxWidth: .infinity)
        }
    }
}

struct VendorCard: View {
    let vendor: Vendor

    private var summary: String {
        var s = "\(vendor.items.count) \(vendor.items.count == 1 ? "item" : "items") · \(vendor.running) running"
        if vendor.memory > 0 { s += " · \(bytes(vendor.memory))" }
        return s
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(vendor.name)
                        .font(.title3.weight(.semibold))
                    Spacer()
                    Text(summary)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                ForEach(vendor.items) { item in
                    HStack(spacing: 10) {
                        Circle()
                            .fill(item.pid != 0 ? AnyShapeStyle(Color.green) : AnyShapeStyle(.tertiary))
                            .frame(width: 8, height: 8)
                        Text(item.when)
                            .foregroundStyle(.secondary)
                            .frame(width: 110, alignment: .leading)
                        Text(item.purpose + (item.systemWide ? " (system-wide)" : ""))
                        Spacer()
                        Text(item.label)
                            .font(.caption.monospaced())
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    .font(.callout)
                    .help(item.pid != 0 ? "Running now" : "Installed, not running")
                }
            }
        }
    }
}

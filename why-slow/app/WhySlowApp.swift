import SwiftUI

@main
struct WhySlowApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var store = Store()

    var body: some Scene {
        Window("Why Slow", id: "main") {
            ContentView()
                .environmentObject(store)
                .frame(minWidth: 780, minHeight: 560)
        }
        .defaultSize(width: 1000, height: 780)
        .commands {
            CommandGroup(after: .toolbar) {
                Button("Refresh") { store.refresh() }
                    .keyboardShortcut("r")
                Toggle("Live", isOn: $store.live)
                    .keyboardShortcut("l")
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

enum Page: String, CaseIterable, Identifiable {
    case overview, ports, login

    var id: Self { self }

    var title: String {
        switch self {
        case .overview: "Overview"
        case .ports: "Ports"
        case .login: "Starts on Its Own"
        }
    }

    var icon: String {
        switch self {
        case .overview: "gauge.with.dots.needle.33percent"
        case .ports: "network"
        case .login: "power"
        }
    }
}

struct ContentView: View {
    @EnvironmentObject private var store: Store
    // Reopen on whichever page was showing last time.
    @AppStorage("page") private var page: Page = .overview

    private var selection: Binding<Page?> {
        Binding(get: { page }, set: { if let p = $0 { page = p } })
    }

    var body: some View {
        NavigationSplitView {
            List(Page.allCases, selection: selection) { p in
                Label(p.title, systemImage: p.icon).tag(p)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200)
            .safeAreaInset(edge: .bottom) {
                if let report = store.report {
                    SidebarStatus(status: report.status)
                        .padding(12)
                }
            }
        } detail: {
            Group {
                if let report = store.report {
                    switch page {
                    case .overview: OverviewView(report: report)
                    case .ports: PortsView(ports: report.ports)
                    case .login: LoginView(vendors: report.login)
                    }
                } else if let error = store.error {
                    ContentUnavailableView("Couldn't read your Mac",
                                           systemImage: "exclamationmark.triangle",
                                           description: Text(error))
                } else {
                    ProgressView("Looking around…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle(page.title)
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    if let updated = store.updated {
                        Text("Updated \(updated.formatted(date: .omitted, time: .standard))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    Toggle(isOn: $store.live) {
                        Label("Live", systemImage: "waveform.path.ecg")
                    }
                    .toggleStyle(.button)
                    .help("Refresh every 3 seconds and remember CPU spikes (⌘L)")
                    Button {
                        store.refresh()
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .disabled(store.loading)
                    .help("Refresh now (⌘R)")
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let notice = store.notice {
                Label(notice, systemImage: "checkmark.circle.fill")
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .shadow(radius: 8, y: 2)
                    .padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: store.notice)
        .task { store.refresh() }
    }
}

struct SidebarStatus: View {
    let status: String

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor(status))
                .frame(width: 10, height: 10)
                .shadow(color: statusColor(status).opacity(0.6), radius: 4)
            Text(status)
                .font(.callout.weight(.semibold))
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
    }
}

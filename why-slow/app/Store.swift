import AppKit
import Foundation

// MARK: - The report, as written by `why-slow --json`

struct Report: Decodable {
    let status: String
    let system: SystemInfo
    let findings: [Finding]
    let groups: [ProcGroup]
    let ports: [ListeningPort]
    let login: [Vendor]
}

struct SystemInfo: Decodable {
    let cores: Int
    let cpuUsed: Double // percent of the whole Mac
    let load: [Double]
    let memTotal: UInt64
    let memFreePct: Int
    let swapUsed: UInt64
    let swapTotal: UInt64
    let diskFree: UInt64
    let diskTotal: UInt64
    let cpuSpeedLimit: Int
}

struct Finding: Decodable, Hashable {
    let title: String
    let lines: [String]
}

struct ProcGroup: Decodable, Identifiable {
    let title: String
    let verdict: String
    let what: String
    let why: String?
    let tip: String?
    let command: String?
    let appPath: String?
    let cpu: Double
    let memory: UInt64
    let procs: [Proc]

    // Two `node` groups share a title, so include a PID.
    var id: String { "\(title)#\(procs.first?.pid ?? 0)" }
}

struct Proc: Decodable, Identifiable {
    let pid: Int
    let parent: String
    let cpu: Double
    let memory: UInt64
    let uptime: Int
    let path: String

    var id: Int { pid }
}

struct ListeningPort: Decodable, Identifiable {
    let port: Int
    let pid: Int
    let title: String
    let verdict: String
    let detail: String
    let note: String?
    let exposed: Bool
    let uptime: Int

    var id: String { "\(pid):\(port)" }
}

struct Vendor: Decodable, Identifiable {
    let name: String
    let running: Int
    let memory: UInt64
    let items: [LaunchItem]

    var id: String { name }
}

struct LaunchItem: Decodable, Identifiable {
    let label: String
    let when: String
    let purpose: String
    let pid: Int
    let systemWide: Bool

    var id: String { label }
}

struct Spike {
    let title: String
    let cpu: Double
    let at: Date
}

// MARK: - Store

@MainActor
final class Store: ObservableObject {
    @Published private(set) var report: Report?
    @Published private(set) var error: String?
    @Published private(set) var loading = false
    @Published private(set) var updated: Date?
    @Published private(set) var spikes: [String: Spike] = [:]
    @Published private(set) var liveSince = Date()
    @Published private(set) var notice: String?
    @Published var live = false {
        didSet { live ? startLive() : stopLive() }
    }

    private var timer: Timer?

    func refresh() {
        guard !loading else { return }
        loading = true
        Task.detached {
            let result = Result { try Store.runCLI() }
            await MainActor.run {
                self.loading = false
                switch result {
                case .success(let report):
                    self.report = report
                    self.error = nil
                    self.updated = Date()
                    if self.live { self.recordSpikes(report) }
                case .failure(let err):
                    self.error = err.localizedDescription
                }
            }
        }
    }

    /// Runs the Go CLI bundled in the app's Resources and decodes its report.
    nonisolated static func runCLI() throws -> Report {
        let override = ProcessInfo.processInfo.environment["WHY_SLOW_BIN"]
        guard let path = override ?? Bundle.main.path(forResource: "why-slow", ofType: nil) else {
            throw StoreError("The why-slow engine is missing from the app bundle. Rebuild with ./build-app.sh.")
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = ["--json"]
        var env = ProcessInfo.processInfo.environment
        env["WHY_SLOW_HIDE_PID"] = String(ProcessInfo.processInfo.processIdentifier)
        process.environment = env
        let out = Pipe()
        let err = Pipe()
        process.standardOutput = out
        process.standardError = err
        try process.run()
        let data = out.fileHandleForReading.readDataToEndOfFile()
        let errData = err.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw StoreError(String(decoding: errData, as: UTF8.self))
        }
        return try JSONDecoder().decode(Report.self, from: data)
    }

    // MARK: Live mode

    private func startLive() {
        spikes = [:]
        liveSince = Date()
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    private func stopLive() {
        timer?.invalidate()
        timer = nil
    }

    private func recordSpikes(_ report: Report) {
        let now = Date()
        for g in report.groups where g.cpu >= 30 {
            if g.cpu > (spikes[g.title]?.cpu ?? 0) {
                spikes[g.title] = Spike(title: g.title, cpu: g.cpu, at: now)
            }
        }
    }

    var sortedSpikes: [Spike] {
        spikes.values.sorted { $0.cpu > $1.cpu }.prefix(6).map { $0 }
    }

    // MARK: Actions

    /// The running application a group belongs to, if it's a normal app
    /// that can be asked to quit.
    func runningApp(for group: ProcGroup) -> NSRunningApplication? {
        guard let path = group.appPath else { return nil }
        let target = URL(fileURLWithPath: path).standardizedFileURL.path
        return NSWorkspace.shared.runningApplications.first {
            $0.bundleURL?.standardizedFileURL.path == target
        }
    }

    func quit(_ app: NSRunningApplication) {
        app.terminate()
        refreshSoon()
    }

    /// Stops processes: a polite quit signal first, then a forced one for
    /// anything still running two seconds later. Never stops this app.
    func stop(pids: [Int], what: String) {
        let me = Int(ProcessInfo.processInfo.processIdentifier)
        let targets = Array(Set(pids).subtracting([me]))
        guard !targets.isEmpty else { return }
        Task.detached {
            let result = Store.terminate(targets)
            await MainActor.run {
                self.show(result.message(for: what))
                self.refresh()
            }
        }
    }

    nonisolated static func terminate(_ pids: [Int]) -> StopResult {
        var denied = 0
        var pending: [Int] = []
        for pid in pids {
            if kill(pid_t(pid), SIGTERM) == 0 {
                pending.append(pid)
            } else if errno == EPERM {
                denied += 1 // owned by the system or another user
            } // ESRCH: already gone
        }
        let deadline = Date().addingTimeInterval(2)
        while !pending.isEmpty && Date() < deadline {
            usleep(100_000)
            pending.removeAll { kill(pid_t($0), 0) != 0 }
        }
        for pid in pending { kill(pid_t(pid), SIGKILL) }
        if !pending.isEmpty { usleep(300_000) }
        let survived = pending.filter { kill(pid_t($0), 0) == 0 }.count
        return StopResult(stopped: pids.count - denied - survived, forced: pending.count - survived,
                          denied: denied, survived: survived)
    }

    private func show(_ message: String) {
        notice = message
        Task {
            try? await Task.sleep(for: .seconds(5))
            if notice == message { notice = nil }
        }
    }

    func reveal(_ path: String) {
        NSWorkspace.shared.selectFile(path, inFileViewerRootedAtPath: "")
    }

    func openActivityMonitor() {
        NSWorkspace.shared.openApplication(
            at: URL(fileURLWithPath: "/System/Applications/Utilities/Activity Monitor.app"),
            configuration: NSWorkspace.OpenConfiguration())
    }

    func openLoginItemsSettings() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.LoginItems-Settings.extension")!)
    }

    private func refreshSoon() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.refresh() }
    }
}

struct StopResult {
    let stopped: Int
    let forced: Int
    let denied: Int
    let survived: Int

    func message(for what: String) -> String {
        var parts: [String] = []
        if stopped > 0 {
            var s = "Stopped \(stopped) \(what) \(stopped == 1 ? "process" : "processes")"
            if forced > 0 { s += " (\(forced) had to be forced)" }
            parts.append(s + ".")
        }
        if denied > 0 {
            parts.append("\(denied) \(denied == 1 ? "belongs" : "belong") to macOS or another user and can't be stopped from here.")
        }
        if survived > 0 {
            parts.append("\(survived) \(survived == 1 ? "is" : "are") still running.")
        }
        return parts.isEmpty ? "Nothing to stop; already gone." : parts.joined(separator: " ")
    }
}

struct StoreError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

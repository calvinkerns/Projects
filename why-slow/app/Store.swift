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
    let canStop: Bool
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
    let start: Int
    let path: String

    var id: Int { pid }
    var target: StopTarget { StopTarget(pid: pid, start: start) }
}

/// A process to stop, identified by PID *and* start time, so a PID that's
/// been reused by a different process since the last refresh is left alone.
struct StopTarget: Hashable {
    let pid: Int
    let start: Int
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
    let start: Int
    let canStop: Bool

    var id: String { "\(pid):\(port)" }
    var target: StopTarget { StopTarget(pid: pid, start: start) }
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
        #if DEBUG
        let override = ProcessInfo.processInfo.environment["WHY_SLOW_BIN"]
        #else
        let override: String? = nil
        #endif
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

        // The engine bounds each command it runs, so this only fires if
        // something is badly wrong; without it a stuck run would leave the
        // app refreshing forever.
        let watchdog = DispatchWorkItem { if process.isRunning { process.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + 20, execute: watchdog)
        defer { watchdog.cancel() }

        // Read stderr alongside stdout, or a chatty stderr could fill its
        // pipe and block the engine while we wait on stdout.
        var errData = Data()
        let errDone = DispatchGroup()
        errDone.enter()
        DispatchQueue.global().async {
            errData = err.fileHandleForReading.readDataToEndOfFile()
            errDone.leave()
        }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        errDone.wait()
        process.waitUntilExit()

        if process.terminationReason == .uncaughtSignal {
            throw StoreError("Reading your Mac took too long and was stopped. Try Refresh.")
        }
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

    /// Asks processes to quit (SIGTERM, like `kill`). With `force`, anything
    /// still running two seconds later is killed outright (SIGKILL), which
    /// loses unsaved work. Never touches this app, launchd or PID 0.
    func stop(_ targets: [StopTarget], what: String, force: Bool) {
        let me = Int(ProcessInfo.processInfo.processIdentifier)
        let safe = Array(Set(targets.filter { $0.pid > 1 && $0.pid != me }))
        guard !safe.isEmpty else { return }
        Task.detached {
            let result = Store.terminate(safe, force: force)
            await MainActor.run {
                self.show(result.message(for: what))
                self.refresh()
            }
        }
    }

    nonisolated static func terminate(_ targets: [StopTarget], force: Bool) -> StopResult {
        var gone = 0, denied = 0
        var pending: [Int] = []
        for t in targets {
            // The report the PID came from may be minutes old. If the process
            // now has a different start time, the PID belongs to something else.
            guard let started = startTime(t.pid) else {
                // macOS hides other users' processes from us; it still exists
                // if signalling it is refused rather than "no such process".
                if kill(pid_t(t.pid), 0) != 0 && errno == EPERM { denied += 1 } else { gone += 1 }
                continue
            }
            guard abs(started - t.start) <= 3 else {
                gone += 1
                continue
            }
            if kill(pid_t(t.pid), SIGTERM) == 0 {
                pending.append(t.pid)
            } else if errno == EPERM {
                denied += 1 // owned by macOS or another user
            } else {
                gone += 1
            }
        }
        let signalled = pending.count

        let deadline = Date().addingTimeInterval(force ? 2 : 5)
        while !pending.isEmpty && Date() < deadline {
            usleep(100_000)
            pending.removeAll { !isAlive($0) }
        }
        var forced = 0
        if force && !pending.isEmpty {
            for pid in pending { kill(pid_t(pid), SIGKILL) }
            usleep(300_000)
            let before = pending.count
            pending.removeAll { !isAlive($0) }
            forced = before - pending.count
        }
        return StopResult(stopped: signalled - pending.count, forced: forced, gone: gone,
                          denied: denied, survived: pending.count, forceAvailable: !force)
    }

    /// When a process started, in unix seconds, or nil if it no longer exists.
    nonisolated static func startTime(_ pid: Int) -> Int? {
        guard let info = bsdInfo(pid), info.pbi_status != 5 /* SZOMB */ else { return nil }
        return Int(info.pbi_start_tvsec)
    }

    /// A zombie (exited, waiting for its parent to notice) counts as gone.
    nonisolated static func isAlive(_ pid: Int) -> Bool {
        startTime(pid) != nil
    }

    nonisolated static func bsdInfo(_ pid: Int) -> proc_bsdinfo? {
        var info = proc_bsdinfo()
        let size = Int32(MemoryLayout<proc_bsdinfo>.size)
        return proc_pidinfo(pid_t(pid), PROC_PIDTBSDINFO, 0, &info, size) == size ? info : nil
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
    let gone: Int
    let denied: Int
    let survived: Int
    let forceAvailable: Bool

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
            var s = "\(survived) \(survived == 1 ? "is" : "are") still running"
            s += forceAvailable ? "; use Force Stop if it's stuck." : "."
            parts.append(s)
        }
        if gone > 0 && parts.isEmpty {
            parts.append("Already gone; nothing to stop.")
        } else if gone > 0 {
            parts.append("\(gone) had already exited.")
        }
        return parts.joined(separator: " ")
    }
}

struct StoreError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

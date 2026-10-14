// A tiny draggable desktop counter: "Days since checked GitHub".
// Goes up by one every midnight, sits just above the desktop icons (below
// normal windows), remembers its count and position, and quits from the
// right-click menu.

import AppKit
import SwiftUI

// Appends a timestamped line to ~/Library/Logs/GitHubCounter.log.
func log(_ message: String) {
    let url = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/GitHubCounter.log")
    let line = "\(Date().formatted(date: .numeric, time: .standard))  \(message)\n"
    if let handle = try? FileHandle(forWritingTo: url) {
        handle.seekToEndOfFile()
        handle.write(Data(line.utf8))
        try? handle.close()
    } else {
        try? line.write(to: url, atomically: true, encoding: .utf8)
    }
}

struct CounterView: View {
    @AppStorage("count") var count = 0
    // When the pointer moved onto the counter. A click only counts if the
    // pointer has been resting here a moment, so stray clicks meant for a
    // window that just closed or moved off the counter don't change it.
    @State var hoverSince: Date?

    var body: some View {
        VStack(spacing: 4) {
            Text("Days since checked GitHub")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
            Text("\(count)")
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
            HStack(spacing: 6) {
                pill("−") { set(max(0, count - 1), "−") }
                pill("Reset") { set(0, "Reset") }
                pill("+") { set(count + 1, "+") }
            }
        }
        .padding(12)
        .frame(width: 180, height: 130)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .onHover { inside in hoverSince = inside ? Date() : nil }
        .contextMenu {
            Button("Quit") { NSApp.terminate(nil) }
        }
    }

    func set(_ value: Int, _ button: String) {
        guard let since = hoverSince, Date().timeIntervalSince(since) > 0.4 else {
            log("ignored stray \(button) click")
            return
        }
        log("\(button): \(count) -> \(value)")
        count = value
    }

    func pill(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .frame(minWidth: 28, minHeight: 22)
                .padding(.horizontal, 6)
                .background(.quaternary, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

final class Counter: NSObject, NSApplicationDelegate {
    var window: NSWindow!

    func applicationDidFinishLaunching(_ note: Notification) {
        let host = NSHostingView(rootView: CounterView())
        window = NSWindow(contentRect: NSRect(origin: .zero, size: host.fittingSize),
                          styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.isMovableByWindowBackground = true
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]

        if !window.setFrameUsingName("CounterWindow") { window.center() }
        window.setFrameAutosaveName("CounterWindow")
        window.orderFrontRegardless()

        // Count at midnight, and on launch and wake for any midnights that
        // passed while the Mac was asleep or the app wasn't running.
        countNewDays()
        NotificationCenter.default.addObserver(forName: .NSCalendarDayChanged, object: nil, queue: .main) { _ in
            self.countNewDays()
        }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { _ in
            self.countNewDays()
        }
    }

    // Adds one to the count for every midnight since the last day counted.
    // The view's @AppStorage picks up the new value on its own.
    func countNewDays() {
        let defaults = UserDefaults.standard
        let today = Calendar.current.startOfDay(for: Date())
        guard let last = defaults.object(forKey: "lastDay") as? Date else {
            defaults.set(today, forKey: "lastDay") // first run: start counting from today
            return
        }
        let days = Calendar.current.dateComponents([.day], from: last, to: today).day ?? 0
        guard days != 0 else { return }
        if days > 0 { // a clock set backwards just moves the starting day
            let count = defaults.integer(forKey: "count")
            log("midnight: \(count) -> \(count + days)")
            defaults.set(count + days, forKey: "count")
        }
        defaults.set(today, forKey: "lastDay")
    }
}

let app = NSApplication.shared
let delegate = Counter()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

// A tiny draggable desktop counter: "Days since checked GitHub".
// Sits just above the desktop icons (below normal windows), remembers its
// count and position, and quits from the right-click menu.

import AppKit
import SwiftUI

struct CounterView: View {
    @AppStorage("count") var count = 0

    var body: some View {
        VStack(spacing: 4) {
            Text("Days since checked GitHub")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
            Text("\(count)")
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
            HStack(spacing: 6) {
                pill("−") { count = max(0, count - 1) }
                pill("Reset") { count = 0 }
                pill("+") { count += 1 }
            }
        }
        .padding(12)
        .frame(width: 180, height: 130)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .contextMenu {
            Button("Quit") { NSApp.terminate(nil) }
        }
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
    }
}

let app = NSApplication.shared
let delegate = Counter()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

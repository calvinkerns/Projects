import SwiftUI

// MARK: - Formatting, matching the CLI's

func bytes(_ b: UInt64) -> String {
    let d = Double(b)
    if d >= 1_073_741_824 { return String(format: "%.1f GB", d / 1_073_741_824) }
    if d >= 1_048_576 { return String(format: "%.0f MB", d / 1_048_576) }
    return String(format: "%.0f KB", d / 1024)
}

func uptime(_ seconds: Int) -> String {
    switch seconds {
    case 172_800...: "\(seconds / 86400)d"
    case 3600...: "\(seconds / 3600)h"
    case 60...: "\(seconds / 60)m"
    default: "\(seconds)s"
    }
}

func firstSentence(_ s: String) -> String {
    if let r = s.range(of: ". ") { return String(s[..<r.lowerBound]) + "." }
    return s
}

func statusColor(_ status: String) -> Color {
    switch status {
    case "Struggling": .red
    case "Busy": .orange
    default: .green
    }
}

// MARK: - Verdicts

func verdictColor(_ verdict: String) -> Color {
    switch verdict {
    case "wait": .teal
    case "quit": .green
    case "check": .orange
    default: .gray
    }
}

func verdictLabel(_ verdict: String) -> String {
    switch verdict {
    case "leave": "Leave it"
    case "wait": "Wait it out"
    case "quit": "Safe to quit"
    default: "Take a look"
    }
}

struct VerdictPill: View {
    let verdict: String

    var body: some View {
        Text(verdictLabel(verdict))
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(verdictColor(verdict))
            .background(verdictColor(verdict).opacity(0.15), in: Capsule())
            .fixedSize()
    }
}

// MARK: - Cards

struct Card<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct FindingCard: View {
    let finding: Finding
    let status: String

    // On a calm Mac a finding is just "here's what's running", not a warning.
    private var icon: (name: String, color: Color) {
        if finding.title.hasPrefix("Nothing looks wrong") { return ("checkmark.circle.fill", .green) }
        if status == "Calm" { return ("info.circle.fill", .teal) }
        return ("exclamationmark.circle.fill", statusColor(status))
    }

    var body: some View {
        Card {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icon.name)
                    .font(.title2)
                    .foregroundStyle(icon.color)
                VStack(alignment: .leading, spacing: 6) {
                    Text(finding.title)
                        .font(.headline)
                    ForEach(finding.lines, id: \.self) { line in
                        if line.hasPrefix("Tip: ") {
                            Label(String(line.dropFirst(5)), systemImage: "lightbulb")
                                .foregroundStyle(.secondary)
                        } else {
                            Text(line)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .textSelection(.enabled)
            }
        }
    }
}

struct StatTile: View {
    let title: String
    let icon: String
    let value: String
    let detail: String
    let fraction: Double
    let warn: Bool

    private var tint: Color { warn ? .orange : .accentColor }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title2.weight(.semibold))
                .monospacedDigit()
            ProgressView(value: min(max(fraction, 0), 1))
                .tint(tint)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
    }
}

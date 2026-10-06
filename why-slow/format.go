package main

import (
	"fmt"
	"os"
	"strings"
	"time"
	"unicode/utf8"
)

var useColor = func() bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	fi, err := os.Stdout.Stat()
	return err == nil && fi.Mode()&os.ModeCharDevice != 0
}()

func paint(code, s string) string {
	if !useColor {
		return s
	}
	return "\x1b[" + code + "m" + s + "\x1b[0m"
}

func bold(s string) string   { return paint("1", s) }
func dim(s string) string    { return paint("2", s) }
func red(s string) string    { return paint("31", s) }
func yellow(s string) string { return paint("33", s) }
func green(s string) string  { return paint("32", s) }
func cyan(s string) string   { return paint("36", s) }

// Label is the verdict padded to line up in a column.
func (v Verdict) Label() string { return v.paint(pad(v.String(), 13)) }

// Tag is the verdict on its own, for use outside tables.
func (v Verdict) Tag() string { return v.paint(v.String()) }

func (v Verdict) String() string {
	switch v {
	case Leave:
		return "leave it"
	case Wait:
		return "wait it out"
	case Quit:
		return "safe to quit"
	}
	return "take a look"
}

func (v Verdict) paint(s string) string {
	switch v {
	case Leave:
		return dim(s)
	case Wait:
		return cyan(s)
	case Quit:
		return green(s)
	}
	return yellow(s)
}

// share turns a per-core CPU figure (ps's "100% = one core") into a share of
// the whole Mac, so a machine that's flat out reads 100% however many cores it
// has. ps's per-process figures are estimates that can add up to a little
// more than the machine has, so it's capped at 100.
func share(cpu float64, ncpu int) string {
	v := min(cpu/float64(max(ncpu, 1)), 100)
	if v >= 9.95 {
		return fmt.Sprintf("%.0f%%", v)
	}
	return fmt.Sprintf("%.1f%%", v)
}

// totalCPU is how much of the whole Mac is in use, 0–100.
func totalCPU(groups []*Group, ncpu int) float64 {
	sum := 0.0
	for _, g := range groups {
		sum += g.CPU
	}
	return min(sum/float64(max(ncpu, 1)), 100)
}

// usedPct is part as a whole percentage of total.
func usedPct(part, total uint64) int {
	if total == 0 {
		return 0
	}
	return int(float64(part) / float64(total) * 100)
}

func human(b uint64) string {
	switch {
	case b >= 1<<30:
		return fmt.Sprintf("%.1f GB", float64(b)/(1<<30))
	case b >= 1<<20:
		return fmt.Sprintf("%.0f MB", float64(b)/(1<<20))
	}
	return fmt.Sprintf("%.0f KB", float64(b)/(1<<10))
}

func ago(d time.Duration) string {
	switch {
	case d >= 48*time.Hour:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	case d >= time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	case d >= time.Minute:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	return fmt.Sprintf("%ds", int(d.Seconds()))
}

// plural is "1 process" or "3 processes".
func plural(n int, one, many string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, one)
	}
	return fmt.Sprintf("%d %s", n, many)
}

func pad(s string, n int) string {
	if w := utf8.RuneCountInString(s); w < n {
		return s + strings.Repeat(" ", n-w)
	}
	return s
}

func clip(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n-1]) + "…"
}

func tildify(path string) string {
	if home, err := os.UserHomeDir(); err == nil && inHome(path) {
		return "~" + path[len(home):]
	}
	return path
}

// inHome is true for paths inside the home folder, but not for
// /Users/name2 next to /Users/name.
func inHome(path string) bool {
	home, err := os.UserHomeDir()
	return err == nil && home != "" && (path == home || strings.HasPrefix(path, home+"/"))
}

// printable replaces control characters, so text from process names,
// command lines and plists can't send escape sequences to the terminal.
func printable(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 0x20 || (r >= 0x7f && r < 0xa0) {
			return '?'
		}
		return r
	}, s)
}

func firstSentence(s string) string {
	if i := strings.Index(s, ". "); i >= 0 {
		return s[:i+1]
	}
	return s
}

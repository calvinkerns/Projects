package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// LaunchItem is one launchd job that some app installed so it runs without
// you opening anything.
type LaunchItem struct {
	Label   string
	Program string
	Args    []string
	Daemon  bool // system-wide, runs even before anyone logs in
	When    string
	PID     int // 0 when not running
}

type launchPlist struct {
	Label                 string
	Program               string
	ProgramArguments      []string
	RunAtLoad             bool
	KeepAlive             any
	StartInterval         int
	StartCalendarInterval any
	Disabled              bool
}

var vendors = map[string]string{
	"com.adobe":         "Adobe",
	"com.google":        "Google",
	"com.microsoft":     "Microsoft",
	"us.zoom":           "Zoom",
	"com.cisco":         "Cisco",
	"org.openvpn":       "OpenVPN",
	"com.oracle":        "Oracle",
	"com.valvesoftware": "Steam",
	"org.xquartz":       "XQuartz",
	"com.docker":        "Docker",
	"com.spotify":       "Spotify",
	"com.dropbox":       "Dropbox",
	"com.logitech":      "Logitech",
	"com.logi":          "Logitech",
	"com.getdropbox":    "Dropbox",
	"com.teamviewer":    "TeamViewer",
	"com.jetbrains":     "JetBrains",
	"homebrew.mxcl":     "Homebrew services",
}

func readLaunchItems() []LaunchItem {
	home, _ := os.UserHomeDir()
	dirs := []struct {
		path   string
		daemon bool
	}{
		{filepath.Join(home, "Library/LaunchAgents"), false},
		{"/Library/LaunchAgents", false},
		{"/Library/LaunchDaemons", true},
	}

	running := launchctlPIDs()
	var items []LaunchItem
	seen := map[string]bool{}
	for _, d := range dirs {
		files, _ := filepath.Glob(filepath.Join(d.path, "*.plist"))
		for _, f := range files {
			out, err := run("plutil", "-convert", "json", "-o", "-", f)
			if err != nil {
				continue
			}
			var pl launchPlist
			// Some installers drop the same job in both your and the system's
			// LaunchAgents; it only runs once.
			if json.Unmarshal([]byte(out), &pl) != nil || pl.Label == "" || pl.Disabled || seen[pl.Label] {
				continue
			}
			seen[pl.Label] = true
			for i := range pl.ProgramArguments {
				pl.ProgramArguments[i] = printable(pl.ProgramArguments[i])
			}
			it := LaunchItem{Label: printable(pl.Label), Program: printable(pl.Program), Args: pl.ProgramArguments,
				Daemon: d.daemon, PID: running[pl.Label]}
			if it.Program == "" && len(pl.ProgramArguments) > 0 {
				it.Program = pl.ProgramArguments[0]
			}
			switch {
			case keepAlive(pl.KeepAlive):
				it.When = "always on"
			case pl.StartInterval > 0 || pl.StartCalendarInterval != nil:
				it.When = "on a schedule"
			case pl.RunAtLoad:
				it.When = "at login"
			default:
				it.When = "when needed"
			}
			if d.daemon {
				it.When = strings.Replace(it.When, "at login", "at startup", 1)
			}
			items = append(items, it)
		}
	}
	return items
}

// keepAlive is true for `<true/>` and for the dictionary form, which means
// "restart it under these conditions".
func keepAlive(v any) bool {
	switch k := v.(type) {
	case bool:
		return k
	case map[string]any:
		return true
	}
	return false
}

// launchctlPIDs maps job labels in your login session to their running PIDs.
func launchctlPIDs() map[string]int {
	pids := map[string]int{}
	out, _ := run("launchctl", "list")
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(line)
		if len(f) == 3 {
			if pid, err := strconv.Atoi(f[0]); err == nil {
				pids[f[2]] = pid
			}
		}
	}
	return pids
}

func vendorOf(it LaunchItem) string {
	best := ""
	for prefix := range vendors {
		if (it.Label == prefix || strings.HasPrefix(it.Label, prefix+".")) && len(prefix) > len(best) {
			best = prefix
		}
	}
	if best != "" {
		return vendors[best]
	}
	// Labels that aren't reverse-DNS still usually live in a vendor folder,
	// like "/Library/Application Support/Adobe/...".
	for _, name := range vendors {
		if strings.Contains(it.Program, "/"+name+"/") {
			return name
		}
	}
	parts := strings.Split(it.Label, ".")
	if len(parts) >= 2 && parts[1] != "" {
		r, size := utf8.DecodeRuneInString(parts[1])
		return string(unicode.ToUpper(r)) + parts[1][size:]
	}
	return strings.ReplaceAll(it.Label, "_", " ")
}

// target is the app a job really starts: jobs that run `/usr/bin/open
// Foo.app` should be described as Foo, not "open".
func target(it LaunchItem) string {
	return appBundle(targetBundle(it))
}

// targetBundle is the path of the .app a job starts, if any.
func targetBundle(it LaunchItem) string {
	for _, a := range append([]string{it.Program}, it.Args...) {
		if b := appPath(a); b != "" {
			return b
		}
	}
	return ""
}

// purpose guesses what a job is for from its label and program.
func purpose(it LaunchItem) string {
	l := strings.ToLower(it.Label + " " + it.Program)
	switch {
	case strings.HasPrefix(it.Label, "homebrew.mxcl."):
		return "brew service: " + strings.TrimPrefix(it.Label, "homebrew.mxcl.")
	case containsAny(l, "update", "keystone", "shipit", "installer"):
		return "auto-updater"
	case containsAny(l, "vpn"):
		return "VPN"
	case containsAny(l, "mysql"):
		return "MySQL server"
	case containsAny(l, "postgres"):
		return "PostgreSQL server"
	case containsAny(l, "redis", "mongo"):
		return "database server"
	case containsAny(l, "clean"):
		return "cleanup task"
	}
	if app := target(it); app != "" {
		return app
	}
	if it.Program != "" {
		return filepath.Base(it.Program)
	}
	return "background helper"
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

type vendorGroup struct {
	Name    string
	Items   []LaunchItem
	Running int
	RSS     uint64
}

// collectLogin groups launch items by company, biggest memory user first.
func collectLogin(procs []Proc) []*vendorGroup {
	items := readLaunchItems()

	// Daemons run outside your login session, so launchctl can't give us
	// their PIDs; find them by executable path instead.
	byPath := map[string]int{}
	// Many jobs only launch an app and exit, or the app relaunches itself,
	// so also count a job as running if anything inside its app bundle is.
	byBundle := map[string]int{}
	for _, p := range procs {
		byPath[p.Path] = p.PID
		if b := appPath(p.Path); b != "" && byBundle[b] == 0 {
			byBundle[b] = p.PID
		}
	}
	// Count memory by app group, so a job that starts Creative Cloud is
	// charged for all of Creative Cloud's helpers, but only once.
	groupOf := map[int]*Group{}
	for _, g := range groupProcs(procs) {
		for _, p := range g.Procs {
			groupOf[p.PID] = g
		}
	}

	byVendor := map[string]*vendorGroup{}
	var list []*vendorGroup
	counted := map[*Group]bool{}
	for _, it := range items {
		// A job that runs /bin/sh or /usr/bin/python3 isn't running just
		// because something else is using the same interpreter.
		if it.PID == 0 && !hasAnyPrefix(it.Program, "/bin/", "/usr/bin/", "/usr/sbin/", "/sbin/") {
			it.PID = byPath[filepath.Clean(it.Program)]
		}
		if it.PID == 0 {
			it.PID = byBundle[targetBundle(it)]
		}
		name := vendorOf(it)
		v := byVendor[name]
		if v == nil {
			v = &vendorGroup{Name: name}
			byVendor[name] = v
			list = append(list, v)
		}
		v.Items = append(v.Items, it)
		if it.PID != 0 {
			v.Running++
			if g := groupOf[it.PID]; g != nil && !counted[g] {
				counted[g] = true
				v.RSS += g.RSS
			}
		}
	}
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].RSS != list[j].RSS {
			return list[i].RSS > list[j].RSS
		}
		return len(list[i].Items) > len(list[j].Items)
	})
	for _, v := range list {
		sort.SliceStable(v.Items, func(i, j int) bool { return v.Items[i].PID != 0 && v.Items[j].PID == 0 })
	}
	return list
}

func login() error {
	procs, err := listProcs()
	if err != nil {
		return err
	}
	list := collectLogin(procs)
	if len(list) == 0 {
		fmt.Println("No third-party launch agents or daemons installed. Nice and clean.")
		return nil
	}

	fmt.Println(bold("STARTS ON ITS OWN") + dim(" (launch agents and daemons; apps in Login Items aren't listed)"))
	for _, v := range list {
		summary := fmt.Sprintf("%d item(s) · %d running", len(v.Items), v.Running)
		if v.RSS > 0 {
			summary += " · " + human(v.RSS)
		}
		fmt.Printf("\n  %s  %s\n", bold(pad(v.Name, 18)), dim(summary))
		for _, it := range v.Items {
			dot := dim("○")
			if it.PID != 0 {
				dot = green("●")
			}
			scope := ""
			if it.Daemon {
				scope = " (system-wide)"
			}
			fmt.Printf("    %s %s %s %s\n", dot, pad(it.When, 14), pad(clip(purpose(it)+scope, 40), 40), dim(it.Label))
		}
	}
	fmt.Printf("\n%s\n%s\n%s\n%s\n",
		dim("● running now  ○ installed, not running"),
		dim("Turn these off per company in System Settings → General → Login Items & Extensions → Allow in the Background."),
		dim("Ones you've turned off there still show here (the files stay installed), but won't start."),
		dim("Brew services: brew services stop <name>. Uninstalling the app usually removes its items too."))
	return nil
}

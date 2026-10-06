package main

import (
	"fmt"
	"strings"
)

// Verdict is the one-word advice for a process.
type Verdict int

const (
	Leave Verdict = iota // part of macOS; killing it does nothing useful
	Wait                 // temporary work that finishes on its own
	Quit                 // an app you can quit normally
	Check                // could be anything; look at what it is
)

// Entry is what we know about a process, keyed by executable or app name.
type Entry struct {
	Title       string
	Names       []string // exact executable or .app names, any case
	Prefixes    []string // executable name prefixes, any case
	What        string   // what it is
	Why         string   // why it might be busy
	Tip         string   // what to do about it
	Free        string   // how to get its memory back, when not "Quitting <Title>"
	Verdict     Verdict
	Interpreter bool // runs someone else's code; show the command line
	NoStop      bool // the app refuses to stop it: doing so breaks your session
}

var knowledge = []Entry{
	// macOS itself
	{
		Title:   "kernel_task",
		Names:   []string{"kernel_task"},
		NoStop:  true,
		What:    "The core of macOS.",
		Why:     "High CPU here is often deliberate: macOS makes kernel_task hog the CPU so other work can't overheat the machine.",
		Tip:     "Check for heat: a blocked vent, a laptop on a blanket, a hot charger or a weak USB-C power supply.",
		Verdict: Leave,
	},
	{
		Title:   "launchd",
		Names:   []string{"launchd"},
		What:    "Starts and supervises every other process on the system.",
		Verdict: Leave,
		NoStop:  true,
	},
	{
		Title:   "loginwindow",
		Names:   []string{"loginwindow"},
		What:    "Your login session. Every app you have open runs under it.",
		Why:     "Stopping it logs you out on the spot, and unsaved work in every app is lost.",
		Verdict: Leave,
		NoStop:  true,
	},
	{
		Title:   "Finder, Dock & menu bar",
		Names:   []string{"Finder", "Dock", "SystemUIServer", "WindowManager", "NotificationCenter"},
		What:    "Part of the macOS desktop: Finder, the Dock, the menu bar, window management or notifications.",
		Why:     "macOS restarts these straight away if they stop, so stopping them only helps if one is frozen.",
		Verdict: Leave,
	},
	{
		Title:   "WindowServer",
		Names:   []string{"WindowServer"},
		NoStop:  true,
		What:    "Draws everything on your screen.",
		Why:     "Busy with lots of windows, high-resolution external displays, video, or apps that animate constantly.",
		Tip:     "Close windows you don't need. On older Macs, Accessibility → Display → Reduce Transparency helps.",
		Verdict: Leave,
	},
	{
		Title:    "Spotlight",
		Names:    []string{"mds", "mds_stores", "mdworker", "mdworker_shared", "mdsync", "mdbulkimport", "corespotlightd", "Spotlight"},
		What:     "Spotlight, indexing your files so search works.",
		Why:      "Spikes after lots of files change (cloning repos, npm install, unzipping, big downloads) and after macOS updates. It usually settles within 10–30 minutes.",
		Tip:      "Keep it out of build and dependency folders: add them (or your whole dev folder) to Spotlight's privacy list in System Settings.",
		Verdict:  Wait,
		Prefixes: []string{"mdworker"},
	},
	{
		Title:   "Gatekeeper (syspolicyd)",
		Names:   []string{"syspolicyd"},
		What:    "Gatekeeper, checking that the apps and programs you run are signed and not known malware.",
		Why:     "Spikes after you install apps, or when you run lots of freshly built binaries (compilers, test runs, npm packages).",
		Tip:     "Developers: add your terminal under System Settings → Privacy & Security → Developer Tools and things you run from it skip these checks.",
		Verdict: Wait,
	},
	{
		Title:    "XProtect",
		Prefixes: []string{"xprotect"},
		What:     "Apple's built-in malware scanner.",
		Why:      "Scans new downloads and runs periodic sweeps, usually briefly.",
		Verdict:  Wait,
	},
	{
		Title:   "Photos analysis",
		Names:   []string{"photoanalysisd", "mediaanalysisd", "photolibraryd", "cloudphotod"},
		What:    "Photos, scanning your library for faces, objects and text.",
		Why:     "Runs after importing photos or updating macOS, mostly when the Mac is idle and plugged in.",
		Tip:     "Leave the Mac plugged in overnight with Photos closed and it finishes much faster.",
		Verdict: Wait,
	},
	{
		Title:   "Time Machine",
		Names:   []string{"backupd", "backupd-helper"},
		What:    "Time Machine, backing up your files.",
		Why:     "Busy during a backup, especially the first one or after big changes.",
		Tip:     "Exclude big, rebuildable folders (VMs, caches, node_modules) in Time Machine's options.",
		Verdict: Wait,
	},
	{
		Title:   "iCloud sync",
		Names:   []string{"cloudd", "bird", "fileproviderd"},
		What:    "iCloud, syncing files and app data.",
		Why:     "Busy after adding lots of files to iCloud Drive, or Desktop & Documents if those sync.",
		Tip:     "Don't keep code repos or build output in iCloud-synced folders.",
		Verdict: Wait,
	},
	{
		Title:   "Software updates",
		Names:   []string{"softwareupdated", "installd", "storedownloadd", "appstoreagent", "nsurlsessiond"},
		What:    "Downloading and installing macOS or App Store updates in the background.",
		Verdict: Wait,
	},
	{
		Title:   "System downloads (mobileassetd)",
		Names:   []string{"mobileassetd"},
		What:    "Downloads system content in the background: fonts, dictionaries, Siri voices and on-device AI models.",
		Why:     "Busy after macOS updates or when you turn on a feature that needs new content.",
		Verdict: Wait,
	},
	{
		Title:   "Siri & Suggestions",
		Names:   []string{"contextstored", "knowledge-agent", "duetexpertd", "suggestd", "biomesyncd", "BiomeAgent", "biomed", "intelligenceplatformd", "siriknowledged"},
		What:    "On-device learning for Siri, Spotlight ranking and app suggestions.",
		Why:     "Catches up in bursts, especially after updates.",
		Verdict: Wait,
	},
	{
		Title:   "Crash reporting",
		Names:   []string{"ReportCrash", "ReportMemoryException", "spindump", "diagnosticd"},
		What:    "macOS writing a report about something that just crashed or froze.",
		Why:     "Only busy right after a crash or hang; finishes within a minute or so.",
		Verdict: Wait,
	},
	{
		Title:   "trustd",
		Names:   []string{"trustd"},
		What:    "Checks security certificates for websites and signed software.",
		Verdict: Wait,
	},
	{
		Title:   "logd",
		Names:   []string{"logd"},
		What:    "The system log.",
		Why:     "If it's busy, some app is flooding the log with messages.",
		Verdict: Leave,
	},
	{
		Title:   "coreaudiod",
		Names:   []string{"coreaudiod"},
		What:    "Handles all sound on your Mac.",
		Tip:     "If audio is glitchy or missing, `sudo killall coreaudiod` restarts it safely.",
		Verdict: Leave,
	},
	{
		Title:    "Audio drivers",
		Prefixes: []string{"core audio driver"},
		What:     "A virtual audio device that an app installed (Teams, Zoom, Loopback and so on) so it can share or capture sound.",
		Why:      "Normally idle. If it's busy, audio is flowing through it.",
		Verdict:  Leave,
	},
	{
		Title:   "Continuity (rapportd)",
		Names:   []string{"rapportd"},
		What:    "Continuity: Handoff, Universal Clipboard and iPhone features between your Apple devices.",
		Verdict: Leave,
	},
	{
		Title:   "ControlCenter",
		Names:   []string{"ControlCenter"},
		What:    "The menu bar's Control Center, and the AirPlay Receiver, which listens on ports 5000 and 7000.",
		Verdict: Leave,
	},
	{
		Title:   "Web pages (WebKit)",
		Names:   []string{"com.apple.WebKit.WebContent"},
		What:    "Each Safari tab, and each web view inside apps like Mail, runs in its own WebContent process.",
		Why:     "A heavy page: video, a big web app, ads, or runaway JavaScript.",
		Tip:     "Activity Monitor names the page behind each WebContent process, so you can close that tab.",
		Free:    "Closing heavy Safari tabs",
		Verdict: Quit,
	},
	{
		Title:    "Build tools",
		Names:    []string{"clang", "swift-frontend", "swiftc", "rustc", "cc1", "cc1plus", "ld", "compile", "xcodebuild", "cargo", "make", "ninja"},
		What:     "A compiler or build tool.",
		Why:      "Builds use every core on purpose; this ends when the build does.",
		Verdict:  Wait,
		Prefixes: []string{"clang-"},
	},

	// Apps and services people install
	{
		Title:   "Docker",
		Names:   []string{"Docker", "Docker Desktop", "com.docker.backend", "com.docker.hyperkit", "com.docker.virtualization", "com.docker.vpnkit"},
		What:    "Docker Desktop, which runs a Linux virtual machine for your containers.",
		Why:     "The VM reserves memory up front, even when no containers are doing anything.",
		Tip:     "Lower the memory limit in Docker → Settings → Resources, or quit Docker when you're not using it.",
		Verdict: Quit,
	},
	{
		Title:   "Virtual machine",
		Names:   []string{"com.apple.Virtualization.VirtualMachine", "qemu-system-aarch64", "qemu-system-x86_64"},
		What:    "A virtual machine (Docker, UTM, Parallels, colima, OrbStack or similar).",
		Why:     "VMs hold on to all the memory they were given.",
		Tip:     "Shut the VM down from the app that started it.",
		Verdict: Quit,
	},
	{
		Title:   "Adobe Creative Cloud",
		Names:   []string{"Creative Cloud", "Adobe Desktop Service", "AdobeIPCBroker", "Core Sync", "CCXProcess", "CCLibrary", "Adobe Crash Handler", "ACCFinderSync", "AdobeResourceSynchronizer"},
		What:    "Adobe's background services: sync, updates, fonts and licensing. They run even when no Adobe app is open.",
		Tip:     "Quit it from its menu-bar icon, and turn off \"Launch at login\" in its preferences.",
		Verdict: Quit,
	},
	{
		Title:   "AI coding assistant",
		Names:   []string{"claude", "codex", "aider", "gemini"},
		What:    "A command-line AI coding assistant.",
		Why:     "Busy while it's working or running tools; idle otherwise.",
		Verdict: Quit,
	},
	editor("Visual Studio Code"),
	editor("Cursor"),
	browser("Google Chrome"),
	browser("Microsoft Edge"),
	browser("Brave Browser"),
	browser("Arc"),
	browser("Chromium"),
	{
		Title:   "Firefox",
		Names:   []string{"Firefox", "firefox", "plugin-container"},
		What:    "Your browser. Tabs and extensions run in separate content processes.",
		Why:     "A heavy tab (video, a big web app, runaway JavaScript) or an extension.",
		Tip:     "Open about:processes in Firefox to see which tab.",
		Verdict: Quit,
	},

	// Interpreters: what they do depends entirely on the script
	interpreter("node", "A JavaScript program (Node.js)."),
	interpreter("bun", "A JavaScript program (Bun)."),
	interpreter("deno", "A JavaScript program (Deno)."),
	interpreter("python", "A Python program.", "python"),
	interpreter("ruby", "A Ruby program."),
	interpreter("java", "A Java program."),
	interpreter("php", "A PHP program."),
	interpreter("perl", "A Perl script.", "perl"),
}

func browser(name string) Entry {
	return Entry{
		Title:   name,
		Names:   []string{name},
		What:    "Your browser. Every tab, extension and GPU task is its own helper process, so it shows up many times.",
		Why:     "Usually one heavy tab (video, a big web app, runaway JavaScript) or an extension.",
		Tip:     "Window → Task Manager (Shift+Esc on Windows keyboards) shows exactly which tab or extension.",
		Verdict: Quit,
	}
}

func editor(name string) Entry {
	return Entry{
		Title:   name,
		Names:   []string{name},
		What:    "Your editor. Extensions and language servers run as separate helper processes.",
		Why:     "Usually an extension: a language server indexing, or a file watcher on a huge folder.",
		Tip:     "Help → Open Process Explorer shows which extension.",
		Verdict: Quit,
	}
}

func interpreter(name, what string, prefixes ...string) Entry {
	return Entry{
		Title:       name,
		Names:       []string{name},
		Prefixes:    prefixes,
		What:        what,
		Verdict:     Check,
		Interpreter: true,
	}
}

var byName = func() map[string]*Entry {
	m := map[string]*Entry{}
	for i := range knowledge {
		for _, n := range knowledge[i].Names {
			m[strings.ToLower(n)] = &knowledge[i]
		}
	}
	return m
}()

// lookup matches the executable name first, so a specific helper can have its
// own entry, then falls back to the app bundle it lives in.
func lookup(p Proc) *Entry {
	name := strings.ToLower(p.Name)
	if e := byName[name]; e != nil {
		return e
	}
	for i := range knowledge {
		for _, pre := range knowledge[i].Prefixes {
			if strings.HasPrefix(name, pre) {
				return &knowledge[i]
			}
		}
	}
	if p.App != "" {
		return byName[strings.ToLower(p.App)]
	}
	return nil
}

// guess describes a process the knowledge base doesn't cover, from where its
// binary lives.
func guess(p Proc) (string, Verdict) {
	switch {
	// Apps in /System/Applications (Terminal, Notes, Mail...) and Safari's
	// cryptex are ordinary apps; everything else under /System is macOS.
	case hasAnyPrefix(p.Path, "/System/", "/usr/libexec/", "/usr/sbin/", "/sbin/", "/usr/bin/", "/Library/Apple/") &&
		!hasAnyPrefix(p.Path, "/System/Applications/", "/System/Volumes/Preboot/Cryptexes/App/System/Applications/"):
		return "A built-in macOS component. macOS restarts these if they're killed, so it's rarely worth it.", Leave
	case p.App != "" && strings.Contains(p.Name, "Helper"):
		return fmt.Sprintf("A background helper of %s (a renderer, GPU process, plugin or extension).", p.App), Quit
	case p.App != "":
		return fmt.Sprintf("Part of the %s app.", p.App), Quit
	case hasAnyPrefix(p.Path, "/opt/homebrew/", "/usr/local/"):
		return "A command-line tool, probably installed with Homebrew.", Check
	case strings.HasPrefix(p.Path, "/Library/"):
		return "A background service that some app installed system-wide.", Check
	case inHome(p.Path):
		return "A program in your home folder: something you built, or a tool you installed.", Check
	case !strings.HasPrefix(p.Path, "/"):
		return "macOS doesn't show where this one lives. Usually a command started from a terminal or script, or a sandboxed service.", Check
	}
	return "Not in the knowledge base yet.", Check
}

func hasAnyPrefix(s string, prefixes ...string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

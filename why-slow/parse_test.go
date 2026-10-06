package main

import (
	"os"
	"strings"
	"testing"
	"time"
)

func TestParsePsLine(t *testing.T) {
	line := "36749  1102   6.9 379904    14:52:40 /Applications/Utilities/Adobe Creative Cloud/ACC/Creative Cloud.app/Contents/Frameworks/Creative Cloud UI Helper (Renderer).app/Contents/MacOS/Creative Cloud UI Helper (Renderer)"
	p, ok := parsePsLine(line)
	if !ok {
		t.Fatal("did not parse")
	}
	if p.PID != 36749 || p.PPID != 1102 || p.CPU != 6.9 || p.RSS != 379904*1024 {
		t.Errorf("numbers wrong: %+v", p)
	}
	if p.Name != "Creative Cloud UI Helper (Renderer)" || p.App != "Creative Cloud" {
		t.Errorf("name %q app %q", p.Name, p.App)
	}
	if e := lookup(p); e == nil || e.Title != "Adobe Creative Cloud" {
		t.Errorf("lookup = %v", e)
	}
}

func TestParseEtime(t *testing.T) {
	for in, want := range map[string]time.Duration{
		"00:33":       33 * time.Second,
		"01:20:15":    time.Hour + 20*time.Minute + 15*time.Second,
		"06-15:23:38": 6*24*time.Hour + 15*time.Hour + 23*time.Minute + 38*time.Second,
	} {
		if got := parseEtime(in); got != want {
			t.Errorf("parseEtime(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestGroupingSpotlightAndInterpreters(t *testing.T) {
	procs := []Proc{
		{PID: 1, Name: "mds", CPU: 10},
		{PID: 2, Name: "mdworker_shared", CPU: 20},
		{PID: 3, Name: "mds_stores", CPU: 5},
		{PID: 4, Name: "node", CPU: 1},
		{PID: 5, Name: "node", CPU: 1},
		{PID: 6, Name: "python3.9", CPU: 1},
	}
	groups := groupProcs(procs)
	if len(groups) != 4 {
		t.Fatalf("got %d groups, want 4 (Spotlight, node, node, python)", len(groups))
	}
	if groups[0].Title != "Spotlight" || groups[0].CPU != 35 {
		t.Errorf("spotlight group = %+v", groups[0])
	}
	if groups[3].Entry == nil || !groups[3].Entry.Interpreter {
		t.Errorf("python3.9 should match the python interpreter entry")
	}
}

func TestParseListeners(t *testing.T) {
	out := "p505\nf8\nn*:52489\nf9\nn*:52489\np591\nf8\nn*:7000\np853\nf36\nn127.0.0.1:49166\nf37\nn[::1]:49166\n"
	got := parseListeners(out)
	want := []Listener{{591, 7000, true}, {853, 49166, false}, {505, 52489, true}}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("listener %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

func TestParseSysctl(t *testing.T) {
	if l := parseLoad("{ 7.71 4.55 3.26 }"); l != [3]float64{7.71, 4.55, 3.26} {
		t.Errorf("load = %v", l)
	}
	total, used := parseSwap("total = 3072.00M  used = 1592.31M  free = 1479.69M  (encrypted)")
	if total != 3072<<20 || used/(1<<20) != 1592 {
		t.Errorf("swap total %d used %d", total, used)
	}
}

func TestLaunchItemNaming(t *testing.T) {
	cisco := LaunchItem{
		Label:   "com.cisco.anyconnect.gui",
		Program: "/usr/bin/open",
		Args:    []string{"/usr/bin/open", "-a", "/opt/cisco/anyconnect/Cisco AnyConnect Secure Mobility Client.app"},
	}
	if v := vendorOf(cisco); v != "Cisco" {
		t.Errorf("vendor = %q", v)
	}
	if p := purpose(cisco); p != "Cisco AnyConnect Secure Mobility Client" {
		t.Errorf("purpose = %q", p)
	}

	ags := LaunchItem{
		Label:   "Adobe_Genuine_Software_Integrity_Service",
		Program: "/Library/Application Support/Adobe/AdobeGCClient/AGSService",
	}
	if v := vendorOf(ags); v != "Adobe" {
		t.Errorf("vendor from path = %q", v)
	}
	if v := vendorOf(LaunchItem{Label: "homebrew.mxcl.postgresql@16"}); v != "Homebrew services" {
		t.Errorf("brew vendor = %q", v)
	}
	if p := purpose(LaunchItem{Label: "homebrew.mxcl.redis"}); p != "brew service: redis" {
		t.Errorf("brew purpose = %q", p)
	}
}

func TestKeepAlive(t *testing.T) {
	if !keepAlive(true) || keepAlive(false) || keepAlive(nil) {
		t.Error("bool forms")
	}
	if !keepAlive(map[string]any{"SuccessfulExit": false}) {
		t.Error("dictionary form means conditionally kept alive")
	}
}

func TestBundlePaths(t *testing.T) {
	helper := "/Applications/Utilities/Adobe Creative Cloud/ACC/Creative Cloud.app/Contents/MacOS/../Frameworks/Creative Cloud UI Helper.app/Contents/MacOS/Creative Cloud UI Helper"
	if got := appPath(helper); got != "/Applications/Utilities/Adobe Creative Cloud/ACC/Creative Cloud.app" {
		t.Errorf("appPath = %q", got)
	}
	if got := appPath("/usr/bin/open"); got != "" {
		t.Errorf("appPath of a plain binary = %q", got)
	}
	viaOpen := LaunchItem{Program: "/usr/bin/open", Args: []string{"/usr/bin/open", "-a", "/Applications/Foo.app"}}
	if got := targetBundle(viaOpen); got != "/Applications/Foo.app" {
		t.Errorf("targetBundle = %q", got)
	}
}

func TestVerdictsForMacOSComponents(t *testing.T) {
	for _, c := range []struct {
		path    string
		verdict Verdict
		canStop bool
	}{
		{"/System/Library/CoreServices/loginwindow.app/Contents/MacOS/loginwindow", Leave, false},
		{"/System/Library/CoreServices/Dock.app/Contents/MacOS/Dock", Leave, true},
		{"/System/Library/CoreServices/AirPlayUIAgent.app/Contents/MacOS/AirPlayUIAgent", Leave, true},
		{"/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal", Quit, true},
		{"/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari", Quit, true},
		{"/Applications/Slack.app/Contents/MacOS/Slack", Quit, true},
	} {
		p, _ := parsePsLine("1 1 0.0 100 00:01 " + c.path)
		g := groupProcs([]Proc{p})[0]
		if g.Verdict() != c.verdict || g.CanStop() != c.canStop {
			t.Errorf("%s: verdict %v canStop %v, want %v %v", p.Name, g.Verdict(), g.CanStop(), c.verdict, c.canStop)
		}
	}
}

func TestListenersOnLANAddressAreExposed(t *testing.T) {
	got := parseListeners("p1\nn192.168.1.5:5173\np2\nn127.0.0.1:3000\n")
	if !got[1].Exposed || got[0].Exposed {
		t.Errorf("want 5173 on a LAN IP exposed and 3000 on loopback private, got %+v", got)
	}
}

func TestPrintable(t *testing.T) {
	if got := printable("evil\x1b]0;pwned\x07name\u0085"); got != "evil?]0;pwned?name?" {
		t.Errorf("printable = %q", got)
	}
	if got := printable("Café Helper (Renderer)"); got != "Café Helper (Renderer)" {
		t.Errorf("ordinary text changed: %q", got)
	}
}

func TestInHome(t *testing.T) {
	home, _ := os.UserHomeDir()
	if !inHome(home+"/Desktop") || inHome(home+"2/Desktop") || tildify(home+"2/x") != home+"2/x" {
		t.Error("home boundary")
	}
}

func TestRunUsesCLocale(t *testing.T) {
	t.Setenv("LC_ALL", "de_DE.UTF-8")
	out, err := run("sysctl", "-n", "vm.loadavg")
	if err != nil {
		t.Fatal(err)
	}
	if l := parseLoad(out); strings.Contains(out, ",") || (l == [3]float64{} && !strings.Contains(out, "0.00 0.00 0.00")) {
		t.Errorf("load not parseable under a German locale: %q", out)
	}
	if _, err := run("sh", "-c", "true"); err == nil {
		t.Error("run should refuse commands outside its list")
	}
}

package main

import (
	"strings"
	"testing"
)

func calmSystem() System {
	return System{
		NCPU:          10,
		Load:          [3]float64{1, 1, 1},
		MemTotal:      16 << 30,
		MemFreePct:    65,
		DiskFree:      200 << 30,
		DiskTotal:     500 << 30,
		CPUSpeedLimit: 100,
	}
}

func titles(fs []Finding) string {
	var ts []string
	for _, f := range fs {
		ts = append(ts, f.Title)
	}
	return strings.Join(ts, " | ")
}

func TestDiagnoseCalm(t *testing.T) {
	s := calmSystem()
	s.SwapUsed = 3 << 30 // left over from earlier; plenty of memory is free now
	status, fs := diagnose(s, groupProcs([]Proc{{PID: 1, Name: "launchd", Path: "/sbin/launchd"}}))
	if status != "Calm" || len(fs) != 1 || fs[0].Title != "Nothing looks wrong right now." {
		t.Errorf("status %q, findings %s", status, titles(fs))
	}
}

func TestDiagnoseBusyProcess(t *testing.T) {
	groups := groupProcs([]Proc{
		{PID: 10, Name: "mds_stores", CPU: 70},
		{PID: 11, Name: "mdworker_shared", CPU: 50},
		{PID: 12, Name: "WindowServer", CPU: 5},
	})
	_, fs := diagnose(calmSystem(), groups)
	if len(fs) != 1 || fs[0].Title != "Spotlight is using 12% of your CPU across 2 processes." {
		t.Fatalf("findings %s", titles(fs))
	}
	if last := fs[0].Lines[len(fs[0].Lines)-1]; !strings.HasPrefix(last, "Tip: ") {
		t.Errorf("expected a tip last, got %q", last)
	}
}

func TestDiagnoseLowMemory(t *testing.T) {
	s := calmSystem()
	s.MemFreePct = 15
	s.SwapUsed = 3 << 30
	groups := groupProcs([]Proc{
		{PID: 20, Name: "com.apple.WebKit.WebContent", RSS: 2 << 30},
		{PID: 21, Name: "WindowServer", RSS: 1 << 30},
	})
	status, fs := diagnose(s, groups)
	if status != "Busy" || len(fs) != 1 || fs[0].Title != "Memory is tight: 15% free." {
		t.Fatalf("status %q, findings %s", status, titles(fs))
	}
	body := strings.Join(fs[0].Lines, "\n")
	for _, want := range []string{"swapped out to disk", "Closing heavy Safari tabs would free about 2.0 GB."} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q in:\n%s", want, body)
		}
	}
}

func TestDiagnoseSwapOnlyDoesNotRepeatItself(t *testing.T) {
	s := calmSystem()
	s.MemFreePct = 30
	s.SwapUsed = 3 << 30
	_, fs := diagnose(s, groupProcs([]Proc{{PID: 30, Name: "Slack", App: "Slack", RSS: 1 << 30}}))
	if len(fs) != 1 || fs[0].Title != "3.0 GB has spilled into swap." {
		t.Fatalf("findings %s", titles(fs))
	}
	for _, l := range fs[0].Lines {
		if strings.Contains(l, "swapped out") {
			t.Errorf("swap repeated in body: %q", l)
		}
	}
}

func TestDiagnoseThrottledAndFullDisk(t *testing.T) {
	s := calmSystem()
	s.CPUSpeedLimit = 70
	s.DiskFree = 5 << 30
	status, fs := diagnose(s, nil)
	if status != "Struggling" || len(fs) != 2 {
		t.Fatalf("status %q, findings %s", status, titles(fs))
	}
	if !strings.Contains(fs[0].Title, "70% speed") || !strings.Contains(fs[1].Title, "nearly full") {
		t.Errorf("findings %s", titles(fs))
	}
}

func TestDiagnoseRunawayCopies(t *testing.T) {
	var procs []Proc
	for i := 0; i < 48; i++ {
		procs = append(procs, Proc{PID: 1000 + i, PPID: 1, Name: "Python", CPU: 22, Args: "/usr/bin/python3 lab1A.py"})
	}
	procs = append(procs, Proc{PID: 2000, PPID: 500, Name: "python3", CPU: 1, Args: "python3 server.py"})
	groups := groupProcs(procs)
	if len(groups) != 2 {
		t.Fatalf("want the 48 copies as one group plus server.py, got %d groups", len(groups))
	}
	_, fs := diagnose(calmSystem(), groups)
	if len(fs) == 0 || !strings.Contains(fs[0].Title, "across 48 processes") {
		t.Fatalf("findings %s", titles(fs))
	}
	if body := strings.Join(fs[0].Lines, "\n"); !strings.Contains(body, "pkill -f '/usr/bin/python3 lab1A.py'") {
		t.Errorf("expected a pkill hint, got:\n%s", body)
	}
}

func TestShare(t *testing.T) {
	for _, c := range []struct {
		cpu  float64
		ncpu int
		want string
	}{
		{1050, 10, "100%"}, // ps overshoots a little when everything is busy
		{1000, 10, "100%"},
		{120, 10, "12%"},
		{22, 10, "2.2%"},
		{50, 1, "50%"},
	} {
		if got := share(c.cpu, c.ncpu); got != c.want {
			t.Errorf("share(%v, %d) = %q, want %q", c.cpu, c.ncpu, got, c.want)
		}
	}
}

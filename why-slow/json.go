package main

import (
	"encoding/json"
	"os"
	"sort"
	"strings"
)

// The JSON report is what the Mac app reads: everything the CLI can show,
// gathered in one pass.

type jsonReport struct {
	Status   string       `json:"status"`
	System   jsonSystem   `json:"system"`
	Findings []Finding    `json:"findings"`
	Groups   []jsonGroup  `json:"groups"`
	Ports    []jsonPort   `json:"ports"`
	Login    []jsonVendor `json:"login"`
}

type jsonSystem struct {
	Cores         int        `json:"cores"`
	Load          [3]float64 `json:"load"`
	MemTotal      uint64     `json:"memTotal"`
	MemFreePct    int        `json:"memFreePct"`
	SwapUsed      uint64     `json:"swapUsed"`
	SwapTotal     uint64     `json:"swapTotal"`
	DiskFree      uint64     `json:"diskFree"`
	DiskTotal     uint64     `json:"diskTotal"`
	CPUSpeedLimit int        `json:"cpuSpeedLimit"`
}

type jsonGroup struct {
	Title   string     `json:"title"`
	Verdict string     `json:"verdict"`
	What    string     `json:"what"`
	Why     string     `json:"why,omitempty"`
	Tip     string     `json:"tip,omitempty"`
	Command string     `json:"command,omitempty"`
	AppPath string     `json:"appPath,omitempty"`
	CPU     float64    `json:"cpu"`
	Memory  uint64     `json:"memory"`
	Procs   []jsonProc `json:"procs"`
}

type jsonProc struct {
	PID    int     `json:"pid"`
	Parent string  `json:"parent"`
	CPU    float64 `json:"cpu"`
	Memory uint64  `json:"memory"`
	Uptime int64   `json:"uptime"` // seconds
	Path   string  `json:"path"`
}

type jsonPort struct {
	Port    int    `json:"port"`
	PID     int    `json:"pid"`
	Title   string `json:"title"`
	Verdict string `json:"verdict"`
	Detail  string `json:"detail"`
	Note    string `json:"note,omitempty"`
	Exposed bool   `json:"exposed"`
	Uptime  int64  `json:"uptime"`
}

type jsonVendor struct {
	Name    string           `json:"name"`
	Running int              `json:"running"`
	Memory  uint64           `json:"memory"`
	Items   []jsonLaunchItem `json:"items"`
}

type jsonLaunchItem struct {
	Label      string `json:"label"`
	When       string `json:"when"`
	Purpose    string `json:"purpose"`
	PID        int    `json:"pid"`
	SystemWide bool   `json:"systemWide"`
}

// Key is the verdict as a stable identifier rather than display text.
func (v Verdict) Key() string {
	return [...]string{"leave", "wait", "quit", "check"}[v]
}

// appPath is the outermost .app bundle a binary lives in, so the app can
// find and quit the running application rather than one of its helpers.
func appPath(path string) string {
	if i := strings.Index(path+"/", ".app/"); i >= 0 {
		return path[:i+len(".app")]
	}
	return ""
}

func writeJSON() error {
	sys := readSystem()
	procs, err := listProcs()
	if err != nil {
		return err
	}
	groups := groupProcs(procs)
	byPID := map[int]Proc{}
	for _, p := range procs {
		byPID[p.PID] = p
	}

	status, findings := diagnose(sys, groups)
	r := jsonReport{
		Status:   status,
		Findings: findings,
		System: jsonSystem{
			Cores: sys.NCPU, Load: sys.Load, MemTotal: sys.MemTotal, MemFreePct: sys.MemFreePct,
			SwapUsed: sys.SwapUsed, SwapTotal: sys.SwapTotal, DiskFree: sys.DiskFree, DiskTotal: sys.DiskTotal,
			CPUSpeedLimit: sys.CPUSpeedLimit,
		},
		Groups: []jsonGroup{},
		Ports:  []jsonPort{},
		Login:  []jsonVendor{},
	}

	for _, g := range relevantGroups(groups) {
		jg := jsonGroup{
			Title: g.Title, Verdict: g.Verdict().Key(), What: g.What(),
			CPU: g.CPU, Memory: g.RSS, AppPath: appPath(g.Top().Path),
		}
		if g.Entry != nil {
			jg.Why, jg.Tip = g.Entry.Why, g.Entry.Tip
		}
		if g.Verdict() == Check {
			jg.Command = commandLine(g.Top())
		}
		for _, p := range g.Procs {
			jg.Procs = append(jg.Procs, jsonProc{
				PID: p.PID, Parent: byPID[p.PPID].Name, CPU: p.CPU, Memory: p.RSS,
				Uptime: int64(p.Elapsed.Seconds()), Path: p.Path,
			})
		}
		sort.SliceStable(jg.Procs, func(i, j int) bool { return jg.Procs[i].CPU > jg.Procs[j].CPU })
		r.Groups = append(r.Groups, jg)
	}

	for _, in := range collectPorts(procs) {
		r.Ports = append(r.Ports, jsonPort{
			Port: in.Port, PID: in.PID, Title: in.Title, Verdict: in.Verdict.Key(), Detail: in.Detail,
			Note: in.Note, Exposed: in.Exposed, Uptime: int64(in.Proc.Elapsed.Seconds()),
		})
	}

	for _, v := range collectLogin(procs) {
		jv := jsonVendor{Name: v.Name, Running: v.Running, Memory: v.RSS}
		for _, it := range v.Items {
			jv.Items = append(jv.Items, jsonLaunchItem{
				Label: it.Label, When: it.When, Purpose: purpose(it), PID: it.PID, SystemWide: it.Daemon,
			})
		}
		r.Login = append(r.Login, jv)
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	return enc.Encode(r)
}

// relevantGroups is the top of both the CPU and memory rankings, without
// the hundreds of idle system daemons below them.
func relevantGroups(groups []*Group) []*Group {
	seen := map[*Group]bool{}
	var out []*Group
	add := func(sorted []*Group, keep func(*Group) bool) {
		for i, g := range sorted {
			if i >= 40 || !keep(g) {
				break
			}
			if !seen[g] {
				seen[g] = true
				out = append(out, g)
			}
		}
	}
	add(sortByCPU(groups), func(g *Group) bool { return g.CPU >= 0.5 })
	add(sortByRSS(groups), func(g *Group) bool { return g.RSS >= 20<<20 })
	return out
}

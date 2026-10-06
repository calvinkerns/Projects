package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Proc is one running process as reported by ps.
type Proc struct {
	PID, PPID int
	CPU       float64 // percent of one core, so it can exceed 100
	RSS       uint64  // bytes
	Elapsed   time.Duration
	Path      string
	Name      string // basename of Path
	App       string // outermost .app bundle the binary lives in, if any
}

func listProcs() ([]Proc, error) {
	out, err := run("ps", "-axo", "pid=,ppid=,pcpu=,rss=,etime=,comm=")
	if err != nil {
		return nil, fmt.Errorf("running ps: %w", err)
	}
	self := os.Getpid()
	// The Mac app runs us and asks not to be listed: a monitor showing up as
	// the busiest thing on the machine (because it just launched) is noise.
	caller, _ := strconv.Atoi(os.Getenv("WHY_SLOW_HIDE_PID"))
	var procs []Proc
	for _, line := range strings.Split(out, "\n") {
		p, ok := parsePsLine(line)
		if !ok || p.PID == self || p.PPID == self || (caller != 0 && p.PID == caller) {
			continue
		}
		procs = append(procs, p)
	}
	return procs, nil
}

// parsePsLine splits the five numeric columns off the front; whatever remains
// is the executable path, which may contain spaces.
func parsePsLine(line string) (Proc, bool) {
	rest := strings.TrimSpace(line)
	var fields [5]string
	for i := range fields {
		j := strings.IndexAny(rest, " \t")
		if j < 0 {
			return Proc{}, false
		}
		fields[i] = rest[:j]
		rest = strings.TrimLeft(rest[j:], " \t")
	}
	if rest == "" {
		return Proc{}, false
	}
	var p Proc
	var err error
	if p.PID, err = strconv.Atoi(fields[0]); err != nil {
		return Proc{}, false
	}
	p.PPID, _ = strconv.Atoi(fields[1])
	p.CPU, _ = strconv.ParseFloat(fields[2], 64)
	kb, _ := strconv.ParseUint(fields[3], 10, 64)
	p.RSS = kb * 1024
	p.Elapsed = parseEtime(fields[4])
	p.Path = rest
	p.Name = filepath.Base(rest)
	p.App = appBundle(rest)
	return p, true
}

// parseEtime reads ps's elapsed time: [[dd-]hh:]mm:ss.
func parseEtime(s string) time.Duration {
	days := 0
	if i := strings.IndexByte(s, '-'); i >= 0 {
		days, _ = strconv.Atoi(s[:i])
		s = s[i+1:]
	}
	secs := 0
	for _, part := range strings.Split(s, ":") {
		n, _ := strconv.Atoi(part)
		secs = secs*60 + n
	}
	return time.Duration(days*86400+secs) * time.Second
}

// appBundle returns "Creative Cloud" for
// ".../Creative Cloud.app/Contents/Frameworks/Helper.app/Contents/MacOS/Helper".
func appBundle(path string) string {
	i := strings.Index(path+"/", ".app/")
	if i < 0 {
		return ""
	}
	return filepath.Base(path[:i])
}

// Group is a set of processes that belong to the same thing from the user's
// point of view: all of Spotlight's workers, or every helper of one browser.
type Group struct {
	Title string
	Entry *Entry // nil when the knowledge base has nothing on it
	Procs []Proc
	CPU   float64
	RSS   uint64
}

func groupProcs(procs []Proc) []*Group {
	byKey := map[string]*Group{}
	var groups []*Group
	for _, p := range procs {
		e := lookup(p)
		title, key := p.Name, p.Name
		switch {
		case e != nil && e.Interpreter:
			// Two node processes are usually two unrelated projects.
			key = fmt.Sprintf("%s#%d", p.Name, p.PID)
		case e != nil:
			title, key = e.Title, e.Title
		case p.App != "":
			title, key = p.App, p.App
		}
		g := byKey[key]
		if g == nil {
			g = &Group{Title: title, Entry: e}
			byKey[key] = g
			groups = append(groups, g)
		}
		g.Procs = append(g.Procs, p)
		g.CPU += p.CPU
		g.RSS += p.RSS
	}
	return groups
}

// Top is the group's busiest process.
func (g *Group) Top() Proc {
	top := g.Procs[0]
	for _, p := range g.Procs[1:] {
		if p.CPU > top.CPU || (p.CPU == top.CPU && p.RSS > top.RSS) {
			top = p
		}
	}
	return top
}

func (g *Group) What() string {
	if g.Entry != nil {
		return g.Entry.What
	}
	if top := g.Top(); top.App != "" && len(g.Procs) > 1 {
		return fmt.Sprintf("The %s app and its helper processes (renderers, GPU, plugins, extensions).", top.App)
	}
	what, _ := guess(g.Top())
	return what
}

// FreeAction is how to get back the memory this group is using.
func (g *Group) FreeAction() string {
	if g.Entry != nil && g.Entry.Free != "" {
		return g.Entry.Free
	}
	return "Quitting " + g.Title
}

func (g *Group) Verdict() Verdict {
	if g.Entry != nil {
		return g.Entry.Verdict
	}
	_, v := guess(g.Top())
	return v
}

func sortByCPU(groups []*Group) []*Group {
	out := append([]*Group(nil), groups...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].CPU > out[j].CPU })
	return out
}

func sortByRSS(groups []*Group) []*Group {
	out := append([]*Group(nil), groups...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].RSS > out[j].RSS })
	return out
}

// procArgs is the full command line, which says far more than the binary
// name for interpreters ("node" vs "node server/index.js").
func procArgs(pid int) string {
	out, err := run("ps", "-o", "args=", "-p", strconv.Itoa(pid))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// commandLine describes what an interpreter is actually running and where.
func commandLine(p Proc) string {
	args := procArgs(p.PID)
	if args == "" {
		return ""
	}
	s := "`" + clip(tildify(args), 60) + "`"
	if cwd := procCwd(p.PID); cwd != "" && cwd != "/" {
		s += " in " + tildify(cwd)
	}
	return s
}

// procCwd is the directory a process was started in, which usually names the
// project a forgotten dev server belongs to.
func procCwd(pid int) string {
	out, _ := run("lsof", "-a", "-p", strconv.Itoa(pid), "-d", "cwd", "-Fn")
	for _, line := range strings.Split(out, "\n") {
		if strings.HasPrefix(line, "n") {
			return line[1:]
		}
	}
	return ""
}

package main

import (
	"fmt"
	"strings"
	"time"
)

// Finding is one thing worth telling the user about, most important first.
type Finding struct {
	Title string   `json:"title"`
	Lines []string `json:"lines"`
}

func diagnose(s System, groups []*Group) (status string, fs []Finding) {
	loadRatio := s.Load[0] / float64(s.NCPU)
	memKnown := s.MemFreePct >= 0
	lowMem := memKnown && s.MemFreePct < 25

	switch {
	case loadRatio > 1.5 || (memKnown && s.MemFreePct < 10) || s.CPUSpeedLimit < 80:
		status = "Struggling"
	case loadRatio > 0.7 || lowMem || s.CPUSpeedLimit < 100:
		status = "Busy"
	default:
		status = "Calm"
	}

	if s.CPUSpeedLimit < 100 {
		fs = append(fs, Finding{
			Title: fmt.Sprintf("Your Mac is hot and has slowed its CPU to %d%% speed.", s.CPUSpeedLimit),
			Lines: []string{"Give it air: hard flat surface, clear vents. Everything else in this report gets worse while it's throttled."},
		})
	}

	// Worth a headline at 10% of the whole Mac (one core pinned, on yours),
	// but never below 40% of one core on Macs with only a few cores.
	busy := max(40, 10*float64(s.NCPU))
	for i, g := range sortByCPU(groups) {
		if i >= 2 || g.CPU < busy {
			break
		}
		fs = append(fs, cpuFinding(g, s.NCPU))
	}

	// macOS doesn't move swapped pages back until they're needed, so swap left
	// over from earlier only matters while memory is still fairly full.
	swapNow := s.SwapUsed > 2<<30 && (!memKnown || s.MemFreePct < 40)
	if lowMem || swapNow {
		fs = append(fs, memoryFinding(s, groups, lowMem))
	}

	if s.DiskTotal > 0 && (s.DiskFree < s.DiskTotal/10 || s.DiskFree < 10<<30) {
		fs = append(fs, Finding{
			Title: fmt.Sprintf("Your disk is nearly full: %s free.", human(s.DiskFree)),
			Lines: []string{
				"macOS needs free space for swap, updates and caches; below about 10% free everything gets slower.",
				"System Settings → General → Storage shows what's taking the space.",
			},
		})
	}

	if len(fs) == 0 {
		if loadRatio > 0.7 {
			fs = append(fs, Finding{
				Title: "Lots of small things are busy, but nothing stands out.",
				Lines: []string{fmt.Sprintf("Load is %.1f on %d cores. Run with --all to see everything.", s.Load[0], s.NCPU)},
			})
		} else {
			fs = append(fs, Finding{
				Title: "Nothing looks wrong right now.",
				Lines: []string{"If it felt slow a moment ago, run why-slow --watch and wait for it to happen again."},
			})
		}
	}
	return status, fs
}

func cpuFinding(g *Group, ncpu int) Finding {
	title := fmt.Sprintf("%s is using %s of your CPU", g.Title, share(g.CPU, ncpu))
	if len(g.Procs) > 1 {
		title += fmt.Sprintf(" across %d processes", len(g.Procs))
	}
	f := Finding{Title: title + "."}
	f.Lines = append(f.Lines, g.What())
	if g.Entry != nil && g.Entry.Why != "" {
		f.Lines = append(f.Lines, g.Entry.Why)
	}
	if g.Verdict() == Check {
		top := g.Top()
		if cmd := commandLine(top); cmd != "" {
			f.Lines = append(f.Lines, "Running "+cmd+".")
		}
		if top.CPU >= 80 && top.Elapsed > time.Hour {
			f.Lines = append(f.Lines, fmt.Sprintf("It has been running for %s. If you don't recognise it, it may be stuck (kill %d).", ago(top.Elapsed), top.PID))
		}
		if n := len(g.Procs); n >= 3 && orphaned(g) {
			f.Lines = append(f.Lines, fmt.Sprintf(
				"All %d copies have outlived the program that started them, so nothing is going to stop them. Stop them all with: pkill -f '%s'",
				n, top.Args))
		}
	}
	if g.Entry != nil && g.Entry.Tip != "" {
		f.Lines = append(f.Lines, "Tip: "+g.Entry.Tip)
	}
	return f
}

// orphaned is true when every process in the group was re-parented to
// launchd, which is what happens when whatever launched them has exited.
func orphaned(g *Group) bool {
	for _, p := range g.Procs {
		if p.PPID != 1 {
			return false
		}
	}
	return true
}

func memoryFinding(s System, groups []*Group, lowMem bool) Finding {
	var f Finding
	if lowMem {
		f.Title = fmt.Sprintf("Memory is tight: %d%% free.", s.MemFreePct)
	} else {
		f.Title = fmt.Sprintf("%s has spilled into swap.", human(s.SwapUsed))
	}

	var biggest []string
	var quittable *Group
	for _, g := range sortByRSS(groups) {
		if len(biggest) < 3 {
			biggest = append(biggest, fmt.Sprintf("%s (%s)", g.Title, human(g.RSS)))
		}
		if quittable == nil && g.Verdict() == Quit {
			quittable = g
		}
	}
	f.Lines = append(f.Lines, "Biggest users: "+strings.Join(biggest, ", ")+".")
	if lowMem && s.SwapUsed > 1<<30 {
		f.Lines = append(f.Lines, fmt.Sprintf("%s is already swapped out to disk, which is far slower than RAM.", human(s.SwapUsed)))
	}
	if quittable != nil {
		f.Lines = append(f.Lines, fmt.Sprintf("%s would free about %s.", quittable.FreeAction(), human(quittable.RSS)))
	}
	return f
}

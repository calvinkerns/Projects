package main

import (
	"fmt"
	"strings"
)

func overview(all bool) error {
	sys := readSystem()
	procs, err := listProcs()
	if err != nil {
		return err
	}
	printOverview(sys, groupProcs(procs), all)
	fmt.Printf("\n%s\n", dim("why-slow explain <name> for details · ports, login and --watch for more"))
	return nil
}

func printOverview(sys System, groups []*Group, all bool) {
	parts := []string{
		fmt.Sprintf("CPU %.0f%% used", totalCPU(groups, sys.NCPU)),
		fmt.Sprintf("load %.1f on %d cores", sys.Load[0], sys.NCPU),
	}
	if sys.GPU >= 0 {
		parts = append(parts, fmt.Sprintf("GPU %d%% used", sys.GPU))
	}
	if sys.MemFreePct >= 0 {
		parts = append(parts, fmt.Sprintf("memory %d%% used of %s", 100-sys.MemFreePct, human(sys.MemTotal)))
	}
	if sys.SwapTotal > 0 {
		parts = append(parts, fmt.Sprintf("swap %s used", human(sys.SwapUsed)))
	}
	if sys.DiskTotal > 0 {
		parts = append(parts, fmt.Sprintf("disk %s used of %s", human(sys.DiskTotal-sys.DiskFree), human(sys.DiskTotal)))
	}

	status, findings := diagnose(sys, groups)
	fmt.Printf("%s  %s\n", bold(paintStatus(status)), dim(strings.Join(parts, " · ")))
	for _, f := range findings {
		fmt.Printf("\n%s %s\n", bold("▶"), bold(f.Title))
		for _, l := range f.Lines {
			fmt.Printf("  %s\n", l)
		}
	}

	limit, minCPU := 6, 1.0
	if all {
		limit, minCPU = 1000, 0.1
	}

	fmt.Printf("\n%s %s\n", bold("CPU"), dim("(share of your whole Mac)"))
	shown := 0
	for _, g := range sortByCPU(groups) {
		if shown >= limit || g.CPU < minCPU {
			break
		}
		printRow(fmt.Sprintf("%7s", share(g.CPU, sys.NCPU)), g)
		shown++
	}
	if shown == 0 {
		fmt.Println(dim("  nothing is using noticeable CPU"))
	}

	fmt.Printf("\n%s\n", bold("MEMORY"))
	for i, g := range sortByRSS(groups) {
		if i >= limit || g.RSS == 0 {
			break
		}
		printRow(fmt.Sprintf("%7s", human(g.RSS)), g)
	}
}

func paintStatus(status string) string {
	switch status {
	case "Struggling":
		return red(status)
	case "Busy":
		return yellow(status)
	}
	return green(status)
}

func printRow(amount string, g *Group) {
	name := g.Title
	if len(g.Procs) > 1 {
		name += fmt.Sprintf(" ×%d", len(g.Procs))
	}
	what := firstSentence(g.What())
	if g.Entry != nil && g.Entry.Interpreter {
		if cmd := commandLine(g.Top()); cmd != "" {
			what = cmd
		}
	}
	fmt.Printf("  %s  %s %s %s\n", amount, pad(clip(name, 28), 28), g.Verdict().Label(), dim(clip(what, 70)))
}

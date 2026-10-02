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
		fmt.Sprintf("%d cores", sys.NCPU),
		fmt.Sprintf("load %.1f %.1f %.1f", sys.Load[0], sys.Load[1], sys.Load[2]),
	}
	if sys.MemFreePct >= 0 {
		parts = append(parts, fmt.Sprintf("%s RAM, %d%% free", human(sys.MemTotal), sys.MemFreePct))
	}
	if sys.SwapTotal > 0 {
		parts = append(parts, fmt.Sprintf("swap %s", human(sys.SwapUsed)))
	}
	if sys.DiskTotal > 0 {
		parts = append(parts, fmt.Sprintf("%s disk free", human(sys.DiskFree)))
	}

	status, findings := diagnose(sys, groups)
	fmt.Printf("%s  %s\n", bold(status), dim(strings.Join(parts, " · ")))
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

	fmt.Printf("\n%s %s\n", bold("CPU"), dim(fmt.Sprintf("(100%% = one core, you have %d)", sys.NCPU)))
	shown := 0
	for _, g := range sortByCPU(groups) {
		if shown >= limit || g.CPU < minCPU {
			break
		}
		printRow(fmt.Sprintf("%5.0f%%", g.CPU), g)
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

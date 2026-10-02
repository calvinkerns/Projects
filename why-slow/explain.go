package main

import (
	"fmt"
	"strconv"
	"strings"
)

func explain(query string) error {
	procs, err := listProcs()
	if err != nil {
		return err
	}
	byPID := map[int]Proc{}
	for _, p := range procs {
		byPID[p.PID] = p
	}

	groups := matchGroups(procs, byPID, query)
	if len(groups) == 0 {
		return fmt.Errorf("nothing running matches %q", query)
	}

	for i, g := range sortByCPU(groups) {
		if i > 0 {
			fmt.Println()
		}
		fmt.Printf("%s  %s\n", bold(g.Title), g.Verdict().Tag())
		fmt.Printf("  %s\n", g.What())
		if g.Entry != nil && g.Entry.Why != "" {
			fmt.Printf("  %s\n", g.Entry.Why)
		}
		if g.Entry != nil && g.Entry.Tip != "" {
			fmt.Printf("  Tip: %s\n", g.Entry.Tip)
		}
		fmt.Printf("  %s\n", dim(fmt.Sprintf("%s · %.0f%% CPU · %s memory",
			plural(len(g.Procs), "process", "processes"), g.CPU, human(g.RSS))))

		for j, p := range g.Procs {
			if j >= 10 {
				fmt.Printf("    %s\n", dim(fmt.Sprintf("…and %d more", len(g.Procs)-10)))
				break
			}
			parent := "?"
			if pp, ok := byPID[p.PPID]; ok {
				parent = pp.Name
			}
			fmt.Printf("    %s  %5.1f%%  %8s  up %-4s  started by %s\n",
				pad(strconv.Itoa(p.PID), 6), p.CPU, human(p.RSS), ago(p.Elapsed), parent)
			fmt.Printf("      %s\n", dim(tildify(p.Path)))
			if g.Verdict() == Check {
				if cmd := commandLine(p); cmd != "" {
					fmt.Printf("      %s\n", cmd)
				}
			}
		}
	}
	return nil
}

// matchGroups finds what the user asked about: a PID, or a name that appears
// in a group's title or in any of its processes' names or apps.
func matchGroups(procs []Proc, byPID map[int]Proc, query string) []*Group {
	if pid, err := strconv.Atoi(query); err == nil {
		if p, ok := byPID[pid]; ok {
			return groupProcs([]Proc{p})
		}
		return nil
	}

	q := strings.ToLower(query)
	var groups []*Group
	for _, g := range groupProcs(procs) {
		if strings.Contains(strings.ToLower(g.Title), q) {
			groups = append(groups, g)
			continue
		}
		for _, p := range g.Procs {
			if strings.Contains(strings.ToLower(p.Name), q) || strings.Contains(strings.ToLower(p.App), q) {
				groups = append(groups, g)
				break
			}
		}
	}
	return groups
}

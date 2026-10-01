package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

var useColor = func() bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	fi, err := os.Stdout.Stat()
	return err == nil && fi.Mode()&os.ModeCharDevice != 0
}()

func paint(code, s string) string {
	if !useColor {
		return s
	}
	return "\x1b[" + code + "m" + s + "\x1b[0m"
}

func bold(s string) string   { return paint("1", s) }
func dim(s string) string    { return paint("2", s) }
func red(s string) string    { return paint("31", s) }
func yellow(s string) string { return paint("33", s) }
func green(s string) string  { return paint("32", s) }
func cyan(s string) string   { return paint("36", s) }

func (v Verdict) Label() string {
	switch v {
	case Leave:
		return dim(pad("leave it", 13))
	case Wait:
		return cyan(pad("wait it out", 13))
	case Quit:
		return green(pad("safe to quit", 13))
	}
	return yellow(pad("take a look", 13))
}

func human(b uint64) string {
	switch {
	case b >= 1<<30:
		return fmt.Sprintf("%.1f GB", float64(b)/(1<<30))
	case b >= 1<<20:
		return fmt.Sprintf("%.0f MB", float64(b)/(1<<20))
	}
	return fmt.Sprintf("%.0f KB", float64(b)/(1<<10))
}

func ago(d time.Duration) string {
	switch {
	case d >= 48*time.Hour:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	case d >= time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	case d >= time.Minute:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	return fmt.Sprintf("%ds", int(d.Seconds()))
}

func pad(s string, n int) string {
	if w := utf8.RuneCountInString(s); w < n {
		return s + strings.Repeat(" ", n-w)
	}
	return s
}

func clip(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n-1]) + "…"
}

func tildify(path string) string {
	if home, err := os.UserHomeDir(); err == nil && strings.HasPrefix(path, home) {
		return "~" + path[len(home):]
	}
	return path
}

func firstSentence(s string) string {
	if i := strings.Index(s, ". "); i >= 0 {
		return s[:i+1]
	}
	return s
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

// Finding is one thing worth telling the user about, most important first.
type Finding struct {
	Title string
	Lines []string
}

func diagnose(s System, groups []*Group) (status string, fs []Finding) {
	loadRatio := s.Load[0] / float64(s.NCPU)
	lowMem := s.MemFreePct >= 0 && s.MemFreePct < 25

	switch {
	case loadRatio > 1.5 || (s.MemFreePct >= 0 && s.MemFreePct < 10) || s.CPUSpeedLimit < 80:
		status = red("Struggling")
	case loadRatio > 0.7 || lowMem || s.CPUSpeedLimit < 100:
		status = yellow("Busy")
	default:
		status = green("Calm")
	}

	if s.CPUSpeedLimit < 100 {
		fs = append(fs, Finding{
			Title: fmt.Sprintf("Your Mac is hot and has slowed its CPU to %d%% speed.", s.CPUSpeedLimit),
			Lines: []string{"Give it air: hard flat surface, clear vents. Everything else in this report gets worse while it's throttled."},
		})
	}

	for i, g := range sortByCPU(groups) {
		if i >= 2 || g.CPU < 40 {
			break
		}
		title := fmt.Sprintf("%s is using %.0f%% CPU", g.Title, g.CPU)
		if len(g.Procs) > 1 {
			title += fmt.Sprintf(" across %d processes", len(g.Procs))
		}
		f := Finding{Title: title + "."}
		f.Lines = append(f.Lines, g.What())
		if g.Entry != nil && g.Entry.Why != "" {
			f.Lines = append(f.Lines, g.Entry.Why)
		}
		top := g.Top()
		if g.Verdict() == Check {
			if cmd := commandLine(top); cmd != "" {
				f.Lines = append(f.Lines, "Running "+cmd+".")
			}
			if top.CPU >= 80 && top.Elapsed > time.Hour {
				f.Lines = append(f.Lines, fmt.Sprintf("It has been running for %s. If you don't recognise it, it may be stuck (kill %d).", ago(top.Elapsed), top.PID))
			}
		}
		if g.Entry != nil && g.Entry.Tip != "" {
			f.Lines = append(f.Lines, "Tip: "+g.Entry.Tip)
		}
		fs = append(fs, f)
	}

	swapHeavy := s.SwapUsed > 2<<30
	if lowMem || swapHeavy {
		f := Finding{Title: fmt.Sprintf("Memory is tight: %d%% free.", s.MemFreePct)}
		if !lowMem {
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
		if s.SwapUsed > 1<<30 {
			f.Lines = append(f.Lines, fmt.Sprintf("%s is already swapped out to disk, which is far slower than RAM.", human(s.SwapUsed)))
		}
		if quittable != nil {
			f.Lines = append(f.Lines, fmt.Sprintf("Quitting %s would free about %s.", quittable.Title, human(quittable.RSS)))
		}
		fs = append(fs, f)
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
				Lines: []string{"If it felt slow a moment ago, run why-slow again while it's happening."},
			})
		}
	}
	return status, fs
}

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

func explain(query string) error {
	procs, err := listProcs()
	if err != nil {
		return err
	}
	parents := map[int]Proc{}
	for _, p := range procs {
		parents[p.PID] = p
	}

	var groups []*Group
	if want, err := strconv.Atoi(query); err == nil {
		for _, p := range procs {
			if p.PID == want {
				groups = groupProcs([]Proc{p})
			}
		}
	} else {
		q := strings.ToLower(query)
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
	}
	if len(groups) == 0 {
		return fmt.Errorf("nothing running matches %q", query)
	}

	for i, g := range sortByCPU(groups) {
		if i > 0 {
			fmt.Println()
		}
		fmt.Printf("%s  %s\n", bold(g.Title), g.Verdict().Label())
		fmt.Printf("  %s\n", g.What())
		if g.Entry != nil && g.Entry.Why != "" {
			fmt.Printf("  %s\n", g.Entry.Why)
		}
		if g.Entry != nil && g.Entry.Tip != "" {
			fmt.Printf("  Tip: %s\n", g.Entry.Tip)
		}
		fmt.Printf("  %s\n", dim(fmt.Sprintf("%d process(es) · %.0f%% CPU · %s memory", len(g.Procs), g.CPU, human(g.RSS))))

		for j, p := range g.Procs {
			if j >= 10 {
				fmt.Printf("    %s\n", dim(fmt.Sprintf("…and %d more", len(g.Procs)-10)))
				break
			}
			parent := "?"
			if pp, ok := parents[p.PPID]; ok {
				parent = pp.Name
			}
			fmt.Printf("    %s  %5.1f%%  %8s  up %-4s  started by %s\n",
				pad(fmt.Sprint(p.PID), 6), p.CPU, human(p.RSS), ago(p.Elapsed), parent)
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

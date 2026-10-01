package main

import (
	"fmt"
	"os"
	"os/signal"
	"sort"
	"time"
)

const watchEvery = 2 * time.Second

// peak is the most CPU one group used while we were watching.
type peak struct {
	Title string
	CPU   float64
	At    time.Time
}

// watch redraws the overview until Ctrl-C, then prints the biggest spikes so
// a slowdown that came and went still leaves a trace.
func watch() error {
	peaks := map[string]*peak{}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	tick := time.NewTicker(watchEvery)
	defer tick.Stop()
	started := time.Now()

	for {
		sys := readSystem()
		procs, err := listProcs()
		if err != nil {
			return err
		}
		groups := groupProcs(procs)
		now := time.Now()
		for _, g := range groups {
			if p := peaks[g.Title]; p == nil || g.CPU > p.CPU {
				peaks[g.Title] = &peak{g.Title, g.CPU, now}
			}
		}

		if useColor {
			fmt.Print("\x1b[H\x1b[2J")
		}
		printOverview(sys, groups, false)
		printPeaks(peaks, started)
		fmt.Printf("\n%s\n", dim(fmt.Sprintf("refreshing every %s · Ctrl-C to stop", watchEvery)))

		select {
		case <-stop:
			fmt.Println()
			printPeaks(peaks, started)
			return nil
		case <-tick.C:
		}
	}
}

func printPeaks(peaks map[string]*peak, since time.Time) {
	var list []*peak
	for _, p := range peaks {
		if p.CPU >= 30 {
			list = append(list, p)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].CPU > list[j].CPU })
	fmt.Printf("\n%s %s\n", bold("SPIKES"), dim("since "+since.Format("15:04:05")))
	if len(list) == 0 {
		fmt.Println(dim("  nothing has gone above 30% CPU"))
		return
	}
	for i, p := range list {
		if i >= 5 {
			break
		}
		fmt.Printf("  %5.0f%%  %s %s\n", p.CPU, pad(clip(p.Title, 28), 28), dim("at "+p.At.Format("15:04:05")))
	}
}

// why-slow explains, in plain English, what is making a Mac slow and whether
// it is safe to do anything about it.
package main

import (
	"fmt"
	"os"
	"strings"
)

const usage = `why-slow: what's making your Mac slow, in plain English.

Usage:
  why-slow                     what's busy, what's using memory, and what to do about it
  why-slow -a, --all           same, but list everything instead of the top few
  why-slow -w, --watch         keep refreshing, and remember the biggest spikes
  why-slow ports               what's listening on network ports, and who started it
  why-slow login               what starts on its own, who installed it, and what it costs
  why-slow explain <name|pid>  everything known about one process
`

func main() {
	args := os.Args[1:]
	var err error
	switch {
	case len(args) == 0:
		err = overview(false)
	case args[0] == "-a" || args[0] == "--all":
		err = overview(true)
	case args[0] == "-w" || args[0] == "--watch":
		err = watch()
	case args[0] == "login":
		err = login()
	case args[0] == "ports":
		err = ports()
	case args[0] == "explain" && len(args) >= 2:
		err = explain(strings.Join(args[1:], " "))
	case args[0] == "-h" || args[0] == "--help" || args[0] == "help":
		fmt.Print(usage)
	default:
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "why-slow:", err)
		os.Exit(1)
	}
}

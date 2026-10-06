package main

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Listener is one process listening on one TCP port.
type Listener struct {
	PID     int
	Port    int
	Exposed bool // reachable from other machines, not just this one
}

var portHints = map[int]string{
	3000:  "common dev-server port (React, Next.js, Rails, Express)",
	3001:  "common dev-server port",
	3306:  "MySQL",
	4200:  "Angular dev server",
	5173:  "Vite dev server",
	5432:  "PostgreSQL",
	6379:  "Redis",
	8000:  "common dev-server port (Django, python -m http.server)",
	8080:  "common dev-server / proxy port",
	8888:  "Jupyter",
	11434: "Ollama",
	27017: "MongoDB",
}

// PortInfo is a listener with everything needed to explain it.
type PortInfo struct {
	Listener
	Proc    Proc
	Title   string
	Verdict Verdict
	Detail  string // what it is, or for scripts the command and folder
	Note    string // what the port number usually means
}

func collectPorts(procs []Proc) []PortInfo {
	// lsof exits non-zero when nothing matches, so only fail on no output.
	out, err := run("lsof", "+c", "0", "-iTCP", "-sTCP:LISTEN", "-nP", "-Fpn")
	if err != nil && out == "" {
		return nil
	}
	byPID := map[int]Proc{}
	for _, p := range procs {
		byPID[p.PID] = p
	}

	var infos []PortInfo
	for _, l := range parseListeners(out) {
		p, ok := byPID[l.PID]
		if !ok {
			continue
		}
		g := groupProcs([]Proc{p})[0]
		info := PortInfo{Listener: l, Proc: p, Title: g.Title, Verdict: g.Verdict(), Detail: firstSentence(g.What()), Note: portNote(p, l.Port)}
		if info.Verdict == Check {
			if cmd := commandLine(p); cmd != "" {
				info.Detail = cmd
			}
		}
		infos = append(infos, info)
	}
	return infos
}

func ports() error {
	procs, err := listProcs()
	if err != nil {
		return err
	}
	infos := collectPorts(procs)
	if len(infos) == 0 {
		fmt.Println("Nothing of yours is listening on a TCP port.")
		return nil
	}

	fmt.Println(bold("LISTENING PORTS") + dim(" (your processes only; sudo shows system ones too)"))
	for _, in := range infos {
		where := dim(pad("this Mac only", 14))
		if in.Exposed {
			where = yellow(pad("your network", 14))
		}
		fmt.Printf("\n  %s  %s %s %s  %s\n", bold(fmt.Sprintf("%5d", in.Port)), pad(clip(in.Title, 24), 24), where,
			dim("up "+ago(in.Proc.Elapsed)), dim(fmt.Sprintf("pid %d", in.PID)))
		fmt.Printf("         %s\n", in.Detail)
		if in.Note != "" {
			fmt.Printf("         %s\n", dim(in.Note))
		}
	}
	fmt.Printf("\n%s\n", dim(`"your network" means other devices on your Wi-Fi can connect. Stop one with: kill <pid>`))
	return nil
}

func portNote(p Proc, port int) string {
	if p.Name == "ControlCenter" && (port == 5000 || port == 7000) {
		return "AirPlay Receiver. It's why Flask's default port 5000 is \"in use\"; turn it off in System Settings → General → AirDrop & Handoff."
	}
	return portHints[port]
}

// parseListeners reads `lsof -F pn` output: a "p<pid>" line, then one
// "n<addr>:<port>" line per socket. IPv4 and IPv6 sockets on the same port
// collapse into one listener.
func parseListeners(out string) []Listener {
	seen := map[[2]int]*Listener{}
	var list []*Listener
	pid := 0
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		switch line[0] {
		case 'p':
			pid, _ = strconv.Atoi(line[1:])
		case 'n':
			addr := line[1:]
			i := strings.LastIndexByte(addr, ':')
			if i < 0 {
				continue
			}
			port, err := strconv.Atoi(addr[i+1:])
			if err != nil {
				continue
			}
			host := addr[:i]
			exposed := host == "*" || host == "0.0.0.0" || host == "[::]"
			key := [2]int{pid, port}
			if l := seen[key]; l != nil {
				l.Exposed = l.Exposed || exposed
				continue
			}
			l := &Listener{PID: pid, Port: port, Exposed: exposed}
			seen[key] = l
			list = append(list, l)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Port < list[j].Port })
	result := make([]Listener, len(list))
	for i, l := range list {
		result[i] = *l
	}
	return result
}

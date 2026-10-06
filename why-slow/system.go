package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// System is a snapshot of machine-wide health.
type System struct {
	NCPU          int
	Load          [3]float64
	MemTotal      uint64
	MemFreePct    int // -1 when unknown
	SwapUsed      uint64
	SwapTotal     uint64
	DiskFree      uint64
	DiskTotal     uint64
	CPUSpeedLimit int // 100 means not throttled
}

// commands are the only programs why-slow runs, by absolute path so that
// whatever is first on $PATH can't stand in for them.
var commands = map[string]string{
	"ps":              "/bin/ps",
	"sysctl":          "/usr/sbin/sysctl",
	"memory_pressure": "/usr/bin/memory_pressure",
	"pmset":           "/usr/bin/pmset",
	"lsof":            "/usr/sbin/lsof",
	"launchctl":       "/bin/launchctl",
	"plutil":          "/usr/bin/plutil",
}

// commandTimeout bounds every command, so a hung lsof (say, on an
// unresponsive network mount) can't hang why-slow or the app with it.
const commandTimeout = 10 * time.Second

func run(name string, args ...string) (string, error) {
	path, ok := commands[name]
	if !ok {
		return "", fmt.Errorf("why-slow doesn't run %q", name)
	}
	ctx, cancel := context.WithTimeout(context.Background(), commandTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, args...)
	// In a German or French locale ps prints "0,1" and sysctl "{ 1,28 }",
	// which wouldn't parse; always ask for C-locale numbers.
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	out, err := cmd.Output()
	return string(out), err
}

var (
	swapRe  = regexp.MustCompile(`total = ([\d.]+)M\s+used = ([\d.]+)M`)
	freeRe  = regexp.MustCompile(`free percentage: (\d+)%`)
	speedRe = regexp.MustCompile(`CPU_Speed_Limit\s*=\s*(\d+)`)
)

func readSystem() System {
	s := System{MemFreePct: -1, CPUSpeedLimit: 100}

	if out, err := run("sysctl", "-n", "hw.ncpu", "hw.memsize", "vm.loadavg", "vm.swapusage"); err == nil {
		lines := strings.Split(strings.TrimSpace(out), "\n")
		if len(lines) >= 4 {
			s.NCPU, _ = strconv.Atoi(strings.TrimSpace(lines[0]))
			s.MemTotal, _ = strconv.ParseUint(strings.TrimSpace(lines[1]), 10, 64)
			s.Load = parseLoad(lines[2])
			s.SwapTotal, s.SwapUsed = parseSwap(lines[3])
		}
	}
	if s.NCPU < 1 {
		s.NCPU = 1
	}

	if out, err := run("memory_pressure", "-Q"); err == nil {
		if m := freeRe.FindStringSubmatch(out); m != nil {
			s.MemFreePct, _ = strconv.Atoi(m[1])
		}
	}

	// The writable data volume shares its container with "/", so either works;
	// prefer the data volume since that is where the user's files live.
	var st syscall.Statfs_t
	if syscall.Statfs("/System/Volumes/Data", &st) == nil || syscall.Statfs("/", &st) == nil {
		s.DiskFree = st.Bavail * uint64(st.Bsize)
		s.DiskTotal = st.Blocks * uint64(st.Bsize)
	}

	if out, err := run("pmset", "-g", "therm"); err == nil {
		if m := speedRe.FindStringSubmatch(out); m != nil {
			s.CPUSpeedLimit, _ = strconv.Atoi(m[1])
		}
	}
	return s
}

// parseLoad reads sysctl's "{ 7.71 4.55 3.26 }".
func parseLoad(line string) [3]float64 {
	var load [3]float64
	for i, f := range strings.Fields(strings.Trim(line, "{} \t")) {
		if i < 3 {
			load[i], _ = strconv.ParseFloat(f, 64)
		}
	}
	return load
}

// parseSwap reads sysctl's "total = 3072.00M  used = 1592.31M  free = ...".
func parseSwap(line string) (total, used uint64) {
	m := swapRe.FindStringSubmatch(line)
	if m == nil {
		return 0, 0
	}
	t, _ := strconv.ParseFloat(m[1], 64)
	u, _ := strconv.ParseFloat(m[2], 64)
	return uint64(t * (1 << 20)), uint64(u * (1 << 20))
}

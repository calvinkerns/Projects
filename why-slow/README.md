# why-slow

Activity Monitor tells you *what* is running. `why-slow` tells you *why*, and whether you should do anything about it.

```
$ why-slow
Busy  CPU 74% used · load 7.7 on 10 cores · 16.0 GB RAM, 50% free · swap 1.6 GB · 89.8 GB disk free

▶ Spotlight is using 55% of your CPU across 9 processes.
  Spotlight, indexing your files so search works.
  Spikes after lots of files change (cloning repos, npm install, unzipping, big downloads)
  and after macOS updates. It usually settles within 10–30 minutes.
  Tip: Keep it out of build and dependency folders: add them to Spotlight's privacy list.

CPU (share of your whole Mac)
      55%  Spotlight ×9                 wait it out   Spotlight, indexing your files so search works.
      12%  Gatekeeper (syspolicyd)      wait it out   Gatekeeper, checking that the apps you run are signed…
     0.7%  Adobe Creative Cloud ×17     safe to quit  Adobe's background services: sync, updates, fonts…
```

CPU is shown as a share of the whole Mac, so 100% means every core is busy. (Activity Monitor and
`top` count per core instead, where a 10-core Mac tops out at 1000%.)

Every process gets one of four verdicts:

| verdict        | meaning                                                       |
|----------------|---------------------------------------------------------------|
| `leave it`     | part of macOS; killing it won't help                          |
| `wait it out`  | temporary work that finishes on its own                       |
| `safe to quit` | an app you can quit normally                                  |
| `take a look`  | could be anything, e.g. a script; why-slow shows its command  |

## Usage

```
why-slow                     what's busy, what's using memory, and what to do about it
why-slow -a, --all           same, but list everything instead of the top few
why-slow -w, --watch         keep refreshing, and remember the biggest spikes
why-slow ports               what's listening on network ports, and who started it
why-slow login               what starts on its own, who installed it, and what it costs
why-slow explain <name|pid>  everything known about one process
```

`why-slow --watch` is for slowdowns that are gone by the time you look. Leave it running, and when
you press Ctrl-C it prints the biggest CPU spikes it saw and when they happened.

`why-slow login` lists the launch agents and daemons that apps install so they can run without
being opened (updaters, sync services, VPN helpers, database servers), grouped by company. That
matches how System Settings → General → Login Items & Extensions lets you switch them off. Each
group shows how much memory it is using right now:

```
  Adobe               5 item(s) · 2 running · 299 MB
    ● at login       Creative Cloud                           com.adobe.AdobeCreativeCloud
    ● when needed    auto-updater (system-wide)               com.adobe.acc.installer.v2
    ○ on a schedule  CCXProcess                               com.adobe.ccxprocess

  Oracle              1 item(s) · 1 running · 6 MB
    ● always on      MySQL server (system-wide)               com.oracle.oss.mysql.mysqld
```

`why-slow ports` is handy for forgotten dev servers: for `node`, `python` and friends it shows the
actual command and the folder it was started in. It also explains the classic "port 5000 is already
in use" on macOS (it's AirPlay Receiver).

## The Mac app

`Why Slow.app` is a window around the same engine: a status page with the findings and an expandable
list of what's running, plus pages for listening ports and background jobs. It can quit apps, stop a
forgotten dev server, and in Live mode (⌘L) refresh every 3 seconds and remember CPU spikes.

```
./build-app.sh --install    # builds build/Why Slow.app and copies it to ~/Applications
```

Then open it from Spotlight or Launchpad like any other app, and drag it to the Dock to keep it there.
Rebuild with the same command after changing anything.

The app is SwiftUI (`app/`), compiled with `swiftc`, so it needs the Xcode command line tools but no
Xcode project. It runs the Go binary bundled in its Resources with `--json` and draws what comes back.

## Building the CLI

Go 1.22+, no dependencies, macOS only.

```
go build -o why-slow .
go test ./...
```

## How it works

It reads what macOS already exposes (`ps`, `sysctl`, `memory_pressure`, `pmset`, `lsof`,
`launchctl`, launchd plists, `statfs`), groups processes the way a person thinks about them (all of
Spotlight's workers together, every Chrome helper under Chrome), and looks each group up in a
hand-written knowledge base (`knowledge.go`). Anything not in the knowledge base gets a best guess
from where its binary lives.

Adding a process is a single `Entry` in `knowledge.go`.

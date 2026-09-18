# Microshell (`ush`)

A small Unix shell written in C. It reads a command line, expands it, and runs
the result with `fork` and `execvp`, the same way a real shell does.

## Build and run

```
make            # builds ./ush
./ush           # interactive, reads from stdin
./ush script    # runs the commands in a file
make clean      # removes the objects and the binary
```

## What it supports

**Pipelines.** Any number of commands joined with `|`. Each stage gets its own
`pipe` and the file descriptors are wired up with `dup2` in the child.

**Expansion**, all handled in `expand.c` before the line is parsed:

| Syntax | Result |
| --- | --- |
| `$$` | the shell's process id |
| `${NAME}` | the value of the environment variable `NAME` |
| `$1`, `$2`, ... | arguments passed to the script |
| `*`, `*.c`, `pre*` | filenames in the current directory that match |
| `\*` | a literal asterisk |

**Comments.** Everything after an unquoted `#` is dropped. `$#` is left alone.

**Interrupts.** `SIGINT` is caught rather than killing the shell. If a child is
running it receives the signal, the child dies, and the prompt comes back.

## Builtins

Builtins run in the shell itself, so they can change its state.

| Command | What it does |
| --- | --- |
| `exit [n]` | leaves the shell |
| `cd [dir]` | changes the working directory |
| `envset NAME VALUE` | sets an environment variable |
| `envunset NAME` | removes one |
| `shift [n]` | moves the script arguments down, so `$1` becomes the next one |
| `unshift [n]` | undoes a shift |
| `sstat FILE...` | prints the name, permissions, link count, owner, group, size, and modify time of each file |

`sstat` formats its permission string with `my_strmode` in `strmode.c`, a
reimplementation of BSD's `strmode`.

## Files

| File | Contents |
| --- | --- |
| `ush.c` | input loop, comment stripping, argument parsing, pipes, fork and exec |
| `expand.c` | variable, argument and wildcard expansion |
| `builtin.c` | the builtins |
| `strmode.c` | permission strings for `sstat` |
| `defn.h` | shared prototypes and globals |

Built for a systems programming course at Western Washington University, with
the assignment and starting point from Professor Phil Nelson.

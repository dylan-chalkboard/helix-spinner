# helix-spinner

A Claude Code mod that replaces the "thinking" spinner with something much more fun.

```
────────────━━━━━━──────────────────────────────────────────
⢎⡱⠊⢆⡰⠑⢎⡱⠊⢆⡰⠑ Marshmallow-musing… (14s · ↓ 1.2k tokens)
  ⎿  Fun fact: Wombats make cube-shaped poop.  next ›
```

## What it does

- **An animation for every phase:** a twisting helix while thinking, a signal wave while
  requesting, equalizer bars while responding, a crawling snake while preparing a tool call
  and a heartbeat while a tool runs. Each phase has its own colors.
- **Wacky verbs:** over 250, picked to suit each phase. The end-of-turn line gets a past-tense
  one too ("Hornswoggled for 12s").
- **Rare and shiny verbs:** 20 secret rare verbs in rainbow, and any verb can turn up golden
  with sparkles (about 1 in 1,000).
- **Helix Dex:** `/helix-dex` shows every verb you have collected, across sessions.
- **Tips line:** Claude Code tips, weird-but-true facts, tech history and self-care reminders,
  changing every 15 seconds. In fullscreen mode, click the line to skip ahead.
- **Extras:** time and token counts, gentle warming colors on long turns, and an extra strand
  for each running subagent.

## Install

You need a recent Claude Code (2.1.289 or newer). Mods are an early-access feature.

```sh
claude plugin marketplace add dylan-chalkboard/helix-spinner
claude plugin install helix-spinner@helix-spinner
```

Then start a new session, or run `/reload-plugins` in an open one.

To update later:

```sh
claude plugin update helix-spinner@helix-spinner
```

## Commands

| Command | What it does |
| --- | --- |
| `/helix-dex` | Your verb collection, plus switches for new-verb alerts (off by default) and the tips line (on by default) |
| `/helix-demo` | Every animation side by side |

## Developing

The plugin lives in `plugins/helix-spinner`. Run its tests with:

```sh
claude plugin test plugins/helix-spinner
```

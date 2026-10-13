# helix-spinner

A Claude Code mod that replaces the "thinking" spinner with something much more fun.

```
────────────━━━━━━──────────────────────────────────────────
⢎⡱⠊⢆⡰⠑⢎⡱⠊⢆⡰⠑ Marshmallow-musing… (14s · ↓ 1.2k tokens)
  ⎿  Fun fact: Wombats make cube-shaped poop.  next ›
```

**<img width="735" height="566" alt="image" src="https://github.com/user-attachments/assets/1cc9c79a-1df3-4a0e-9f31-04607703d9d2" />
**

## What it does

- **An animation for every phase:** a twisting helix while thinking, a signal wave while
  requesting, equalizer bars while responding, a crawling snake while preparing a tool call
  and a heartbeat while a tool runs. Each phase has its own colors.
- **Wacky verbs:** over 250, picked to suit each phase. The end-of-turn line gets a past-tense
  one too ("Hornswoggled for 12s").
- **Rare and shiny verbs:** 20 secret rare verbs in rainbow, and any verb can turn up golden
  with sparkles (about 1 in 1,000).
- **Rare animations:** about 1 in 120 times, the animation is swapped for one of 26 rare ones (a comet, Pac-Man, a space invader, fireworks and more), two for every phase and tool, in that phase's own colors.
- **Tapper:** something to click while you wait. In fullscreen, a tap button and your sparks sit at
  the right end of the spinner line. Every tap earns ✦ sparks, and tapping fast
  warms the button up for bigger multipliers. Claude earns you sparks too: for every 10 seconds it actually
  works and every tool it runs, paid when the turn ends. Spend them in the skill tree (click ☰ on the strip,
  or `/helix-tap shop`): four branches, 👆 Tapper, 🧠 Thinker, 🍀 Luck and 📖 Collector, where each skill opens
  the ones below it and each branch ends in a ★ capstone. Chances and windows max out; amounts and
  multipliers grow forever. Button styles are bought with sparks in the Looks tab. Progress is
  saved across sessions, and two windows open at once never overwrite each other.
- **Helix Dex:** `/helix-dex` shows every verb you have collected, across sessions.
- **Tips line:** Claude Code tips, weird-but-true facts, tech history and self-care reminders,
  changing every 15 seconds. In fullscreen mode, click the line to skip ahead.
- **Extras:** time and token counts, and how many subagents are running.

## Install

You need a recent Claude Code (2.1.289 or newer). Mods are an early-access feature.

```sh
claude plugin marketplace add dlandman27/helix-spinner
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
| `/helix-dex` | Your verb collection and tapper stats, plus switches for new-verb alerts (off by default) and the tips line (on by default) |
| `/helix-demo` | Every animation side by side. `/helix-demo rare` shows the rare ones (spoilers!) |
| `/helix-color [color]` | This project's divider color and name, so you can tell sessions apart. Picks one automatically; `/helix-color teal` pins one, `auto` goes back, `off` hides it |
| `/helix-tap` | The tapper menu: **Store** (buy the skills open to you), **Tree** (a map of every branch, owned, open and locked) and **Looks** (buy button styles with sparks, `‹ ›` to flip through the ones you own). `/helix-tap shop` opens the shop, `/helix-tap button pill` picks a style, `/helix-tap text boop` changes the label |
| `/helix-focus [minutes]` | A focus timer (25 minutes by default) that fills the spinner's divider while Claude works, with a toast and a soft chime when it's done. `/helix-focus stop` cancels it |

## Developing

The plugin lives in `plugins/helix-spinner`. Run its tests with:

```sh
claude plugin test plugins/helix-spinner
```

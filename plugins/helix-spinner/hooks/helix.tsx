import type { ClientModule } from 'claude-code'

import type { HelixFailure, HelixTapLook, HelixTaps } from '../types'

import { focusLine } from './focus'
import { withProjectName } from './project'
import { CELLS, DOT_COLUMNS, DOT_ROWS, pingPong, strandRow } from './grid'
import type { Motion, Pattern } from './grid'
import { activeSituations, firstUnintroduced, tipAt } from './tip-rotation'
import type { Situation, TipLine } from './tip-rotation'
import { rareMotionById } from './rare-motions'
import { COMPACT_MOTION, TOOL_MOTIONS } from './tool-motions'
import type { ToolGroup } from './tools'
import {
  addDelta,
  diffDelta,
  BUTTON_WIDTH,
  comboGapMs,
  critMultiplierFor,
  critChance,
  DEFAULT_LOOK,
  drawButton,
  formatGain,
  formatSparks,
  frenzyMultiplier,
  GOLD,
  goldenChancePerSecond,
  goldenPayout,
  HEAT_MULTIPLIERS,
  HEAT_WINDOW_MS,
  frenzyAtFor,
  heatOf,
  luckyEvery,
  goldenMs,
  luckyDrop,
  NO_DELTA,
  normalizeTaps,
  sparksOf,
  sumDeltas,
  tapsPerTap,
  turnSparks,
} from './taps'
import type { TapDelta, Upgrades } from './taps'

type Props = {
  mode: string
  tool?: ToolGroup | null
  text: string
  suffix: string
  startedAt: number | null
  outputTokens: number
  inputTokens: number
  turnTools?: number
  workMs?: number
  isDemo?: boolean
  rarity?: 'common' | 'rare' | 'shiny'
  collect?: string | null
  agents?: number
  tips?: readonly TipLine[]
  situations?: readonly Situation[]
  introduced?: readonly string[]
  failure?: HelixFailure | null
  focus?: { startedAt: number; endsAt: number; sentAt: number } | null
  project?: { name: string; branch?: string | null; color: string } | null
  compacting?: boolean
  rareMotion?: string | null
  collectMotion?: boolean
  tipSeed?: number
  divider?: boolean
  palette?: string[]
  signature?: string
  night?: number
  taps?: HelixTaps | null
  tapAck?: { instance: string; total: TapDelta; menu: number } | null
  tapLook?: HelixTapLook
}
// `pinned` is a situation's first line, cutting in until the next change of tip.
type State = { tick: number; mountedAt: number; phase: number; tipIndex: number; tipChangedTick: number; pinned: TipLine | null }

const FRAME_MS = 40
const TIP_MS = 15_000
const DIVIDER = '─'
const PULSE = '━'
const PULSE_LENGTH = 6
const PULSE_MS_PER_CELL = 150
const PULSE_PAUSE_CELLS = 30

// A flat line with a short heavier stretch gliding across it, then a pause before the next pass.
export const dividerLine = (width: number, elapsedMs: number) => {
  const head = Math.floor(elapsedMs / PULSE_MS_PER_CELL) % (width + PULSE_LENGTH + PULSE_PAUSE_CELLS)
  return Array.from({ length: width }, (_, cell) => (cell < head && cell >= head - PULSE_LENGTH ? PULSE : DIVIDER)).join('')
}
const FALLBACK_COLUMNS = 80

// A seasonal touch drawn over the divider: [column, character] marks for the moment, all in the divider's own dim tone.
type Mark = [column: number, character: string]

const wrap = (value: number, size: number) => ((value % size) + size) % size

const flicker = (ms: number, period: number, a: string, b: string) => (Math.floor(ms / period) % 2 === 0 ? a : b)

const centered = (width: number, text: string): Mark[] => {
  const start = Math.max(0, Math.floor((width - text.length) / 2))
  return Array.from(text).map((character, index) => [start + index, character])
}

const drifting = (width: number, ms: number, count: number, cellsPerSecond: number, glyph: (index: number) => string): Mark[] =>
  Array.from({ length: count }, (_, index) => {
    const speed = cellsPerSecond * (0.7 + ((index * 37) % 10) / 15)
    const offset = (index * width) / count
    return [Math.floor(wrap(offset + (ms / 1000) * speed, width)), glyph(index)]
  })

const signatureMarks = (signature: string, width: number, ms: number, night: number): Mark[] => {
  switch (signature) {
    case 'bat': {
      const x = Math.round(((Math.sin(ms / 1900) + 1) / 2) * Math.max(0, width - 3))
      const wings = flicker(ms, 260, 'ᴧᴥᴧ', 'ᵛᴥᵛ')
      return Array.from(wings).map((character, index) => [x + index, character])
    }
    case 'leaves':
      return drifting(width, ms, 4, 4, index => flicker(ms + index * 300, 600, '❧', '☙'))
    case 'snow':
      return drifting(width, ms, Math.max(4, Math.floor(width / 10)), 2.5, index => (index % 3 === 0 ? '*' : '·'))
    case 'hearts':
      return drifting(width, ms, 4, 3, index => flicker(ms + index * 350, 700, '♡', '♥'))
    case 'clovers':
      return drifting(width, ms, 4, 3, () => '♣')
    case 'eggs':
      return drifting(width, ms, 2, 3, () => '◖◗').flatMap(([x]) => [[x, '◖'], [x + 1, '◗']] as Mark[])
    case 'lantern': {
      const sway = Math.round(Math.sin(ms / 480) * 4)
      return [[Math.floor(width / 2) + sway, '⊕']]
    }
    case 'menorah': {
      // Eight candles and the shamash in the middle; each night lights one more, filling from the right.
      const slots = Array.from({ length: 9 }, (_, slot) => {
        if (slot === 4) {
          return '✦'
        }
        const candle = slot > 4 ? 9 - slot : 8 - slot
        return candle <= night ? flicker(ms + slot * 170, 340, '✶', '✷') : '·'
      })
      return centered(width, ` ${slots.join(' ')} `)
    }
    case 'lamps': {
      const lit = Math.floor(ms / 400) % 9
      const lamps = Array.from({ length: 7 }, (_, lamp) => (lamp < lit ? '◉' : '◦'))
      return centered(width, ` ${lamps.join(' ')} `)
    }
    case 'fireworks': {
      const cycle = Math.floor(ms / 4000)
      const age = ms % 4000
      const center = 6 + ((cycle * 53) % Math.max(1, width - 12))
      const bursts = ['·', '✦', '·✶·', '✧ ✧ ✧', '·   ·']
      const frame = bursts[Math.floor(age / 220)]
      return frame ? Array.from(frame).map((character, index) => [center - Math.floor(frame.length / 2) + index, character]) : []
    }
    default:
      return []
  }
}

// `base` replaces the plain line underneath (a focus timer's progress bar); marks still draw over it.
export const dividerCells = (width: number, elapsedMs: number, signature?: string, night = 0, base?: string) => {
  const plain = signature && signature !== 'fireworks' ? DIVIDER.repeat(width) : dividerLine(width, elapsedMs)
  const line = Array.from(base ?? plain)
  const marked = new Set<number>()
  for (const [column, character] of signature ? signatureMarks(signature, width, elapsedMs, night) : []) {
    if (column >= 0 && column < width && character !== ' ') {
      line[column] = character
      marked.add(column)
    }
  }
  return line.map((character, column) => ({ character, isMark: marked.has(column) }))
}

// Runs of plain line and of marks, so each run is one Text.
const dividerRuns = (cells: { character: string; isMark: boolean }[]) =>
  cells.reduce<{ text: string; isMark: boolean }[]>((runs, cell) => {
    const last = runs[runs.length - 1]
    if (last && last.isMark === cell.isMark) {
      last.text += cell.character
    } else {
      runs.push({ text: cell.character, isMark: cell.isMark })
    }
    return runs
  }, [])

const LABEL_COLORS: Record<string, string> = {
  Tip: '#93c5fd',
  'Fun fact': '#86efac',
  'Tech history': '#fcd34d',
  Reminder: '#f9a8d4',
}

// Braille dot bits, indexed [column][row] within one cell.
const DOT_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
]

const helix: Pattern = {
  isLit: (x, y, t) => y === strandRow(x * 0.35 - t) || y === strandRow(x * 0.35 - t + Math.PI),
  depth: (x, t) => (Math.cos(x * 0.35 - t) + 1) / 2,
  focus: t => pingPong(t, 0.4),
}

const signal: Pattern = {
  isLit: (x, y, t) => {
    const amplitude = 0.25 + 0.75 * ((Math.sin(t * 1.2) + 1) / 2)
    return y === Math.round(1.5 + 1.5 * amplitude * Math.sin(x * 0.6 - t * 2.5))
  },
  focus: t => (t * 6) % DOT_COLUMNS,
}

const equalizer: Pattern = {
  isLit: (x, y, t) => {
    const bar = Math.floor(x / 2)
    const level = (Math.sin(bar * 1.7 + t * 1.8) + Math.sin(bar * 0.9 - t * 1.1) + 2) / 4
    return y >= DOT_ROWS - 1 - Math.floor(level * DOT_ROWS) && x % 2 === 0
  },
  focus: t => pingPong(t, 0.6),
}

const TOTAL_DOTS = DOT_COLUMNS * DOT_ROWS

const SNAKE_LENGTH = 28

// Crawls dot by dot, each column bottom-up: the head adds a dot as the tail drops one.
const typewriter: Pattern = {
  isLit: (x, y, t) => {
    const head = Math.floor(t * 13)
    const index = x * DOT_ROWS + (DOT_ROWS - 1 - y)
    const behindHead = (((head - index) % TOTAL_DOTS) + TOTAL_DOTS) % TOTAL_DOTS
    return behindHead < SNAKE_LENGTH
  },
  focus: t => (Math.floor(t * 13) % TOTAL_DOTS) / DOT_ROWS,
}

// A flat line along the bottom with an ECG spike traveling across it.
const SPIKE: Record<number, number> = { 0: 2, 1: 0, 2: 1, 3: 2 }
const BASELINE = DOT_ROWS - 1

const spikeStart = (t: number) => (t * 9) % (DOT_COLUMNS + 10) - 4

const pulseRow = (x: number, t: number) => SPIKE[Math.floor(x - spikeStart(t))] ?? BASELINE

const heartbeat: Pattern = {
  isLit: (x, y, t) => {
    const row = pulseRow(x, t)
    const previous = x > 0 ? pulseRow(x - 1, t) : row
    return y >= Math.min(row, previous) && y <= Math.max(row, previous)
  },
  focus: t => spikeStart(t) + 1.5,
}

const THINKING: Motion = { palette: ['#5b21b6', '#a855f7', '#f0abfc'], speed: 0.12, pattern: helix }

const MOTIONS: Record<string, Motion> = {
  thinking: THINKING,
  requesting: { palette: ['#0c4a6e', '#0ea5e9', '#a5f3fc'], speed: 0.08, pattern: signal },
  responding: { palette: ['#065f46', '#10b981', '#bbf7d0'], speed: 0.1, pattern: equalizer },
  'tool-input': { palette: ['#713f12', '#eab308', '#fef9c3'], speed: 0.1, pattern: typewriter },
  'tool-use': { palette: ['#7f1d1d', '#f97316', '#fde68a'], speed: 0.1, pattern: heartbeat },
}

const BLACK = [0, 0, 0]

const hexToRgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

const toHex = (rgb: number[]) =>
  '#' + rgb.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')

const mix = (a: number[], b: number[], amount: number) => a.map((c, i) => c + ((b[i] ?? c) - c) * amount)

const gradient = (palette: string[], position: number) => {
  const stops = palette.map(hexToRgb)
  const scaled = Math.max(0, Math.min(1, position)) * (stops.length - 1)
  const index = Math.min(Math.floor(scaled), stops.length - 2)
  return mix(stops[index] ?? BLACK, stops[index + 1] ?? BLACK, scaled - index)
}

const drawFrame = (motion: Motion, t: number) => {
  const { isLit, depth = () => 0.5, focus } = motion.pattern
  const focusColumn = focus(t)

  return Array.from({ length: CELLS }, (_, cell) => {
    let bits = 0
    let cellDepth = 0

    for (let column = 0; column < 2; column++) {
      const x = cell * 2 + column
      for (let y = 0; y < DOT_ROWS; y++) {
        if (isLit(x, y, t)) {
          bits |= DOT_BITS[column]?.[y] ?? 0
        }
      }
      cellDepth += depth(x, t) / 2
    }

    const distance = Math.abs(cell * 2 + 0.5 - focusColumn)
    const glow = Math.exp(-(distance * distance) / 10)
    const shimmer = (Math.sin(cell * 0.6 + t * 2) + 1) / 2
    const base = gradient(motion.palette, 0.2 + shimmer * 0.4 + cellDepth * 0.2)
    const color = mix(mix(base, BLACK, 0.35 - cellDepth * 0.25), gradient(motion.palette, 1), glow)

    return { glyph: String.fromCharCode(0x2800 + bits), color: toHex(color), isHot: glow > 0.6 }
  })
}

const formatElapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

const formatTokens = (tokens: number) => (tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`)

const GOLD_PALETTE = ['#a16207', '#facc15', '#fffbeb']

const hueToRgb = (hue: number) =>
  [0, 8, 4].map(offset => {
    const k = (offset + hue * 12) % 12
    return 255 * (0.75 - 0.35 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  })

const shimmerText = (text: string, motion: Motion, t: number, rarity: string) =>
  Array.from(text).map((character, index) => {
    const wave = (Math.sin(index * 0.5 - t * 1.8) + 1) / 2
    if (rarity === 'shiny') {
      return { character, color: toHex(gradient(GOLD_PALETTE, 0.3 + wave * 0.7)) }
    }
    if (rarity === 'rare') {
      return { character, color: toHex(hueToRgb((index * 0.06 + t * 0.15) % 1)) }
    }
    return { character, color: toHex(gradient(motion.palette, 0.45 + wave * 0.55)) }
  })

const SPARKLES = ['✦', '✧', '⋆', '✧']

const sparkle = (t: number, offset: number) => SPARKLES[Math.floor(t * 2 + offset) % SPARKLES.length] ?? '✦'

// The verbs the live spinner has reported, per instance, so each is posted once.
const reported = new WeakMap<object, string>()

// The verb on screen now, per instance: posted from the frame timer, once the instance is mounted.
const showing = new WeakMap<object, { verb: string; rarity: string }>()

// The rare animation on screen now and the last one reported, per instance.
const showingMotion = new WeakMap<object, string>()
const reportedMotion = new WeakMap<object, string>()

const TIP_TICKS = TIP_MS / FRAME_MS

// How long the divider stays red after a shell command fails.
const FAILURE_TICKS = 2000 / FRAME_MS
const FAILURE_COLOR = '#ef4444'

// When each instance first drew the current failure, so the red fades on time.
const failureStarts = new WeakMap<object, { id: string; tick: number }>()

// The hooks' clock against this instance's, per instance: the countdown runs on from the hooks' time.
const focusSyncs = new WeakMap<object, { sentAt: number; localAt: number }>()

const focusBase = (surface: object, focus: NonNullable<Props['focus']>, width: number) => {
  if (focusSyncs.get(surface)?.sentAt !== focus.sentAt) {
    focusSyncs.set(surface, { sentAt: focus.sentAt, localAt: Date.now() })
  }
  const sync = focusSyncs.get(surface) ?? { sentAt: focus.sentAt, localAt: Date.now() }
  const now = sync.sentAt + (Date.now() - sync.localAt)
  const remainingMs = focus.endsAt - now
  if (remainingMs <= 0) {
    return undefined
  }
  return focusLine(width, (now - focus.startedAt) / (focus.endsAt - focus.startedAt), remainingMs)
}

// A situation waiting for its moment, per instance: set while drawing, introduced by the frame timer.
const newcomers = new WeakMap<object, Situation>()

// The situations each instance has already introduced, so each cuts in once.
const introducedHere = new WeakMap<object, Set<string>>()

const isSending = (mode: string) => mode === 'requesting'

// ↑ while the request goes up (the context sent), ↓ for what the model has written back.
const tokenReadout = (props: Props, elapsedMs: number) => {
  const seconds = elapsedMs / 1000
  const sent = props.isDemo ? Math.floor(seconds * 2400) : props.inputTokens
  const received = props.isDemo ? Math.floor(seconds * 45) : props.outputTokens
  const isUp = isSending(props.mode) && sent > 0
  if (isUp) {
    return `↑ ${formatTokens(sent)} tokens`
  }
  return received > 0 ? `↓ ${formatTokens(received)} tokens` : null
}

// The tapper's play, per instance: what its taps added, what went to the hooks and is not yet back in the
// totals they hand over, and the combo, heat and flashes on screen. Times are on the frame clock (ticks × FRAME_MS).
type Tapper = {
  instance: string
  total: TapDelta
  menu: number
  postedAt: number
  combo: number
  lastTapAt: number
  recent: number[]
  fx: { gained: number; at: number; mark: '' | '!' | '★' } | null
  goldenUntil: number
}
const tappers = new WeakMap<object, Tapper>()

// Where the tap strip starts on its row, per instance, while it shows.
const tapRegions = new WeakMap<object, { row: number; x: number; menuX: number }>()

// The upgrades the hooks last handed over, per instance, for the frame timer's golden rolls.
const tapUpgrades = new WeakMap<object, Upgrades>()

const READOUT_WIDTH = 23
// The sparks count and the menu mark at the strip's end: a click there opens the shop.
const MENU_MARK = ' ☰'
const MENU_CELLS = 10
const STRIP_WIDTH = BUTTON_WIDTH + READOUT_WIDTH + MENU_MARK.length

// Until the hooks have it, the tap state goes again every few frames: a post can be replaced before it lands.
const REPOST_TICKS = 3
const FX_MS = 450
// How long the button stays down after a tap, and a golden tap's window.
const PRESS_MS = 160
const GOLDEN_ROLL_TICKS = 1000 / FRAME_MS

const newTapper = (): Tapper => ({
  instance: Math.random().toString(36).slice(2),
  total: NO_DELTA,
  menu: 0,
  postedAt: -Infinity,
  combo: 0,
  lastTapAt: -Infinity,
  recent: [],
  fx: null,
  goldenUntil: 0,
})

const recentTaps = (tapper: Tapper, now: number) => tapper.recent.filter(at => now - at < HEAT_WINDOW_MS)

type TapAck = { instance: string; total: TapDelta; menu: number }

const ackedBy = (tapper: Tapper, ack: TapAck | null | undefined) => (ack?.instance === tapper.instance ? ack : { total: NO_DELTA, menu: 0 })

// The saved totals as the hooks last handed them over, plus the taps still on their way there.
const totalsOf = (tapper: Tapper, saved: HelixTaps, ack: TapAck | null | undefined) => addDelta(saved, diffDelta(tapper.total, ackedBy(tapper, ack).total))

const isUnacked = (tapper: Tapper, ack: TapAck | null | undefined) => {
  const acked = ackedBy(tapper, ack)
  return acked.total.taps < tapper.total.taps || acked.menu < tapper.menu
}

// Taps past a human pace in one second count for nothing, so an autoclicker gains no more than fast fingers.
const MAX_TAPS_PER_SECOND = 15

const tap = (tapper: Tapper, totals: HelixTaps, now: number): Tapper => {
  const upgrades = totals.upgrades
  if (recentTaps(tapper, now).length >= MAX_TAPS_PER_SECOND) {
    return tapper
  }
  const recent = [...recentTaps(tapper, now), now]
  const heat = heatOf(recent.length, frenzyAtFor(upgrades))
  const heatMultiplier = heat === 'frenzy' ? frenzyMultiplier(upgrades.hot ?? 0) : HEAT_MULTIPLIERS[heat]
  const combo = now - tapper.lastTapAt <= comboGapMs(upgrades.steady ?? 0) ? tapper.combo + 1 : 1
  const isGolden = now < tapper.goldenUntil
  const isCrit = Math.random() < critChance(upgrades.crit ?? 0)
  const gained = tapsPerTap(upgrades.strong ?? 0) * heatMultiplier * (isGolden ? goldenPayout(upgrades.golden ?? 0) : 1) * (isCrit ? critMultiplierFor(upgrades) : 1)
  const lucky = combo % luckyEvery(upgrades.trigger ?? 0) === 0 ? luckyDrop(upgrades.lucky ?? 0) : 0
  const delta = { taps: 1, sparks: gained + lucky, bestCombo: combo }
  return {
    ...tapper,
    total: sumDeltas(tapper.total, delta),
    combo,
    lastTapAt: now,
    recent,
    fx: { gained, at: now, mark: isGolden ? '★' : isCrit ? '!' : '' },
    goldenUntil: isGolden ? 0 : tapper.goldenUntil,
  }
}

// The button, then the gain of the last tap, the combo, and the sparks.
// Every part keeps a fixed width, so nothing shifts as the numbers change.
const stripParts = (tapper: Tapper, totals: HelixTaps, liveSparks: number, now: number, look: HelixTapLook) => {
  const isComboing = tapper.combo >= 3 && now - tapper.lastTapAt <= comboGapMs(totals.upgrades.steady ?? 0)
  const fx = tapper.fx && now - tapper.fx.at < FX_MS ? tapper.fx : null
  const isPressed = tapper.fx !== null && now - tapper.fx.at < PRESS_MS
  const isGolden = now < tapper.goldenUntil
  // Crits show `!`, golden taps `★`. Gain and combo keep fixed widths however big they get.
  const gain = (fx ? `+${formatGain(fx.gained)}${fx.mark}` : '').padEnd(7)
  const combo = (isComboing ? `x${Math.min(tapper.combo, 9999)}` : '').padEnd(5)
  const sparks = formatSparks(sparksOf(totals) + liveSparks).padStart(6)
  return {
    button: drawButton(look, heatOf(recentTaps(tapper, now).length, frenzyAtFor(totals.upgrades)), isPressed, isGolden ? GOLD : undefined),
    readout: ` ${gain} ${combo} ✦ ${sparks}`.padEnd(READOUT_WIDTH).slice(0, READOUT_WIDTH),
  }
}

// The totals and acknowledgement the hooks last handed over, per instance, for the pointer handler.
const lastTaps = new WeakMap<object, HelixTaps>()
const lastAcks = new WeakMap<object, TapAck | null>()

// Which row the tip line sits on, per instance: below the divider when there is one.
const tipRows = new WeakMap<object, number>()

// How far the animation moves per frame, per instance: set while drawing, read by the frame timer.
const rates = new WeakMap<object, number>()

const Helix: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    const mountedAt = Date.now()
    const initial: State = { tick: 0, mountedAt, phase: 0, tipIndex: 0, tipChangedTick: 0, pinned: null }
    surface.setState(initial)
    surface.every(FRAME_MS, () => {
      const state = surface.state ?? initial
      const tick = state.tick + 1
      const newcomer = newcomers.get(surface)
      const seen = introducedHere.get(surface) ?? new Set<string>()
      const isIntroducing = newcomer !== undefined && !seen.has(newcomer.key)
      const isTipDue = tick - state.tipChangedTick >= TIP_TICKS
      if (isIntroducing) {
        introducedHere.set(surface, seen.add(newcomer.key))
        surface.post({ introduced: newcomer.key })
      }
      surface.setState({
        ...state,
        tick,
        phase: state.phase + (rates.get(surface) ?? 0.1),
        tipIndex: isTipDue && !isIntroducing ? state.tipIndex + 1 : state.tipIndex,
        tipChangedTick: isTipDue || isIntroducing ? tick : state.tipChangedTick,
        pinned: isIntroducing ? (newcomer.lines[0] ?? null) : isTipDue ? null : state.pinned,
      })

      const current = showing.get(surface)
      const sighting = current ? `${current.verb}:${current.rarity}` : null
      const tapper = tappers.get(surface)
      const motion = showingMotion.get(surface)
      const isTapStateDue = tapper !== undefined && isUnacked(tapper, lastAcks.get(surface)) && tick - tapper.postedAt / FRAME_MS >= REPOST_TICKS
      if (tapper && isTapStateDue && tapper.menu > ackedBy(tapper, lastAcks.get(surface)).menu) {
        surface.post({ tapState: { instance: tapper.instance, total: tapper.total, menu: tapper.menu } })
        tappers.set(surface, { ...tapper, postedAt: tick * FRAME_MS })
      } else if (current && sighting && reported.get(surface) !== sighting) {
        reported.set(surface, sighting)
        surface.post(current)
      } else if (motion && reportedMotion.get(surface) !== motion) {
        reportedMotion.set(surface, motion)
        surface.post({ motion })
      } else if (tapper && isTapStateDue) {
        surface.post({ tapState: { instance: tapper.instance, total: tapper.total, menu: tapper.menu } })
        tappers.set(surface, { ...tapper, postedAt: tick * FRAME_MS })
      }

      // About once a second, a chance the button turns gold for a moment, once Golden taps is bought.
      const goldenLevel = tapUpgrades.get(surface)?.golden ?? 0
      const now = tick * FRAME_MS
      const isRolling = tapper !== undefined && tapRegions.has(surface) && goldenLevel > 0 && tick % GOLDEN_ROLL_TICKS === 0 && now >= tapper.goldenUntil
      if (isRolling && Math.random() < goldenChancePerSecond(goldenLevel)) {
        tappers.set(surface, { ...(tappers.get(surface) ?? tapper), goldenUntil: now + goldenMs(tapUpgrades.get(surface)?.goldenTouch ?? 0) })
      }
    })
    // A click anywhere on the tip line moves on to the next one and restarts its 15 seconds.
    // A click on the tap strip is a tap: sparks, heat and the combo.
    surface.onPointer(event => {
      const state = surface.state
      const isTipLineClick = event.type === 'down' && event.y === (tipRows.get(surface) ?? 1)
      const region = tapRegions.get(surface)
      const tapper = tappers.get(surface)
      const isOnStrip = event.type === 'down' && region !== undefined && event.y === region.row && event.x >= region.x
      const isMenu = isOnStrip && event.x >= region.menuX
      const isTap = isOnStrip && !isMenu
      if (state && isTipLineClick) {
        surface.setState({ ...state, tipIndex: state.tipIndex + 1, tipChangedTick: state.tick, pinned: null })
      } else if (state && tapper && isTap) {
        const totals = totalsOf(tapper, normalizeTaps(lastTaps.get(surface)), lastAcks.get(surface))
        tappers.set(surface, tap(tapper, totals, state.tick * FRAME_MS))
        surface.setState({ ...state })
      } else if (state && tapper && isMenu) {
        tappers.set(surface, { ...tapper, menu: tapper.menu + 1 })
      }
    })
  }

  const phase = surface.state?.phase ?? 0
  const tick = surface.state?.tick ?? 0
  const failure = props.failure ?? null
  if (failure && failureStarts.get(surface)?.id !== failure.id) {
    failureStarts.set(surface, { id: failure.id, tick })
  }
  const failureStart = failureStarts.get(surface)
  const isShowingFailure = failure !== null && failureStart !== undefined && tick - failureStart.tick < FAILURE_TICKS

  const phaseMotion = props.tool ? TOOL_MOTIONS[props.tool] : (MOTIONS[props.mode] ?? THINKING)
  const groupMotion = props.compacting ? COMPACT_MOTION : phaseMotion
  const rare = props.rareMotion ? rareMotionById(props.rareMotion) : undefined
  const baseMotion = rare ? { ...groupMotion, pattern: rare.pattern } : groupMotion
  const motion = props.palette ? { ...baseMotion, palette: props.palette } : baseMotion
  const startedAt = props.startedAt ?? surface.state?.mountedAt ?? Date.now()
  const elapsedMs = Date.now() - startedAt
  rates.set(surface, motion.speed)

  const rarity = props.rarity ?? 'common'
  const agentCount = props.agents ?? 0
  if (props.collect) {
    showing.set(surface, { verb: props.collect, rarity })
  } else {
    showing.delete(surface)
  }
  if (rare && props.collectMotion) {
    showingMotion.set(surface, rare.id)
  } else {
    showingMotion.delete(surface)
  }

  const cells = drawFrame(motion, phase)
  const stats = [formatElapsed(elapsedMs)]
  if (agentCount > 0) {
    stats.push(`${agentCount} ${agentCount === 1 ? 'agent' : 'agents'}`)
  }
  const tokens = tokenReadout(props, elapsedMs)
  if (tokens) {
    stats.push(tokens)
  }

  const active = activeSituations(props.situations ?? [], elapsedMs)
  const newcomer = firstUnintroduced(active, [...(props.introduced ?? []), ...(introducedHere.get(surface) ?? [])])
  if (newcomer) {
    newcomers.set(surface, newcomer)
  } else {
    newcomers.delete(surface)
  }
  const tipIndex = (surface.state?.tipIndex ?? 0) + (props.tipSeed ?? 0)
  const tip = surface.state?.pinned ?? tipAt(props.tips ?? [], active, tipIndex)

  // With a divider, a blank row above it keeps the block off the output: blank, divider, row, tip.
  tipRows.set(surface, props.divider ? 3 : 1)
  const dividerWidth = surface.columns > 0 ? surface.columns : FALLBACK_COLUMNS
  const base = props.focus ? focusBase(surface, props.focus, dividerWidth) : undefined
  const plainCells = dividerCells(dividerWidth, tick * FRAME_MS, props.signature, props.night, base)
  const dividerLineCells = props.project ? withProjectName(plainCells, props.project.name, props.project.branch) : plainCells

  if (props.taps && !tappers.has(surface)) {
    tappers.set(surface, newTapper())
  }
  const tapper = props.taps ? tappers.get(surface) : undefined
  const saved = normalizeTaps(props.taps)
  lastTaps.set(surface, saved)
  lastAcks.set(surface, props.tapAck ?? null)
  tapUpgrades.set(surface, saved.upgrades)
  const totals = tapper ? totalsOf(tapper, saved, props.tapAck) : saved
  const liveSparks = props.startedAt === null || props.isDemo ? 0 : turnSparks(saved.upgrades, props.workMs ?? 0, props.outputTokens, props.turnTools ?? 0)
  const sparkleWidth = rarity === 'shiny' ? 4 : 0
  const rowWidth = cells.length + 1 + sparkleWidth + Array.from(props.text).length + props.suffix.length + ` (${stats.join(' · ')})`.length
  const stripRoom = dividerWidth - rowWidth - 1
  const strip = tapper && stripRoom >= STRIP_WIDTH + 2 ? stripParts(tapper, totals, liveSparks, tick * FRAME_MS, props.tapLook ?? DEFAULT_LOOK) : null
  if (strip) {
    const x = dividerWidth - 1 - STRIP_WIDTH
    tapRegions.set(surface, { row: props.divider ? 2 : 0, x, menuX: x + STRIP_WIDTH - MENU_CELLS })
  } else {
    tapRegions.delete(surface)
  }

  return (
    <Box flexDirection="column">
      {props.divider && <Text> </Text>}
      {props.divider && (
        <Box flexDirection="row">
          {dividerRuns(dividerLineCells).map(run =>
            run.isMark ? (
              <Text dimColor color={isShowingFailure ? FAILURE_COLOR : props.palette?.[1]}>
                {run.text}
              </Text>
            ) : (
              <Text dimColor={!isShowingFailure && !props.project} color={isShowingFailure ? FAILURE_COLOR : props.project?.color}>
                {run.text}
              </Text>
            ),
          )}
        </Box>
      )}
      <Box flexDirection="row">
        {cells.map(({ glyph, color, isHot }) => (
          <Text color={color} bold={isHot}>
            {glyph}
          </Text>
        ))}
        <Text> </Text>
        {rarity === 'shiny' && <Text color="#fde68a">{sparkle(phase, 0)} </Text>}
        {shimmerText(props.text, motion, phase, rarity).map(({ character, color }) => (
          <Text color={color} bold>
            {character}
          </Text>
        ))}
        {rarity === 'shiny' && <Text color="#fde68a"> {sparkle(phase, 2)}</Text>}
        <Text dimColor>{props.suffix}</Text>
        <Text dimColor> ({stats.join(' · ')})</Text>
        {strip && <Text>{' '.repeat(Math.max(1, stripRoom - STRIP_WIDTH))}</Text>}
        {strip?.button.map(piece => (
          <Text color={piece.color} backgroundColor={piece.backgroundColor} dimColor={piece.dimColor} bold={piece.bold} inverse={piece.inverse}>
            {piece.text}
          </Text>
        ))}
        {strip && <Text dimColor>{strip.readout}</Text>}
        {strip && <Text dimColor>{MENU_MARK}</Text>}
      </Box>
      {tip && (
        <Box flexDirection="row">
          <Text dimColor>{'  ⎿  '}</Text>
          <Text color={tip.color ?? LABEL_COLORS[tip.kind] ?? '#93c5fd'}>{`${tip.kind}:`}</Text>
          <Box flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {' '}
              {tip.text}
            </Text>
          </Box>
          <Box flexShrink={0}>
            <Text dimColor>{'  next ›'}</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default Helix

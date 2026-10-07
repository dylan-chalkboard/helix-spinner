import type { ClientModule } from 'claude-code'

import type { HelixFailure } from '../types'

import { focusLine } from './focus'
import { withProjectName } from './project'
import { CELLS, DOT_COLUMNS, DOT_ROWS, pingPong, strandRow } from './grid'
import type { Motion, Pattern } from './grid'
import { activeSituations, firstUnintroduced, tipAt } from './tip-rotation'
import type { Situation, TipLine } from './tip-rotation'
import { TOOL_MOTIONS } from './tool-motions'
import type { ToolGroup } from './tools'

type Props = {
  mode: string
  tool?: ToolGroup | null
  text: string
  suffix: string
  startedAt: number | null
  outputTokens: number
  inputTokens: number
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
  tipSeed?: number
  divider?: boolean
  palette?: string[]
  signature?: string
  night?: number
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

const MAX_AGENT_STRANDS = 3

// One extra wave per running subagent, each at its own pace and offset.
const isAgentStrand = (x: number, y: number, t: number, agentCount: number) => {
  for (let agent = 0; agent < Math.min(agentCount, MAX_AGENT_STRANDS); agent++) {
    if (y === strandRow(x * 0.5 - t * (1.3 + agent * 0.4) + agent * 2.1)) {
      return true
    }
  }
  return false
}

const drawFrame = (motion: Motion, t: number, agentCount: number) => {
  const { isLit, depth = () => 0.5, focus } = motion.pattern
  const focusColumn = focus(t)

  return Array.from({ length: CELLS }, (_, cell) => {
    let bits = 0
    let cellDepth = 0

    for (let column = 0; column < 2; column++) {
      const x = cell * 2 + column
      for (let y = 0; y < DOT_ROWS; y++) {
        if (isLit(x, y, t) || isAgentStrand(x, y, t, agentCount)) {
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
      if (current && sighting && reported.get(surface) !== sighting) {
        reported.set(surface, sighting)
        surface.post(current)
      }
    })
    // A click anywhere on the tip line moves on to the next one and restarts its 15 seconds.
    surface.onPointer(event => {
      const state = surface.state
      const isTipLineClick = event.type === 'down' && event.y === (tipRows.get(surface) ?? 1)
      if (state && isTipLineClick) {
        surface.setState({ ...state, tipIndex: state.tipIndex + 1, tipChangedTick: state.tick, pinned: null })
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

  const baseMotion = props.tool ? TOOL_MOTIONS[props.tool] : (MOTIONS[props.mode] ?? THINKING)
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

  const cells = drawFrame(motion, phase, agentCount)
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

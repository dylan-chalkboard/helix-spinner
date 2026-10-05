import type { ClientModule } from 'claude-code'

type Props = {
  mode: string
  text: string
  suffix: string
  startedAt: number | null
  outputTokens: number
  inputTokens: number
  aheadMs?: number
  isDemo?: boolean
  rarity?: 'common' | 'rare' | 'shiny'
  collect?: string | null
  agents?: number
  tips?: readonly { kind: string; text: string }[]
  tipSeed?: number
  divider?: boolean
}
type State = { tick: number; mountedAt: number; phase: number; tipIndex: number; tipChangedTick: number }

const CELLS = 12
const DOT_COLUMNS = CELLS * 2
const DOT_ROWS = 4
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

// One animation: which braille dots are lit at time t, how deep each column sits
// (brighter in front), and where its glow centers, all in dot coordinates.
type Pattern = {
  isLit: (x: number, y: number, t: number) => boolean
  depth?: (x: number, t: number) => number
  focus: (t: number) => number
}

type Motion = { palette: string[]; speed: number; pattern: Pattern }

const pingPong = (t: number, rate: number) => ((Math.sin(t * rate) + 1) / 2) * (DOT_COLUMNS - 1)

const strandRow = (phase: number) => Math.round(((Math.sin(phase) + 1) / 2) * (DOT_ROWS - 1))

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

const HOT_PALETTE = ['#b91c1c', '#f97316', '#fef08a']
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

// 0 until 30s, rising to 1 at 2m: hotter colors and a faster animation.
export const heatFor = (elapsedMs: number) => clamp01((elapsedMs - 30_000) / 90_000)

type Fever = { heat: number }

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

const drawFrame = (motion: Motion, t: number, fever: Fever, agentCount: number) => {
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
    const cool = mix(mix(base, BLACK, 0.35 - cellDepth * 0.25), gradient(motion.palette, 1), glow)
    const color = mix(cool, gradient(HOT_PALETTE, 0.3 + shimmer * 0.4 + glow * 0.3), fever.heat * 0.4)

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

const shimmerText = (text: string, motion: Motion, t: number, fever: Fever, rarity: string) =>
  Array.from(text).map((character, index) => {
    const wave = (Math.sin(index * 0.5 - t * 1.8) + 1) / 2
    if (rarity === 'shiny') {
      return { character, color: toHex(gradient(GOLD_PALETTE, 0.3 + wave * 0.7)) }
    }
    if (rarity === 'rare') {
      return { character, color: toHex(hueToRgb((index * 0.06 + t * 0.15) % 1)) }
    }
    const cool = gradient(motion.palette, 0.45 + wave * 0.55)
    return { character, color: toHex(mix(cool, gradient(HOT_PALETTE, 0.4 + wave * 0.6), fever.heat * 0.4)) }
  })

const SPARKLES = ['✦', '✧', '⋆', '✧']

const sparkle = (t: number, offset: number) => SPARKLES[Math.floor(t * 2 + offset) % SPARKLES.length] ?? '✦'

// The verbs the live spinner has reported, per instance, so each is posted once.
const reported = new WeakMap<object, string>()

// The verb on screen now, per instance: posted from the frame timer, once the instance is mounted.
const showing = new WeakMap<object, { verb: string; rarity: string }>()

const TIP_TICKS = TIP_MS / FRAME_MS

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
    surface.setState({ tick: 0, mountedAt, phase: 0, tipIndex: 0, tipChangedTick: 0 })
    surface.every(FRAME_MS, () => {
      const state = surface.state ?? { tick: 0, mountedAt, phase: 0, tipIndex: 0, tipChangedTick: 0 }
      const tick = state.tick + 1
      const isTipDue = tick - state.tipChangedTick >= TIP_TICKS
      surface.setState({
        ...state,
        tick,
        phase: state.phase + (rates.get(surface) ?? 0.1),
        tipIndex: isTipDue ? state.tipIndex + 1 : state.tipIndex,
        tipChangedTick: isTipDue ? tick : state.tipChangedTick,
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
        surface.setState({ ...state, tipIndex: state.tipIndex + 1, tipChangedTick: state.tick })
      }
    })
  }

  const phase = surface.state?.phase ?? 0
  const motion = MOTIONS[props.mode] ?? THINKING
  const startedAt = props.startedAt ?? surface.state?.mountedAt ?? Date.now()
  const elapsedMs = Date.now() - startedAt + (props.aheadMs ?? 0)
  const fever = { heat: heatFor(elapsedMs) }
  rates.set(surface, motion.speed * (1 + fever.heat * 0.8))

  const rarity = props.rarity ?? 'common'
  const agentCount = props.agents ?? 0
  if (props.collect) {
    showing.set(surface, { verb: props.collect, rarity })
  } else {
    showing.delete(surface)
  }

  const cells = drawFrame(motion, phase, fever, agentCount)
  const stats = [formatElapsed(elapsedMs)]
  if (agentCount > 0) {
    stats.push(`${agentCount} ${agentCount === 1 ? 'agent' : 'agents'}`)
  }
  const tokens = tokenReadout(props, elapsedMs)
  if (tokens) {
    stats.push(tokens)
  }

  const tips = props.tips ?? []
  const tip = tips.length > 0 ? tips[((surface.state?.tipIndex ?? 0) + (props.tipSeed ?? 0)) % tips.length] : undefined

  tipRows.set(surface, props.divider ? 2 : 1)
  const dividerWidth = surface.columns > 0 ? surface.columns : FALLBACK_COLUMNS

  return (
    <Box flexDirection="column">
      {props.divider && <Text dimColor>{dividerLine(dividerWidth, (surface.state?.tick ?? 0) * FRAME_MS)}</Text>}
      <Box flexDirection="row">
        {cells.map(({ glyph, color, isHot }) => (
          <Text color={color} bold={isHot}>
            {glyph}
          </Text>
        ))}
        <Text> </Text>
        {rarity === 'shiny' && <Text color="#fde68a">{sparkle(phase, 0)} </Text>}
        {shimmerText(props.text, motion, phase, fever, rarity).map(({ character, color }) => (
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
          <Text color={LABEL_COLORS[tip.kind] ?? '#93c5fd'}>{`${tip.kind}:`}</Text>
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

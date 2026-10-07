import { DOT_COLUMNS, DOT_ROWS, pingPong } from './grid'
import type { Motion, Pattern } from './grid'
import type { ToolGroup } from './tools'

// Stable pseudo-random in [0, 1) for a pair of numbers.
const noise = (a: number, b: number) => {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return n - Math.floor(n)
}

const CENTER = (DOT_COLUMNS - 1) / 2

// Lines of text: a ragged length and a gap between words now and then.
const lineLength = (line: number, shortest: number, spread: number) => shortest + Math.floor(noise(line, 1) * spread)

const isWordGap = (line: number, x: number) => x % 5 === 4 && noise(line, x) < 0.7

// Shell: a > prompt, a command typing out after it behind a blinking block cursor, then a fresh line.
const CHEVRON = new Set(['0,0', '1,1', '1,2', '0,3'])
const COMMAND_START = 4
const SHELL_STEPS_PER_COMMAND = 26

const typing = (t: number) => {
  const steps = t * 5
  const command = Math.floor(steps / SHELL_STEPS_PER_COMMAND)
  const length = lineLength(command, 10, 10)
  const typedTo = COMMAND_START + Math.min(steps % SHELL_STEPS_PER_COMMAND, length)
  return { command, typedTo }
}

const shell: Pattern = {
  isLit: (x, y, t) => {
    if (CHEVRON.has(`${x},${y}`)) {
      return true
    }
    const { command, typedTo } = typing(t)
    const cursorAt = Math.floor(typedTo)
    const isCursor = x >= cursorAt && x < cursorAt + 2 && Math.floor(t * 1.2) % 2 === 0
    const isCharacter = x >= COMMAND_START && x < typedTo && (y === 1 || y === 2)
    return isCursor || (isCharacter && noise(command * 7 + Math.floor((x - COMMAND_START) / 2), y) > 0.25)
  },
  focus: t => typing(t).typedTo,
}

// Read: a scan bar sweeps across the page, the text showing behind it; each pass is a new page.
const READ_CYCLE = DOT_COLUMNS + 6

const scanHead = (t: number) => (t * 6) % READ_CYCLE

const read: Pattern = {
  isLit: (x, y, t) => {
    const head = scanHead(t)
    const page = Math.floor((t * 6) / READ_CYCLE)
    const line = page * DOT_ROWS + y
    return x === Math.floor(head) || (x < head && x < lineLength(line, 14, 10) && !isWordGap(line, x))
  },
  focus: scanHead,
}

// Search: a sonar beam sweeps back and forth and blips light up as it passes them.
const BLIPS = 4

const search: Pattern = {
  isLit: (x, y, t) => {
    const beam = pingPong(t, 0.8)
    if (x === Math.round(beam)) {
      return true
    }
    const sweep = Math.floor((t * 0.8 + Math.PI / 2) / Math.PI)
    for (let blip = 0; blip < BLIPS; blip++) {
      const isBlip = x === Math.floor(noise(sweep, blip) * DOT_COLUMNS) && y === Math.floor(noise(blip, sweep) * DOT_ROWS)
      if (isBlip && Math.abs(x - beam) < 4) {
        return true
      }
    }
    return false
  },
  focus: t => pingPong(t, 0.8),
}

// Edit: a needle sews a zigzag stitch across, then it is unpicked from the left.
const ZIGZAG = [3, 2, 1, 0, 1, 2]

const stitch = (t: number) => (t * 7) % (DOT_COLUMNS * 2)

const edit: Pattern = {
  isLit: (x, y, t) => {
    const c = stitch(t)
    const isSewing = c < DOT_COLUMNS
    const row = ZIGZAG[x % ZIGZAG.length] ?? 0
    const isNeedle = isSewing && x === Math.floor(c) && y <= row
    const isStitched = y === row && (isSewing ? x <= c : x > c - DOT_COLUMNS)
    return isNeedle || isStitched
  },
  focus: t => stitch(t) % DOT_COLUMNS,
}

// Web: ripples spread out from the middle.
const RINGS = 3
const RING_SPACING = 5
const RING_REACH = 15

const web: Pattern = {
  isLit: (x, y, t) => {
    const distance = Math.hypot(x - CENTER, y - (DOT_ROWS - 1) / 2)
    for (let ring = 0; ring < RINGS; ring++) {
      const radius = (t * 3 + ring * RING_SPACING) % RING_REACH
      if (Math.abs(distance - radius) < 0.6) {
        return true
      }
    }
    return false
  },
  depth: x => 1 - Math.abs(x - CENTER) / CENTER,
  focus: () => CENTER,
}

// Agents: a game of Pong, the work volleyed back and forth across a dotted net.
const COURT = DOT_COLUMNS - 3
const NET = DOT_COLUMNS / 2
const PADDLE_HEIGHT = 2

// 0 up to size and back down again, over and over.
const bounce = (value: number, size: number) => {
  const wrapped = value % (size * 2)
  return wrapped < size ? wrapped : size * 2 - wrapped
}

const pong = (t: number) => {
  const travel = t * 6
  const ballY = Math.round(bounce(t * 2.3, DOT_ROWS - 1))
  const isHeadingRight = Math.floor(travel / COURT) % 2 === 0
  const meeting = Math.min(ballY, DOT_ROWS - PADDLE_HEIGHT)
  const resting = (DOT_ROWS - PADDLE_HEIGHT) / 2
  return {
    ballX: 1 + Math.round(bounce(travel, COURT)),
    ballY,
    leftTop: isHeadingRight ? resting : meeting,
    rightTop: isHeadingRight ? meeting : resting,
  }
}

const agents: Pattern = {
  isLit: (x, y, t) => {
    const { ballX, ballY, leftTop, rightTop } = pong(t)
    const isPaddle = (top: number) => y >= top && y < top + PADDLE_HEIGHT
    const isLeftPaddle = x === 0 && isPaddle(leftTop)
    const isRightPaddle = x === DOT_COLUMNS - 1 && isPaddle(rightTop)
    const isNet = x === NET && y % 2 === 0
    const isBall = x === ballX && y === ballY
    return isLeftPaddle || isRightPaddle || isNet || isBall
  },
  focus: t => pong(t).ballX,
}

// MCP: a plug slides into a socket, sparks fly, then it pulls back out.
const PLUG_CYCLE = 12
const PLUG_TRAVEL = 8

const plugState = (t: number) => {
  const c = (t * 1.2) % PLUG_CYCLE
  const reach = c < 5 ? c / 5 : c < 8 ? 1 : c < 11 ? 1 - (c - 8) / 3 : 0
  return { offset: Math.round(reach * PLUG_TRAVEL), isConnected: c >= 5 && c < 8 }
}

const mcp: Pattern = {
  isLit: (x, y, t) => {
    const { offset, isConnected } = plugState(t)
    const plugStart = offset
    const socketStart = DOT_COLUMNS - 2 - offset
    const isPlug = x >= plugStart && x < plugStart + 4
    const isProng = (y === 1 || y === 2) && (x === plugStart + 4 || x === plugStart + 5)
    const isSocket = x >= socketStart && x < socketStart + 4
    const isSpark = isConnected && x >= 5 && x <= 20 && noise(Math.floor(t * 8), x * DOT_ROWS + y) > 0.6
    return isPlug || isProng || isSocket || isSpark
  },
  focus: t => {
    const { offset, isConnected } = plugState(t)
    return isConnected ? 13 : offset + 5
  },
}

// Compacting: scattered dots are pulled into the middle and packed into a tight block, then a fresh scatter.
const SQUEEZE_DOTS = 22
const SQUEEZE_CYCLE = 6
const SQUEEZE_GATHER = 4.5
const BLOCK_WIDTH = 5

const squeeze: Pattern = {
  isLit: (x, y, t) => {
    const round = Math.floor(t / SQUEEZE_CYCLE)
    const gathered = Math.min(1, (t % SQUEEZE_CYCLE) / SQUEEZE_GATHER)
    const pull = gathered * gathered
    for (let dot = 0; dot < SQUEEZE_DOTS; dot++) {
      const fromX = noise(dot, round) * DOT_COLUMNS
      const fromY = Math.floor(noise(round, dot) * DOT_ROWS)
      const toX = CENTER - 2 + (dot % BLOCK_WIDTH)
      const toY = Math.floor(dot / (SQUEEZE_DOTS / DOT_ROWS))
      const isHere = x === Math.round(fromX + (toX - fromX) * pull) && y === Math.round(fromY + (toY - fromY) * pull)
      if (isHere) {
        return true
      }
    }
    return false
  },
  focus: () => CENTER,
}

export const COMPACT_MOTION: Motion = { palette: ['#7c2d12', '#fdba74', '#fff7ed'], speed: 0.1, pattern: squeeze }

export const TOOL_MOTIONS: Record<ToolGroup, Motion> = {
  shell: { palette: ['#14532d', '#22c55e', '#bbf7d0'], speed: 0.1, pattern: shell },
  read: { palette: ['#44403c', '#d6d3d1', '#fafaf9'], speed: 0.1, pattern: read },
  search: { palette: ['#134e4a', '#2dd4bf', '#ccfbf1'], speed: 0.1, pattern: search },
  edit: { palette: ['#881337', '#f43f5e', '#ffe4e6'], speed: 0.1, pattern: edit },
  web: { palette: ['#312e81', '#818cf8', '#e0e7ff'], speed: 0.1, pattern: web },
  agents: { palette: ['#3f6212', '#a3e635', '#f7fee7'], speed: 0.1, pattern: agents },
  mcp: { palette: ['#4a044e', '#e879f9', '#fdf4ff'], speed: 0.1, pattern: mcp },
}

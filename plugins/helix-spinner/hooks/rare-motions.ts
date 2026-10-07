import { DOT_COLUMNS, DOT_ROWS } from './grid'
import type { Pattern } from './grid'

// Stable pseudo-random in [0, 1) for a pair of numbers.
const noise = (a: number, b: number) => {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return n - Math.floor(n)
}

// 0 up to size and back down again, over and over.
const bounce = (value: number, size: number) => {
  const wrapped = ((value % (size * 2)) + size * 2) % (size * 2)
  return wrapped < size ? wrapped : size * 2 - wrapped
}

// A little picture drawn with '#' at a column and row offset.
const sprite = (rows: readonly string[], left: number, top = 0) => (x: number, y: number) =>
  rows[y - top]?.[x - left] === '#'

const CENTER = (DOT_COLUMNS - 1) / 2
const BOTTOM = DOT_ROWS - 1

// Thinking

// A bright head arcs across, its tail thinning out behind it.
const comet: Pattern = {
  isLit: (x, y, t) => {
    const head = (t * 9) % (DOT_COLUMNS + 14) - 2
    const behind = head - x
    if (behind < 0 || behind > 10) {
      return false
    }
    const row = Math.round(1.5 + 1.2 * Math.sin(x * 0.25 + t * 0.3))
    return y === row && (behind < 3 || noise(x, Math.floor(t * 6)) > behind / 10)
  },
  focus: t => (t * 9) % (DOT_COLUMNS + 14) - 2,
}

// Stars stream out from the middle, speeding up as they go.
const warp: Pattern = {
  isLit: (x, y, t) => {
    for (let star = 0; star < 14; star++) {
      const life = (t * 0.9 + noise(star, 1)) % 1
      const angle = noise(star, 2) * Math.PI * 2
      const distance = life * life * 16
      const starX = Math.round(CENTER + Math.cos(angle) * distance)
      const starY = Math.round(1.5 + Math.sin(angle) * distance * 0.25)
      const trailX = starX - Math.sign(Math.cos(angle))
      if (y === starY && (x === starX || (life > 0.6 && x === trailX))) {
        return true
      }
    }
    return false
  },
  focus: () => CENTER,
}

// Requesting

// A paper plane loops across, dipping and climbing.
const PLANE = ['#...', '###.', '.###', '#...']
const paperPlane: Pattern = {
  isLit: (x, y, t) => {
    const left = Math.round((t * 7) % (DOT_COLUMNS + 6)) - 4
    const top = Math.round(bounce(t * 1.5, 1)) - 0
    return sprite(PLANE, left, top)(x, y) && y <= BOTTOM
  },
  focus: t => (t * 7) % (DOT_COLUMNS + 6),
}

// A rocket streaks across on a flickering trail of exhaust.
const ROCKET = ['.##..', '#####', '#####', '.##..']
const rocket: Pattern = {
  isLit: (x, y, t) => {
    const nose = Math.round((t * 10) % (DOT_COLUMNS + 18)) - 2
    if (sprite(ROCKET, nose - 4, 0)(x, y)) {
      return true
    }
    const behind = nose - 5 - x
    return (y === 1 || y === 2) && behind >= 0 && behind < 8 && noise(x, Math.floor(t * 8) + y) > behind / 9
  },
  focus: t => (t * 10) % (DOT_COLUMNS + 18),
}

// Responding

// Rockets shoot up and burst into rings of sparks.
const fireworks: Pattern = {
  isLit: (x, y, t) => {
    for (let burst = 0; burst < 2; burst++) {
      const clock = t / 2.2 + burst * 0.5
      const round = Math.floor(clock)
      const age = (clock - round) * 2.2
      const centerX = 3 + noise(round, burst) * 18
      if (age < 0.25) {
        if (x === Math.round(centerX) && y === BOTTOM - Math.floor(age * 12)) {
          return true
        }
        continue
      }
      const radius = age * 3
      const distance = Math.hypot(x - centerX, (y - 1.5) * 1.6)
      if (radius < 7 && Math.abs(distance - radius) < 0.5 && noise(x * 7 + y, round) > 0.35) {
        return true
      }
    }
    return false
  },
  focus: t => 3 + noise(Math.floor(t / 2.2), 0) * 18,
}

// A stick figure dances its way across, arms up then arms down.
const DANCE_UP = ['#.#', '.#.', '###', '#.#']
const DANCE_DOWN = ['.#.', '###', '.#.', '#.#']
const dancer: Pattern = {
  isLit: (x, y, t) => {
    const step = Math.floor(t * 3)
    const left = Math.round(bounce(step, DOT_COLUMNS - 3))
    return sprite(step % 2 === 0 ? DANCE_UP : DANCE_DOWN, left)(x, y)
  },
  focus: t => bounce(Math.floor(t * 3), DOT_COLUMNS - 3) + 1,
}

// Preparing a tool call

// Bricks are laid course by course, each row offset like a real wall, then it starts over.
const bricklayer: Pattern = {
  isLit: (x, y, t) => {
    const laid = Math.floor((t * 6) % (DOT_COLUMNS * DOT_ROWS + 12))
    const course = BOTTOM - y
    const offset = course % 2 === 0 ? 0 : 2
    const isMortar = (x + offset) % 4 === 3
    const order = course * DOT_COLUMNS + (course % 2 === 0 ? x : DOT_COLUMNS - 1 - x)
    return order < laid && !isMortar
  },
  focus: t => Math.floor((t * 6) % DOT_COLUMNS),
}

// A crane swings its hook across, lowers a block, then goes back for another.
const crane: Pattern = {
  isLit: (x, y, t) => {
    const cycle = (t * 2) % 8
    const hookX = Math.round(cycle < 4 ? 3 + cycle * 4 : 19 - (cycle - 4) * 4)
    const isBeam = y === 0
    const isCable = x === hookX && y >= 1 && y <= (cycle < 4 ? 2 : 1)
    const isBlock = (x === hookX || x === hookX + 1) && y === (cycle < 4 ? 3 : 2)
    return isBeam || isCable || isBlock
  },
  focus: t => {
    const cycle = (t * 2) % 8
    return cycle < 4 ? 3 + cycle * 4 : 19 - (cycle - 4) * 4
  },
}

// Running a tool

// A block bounces around the box, the way an old DVD player's logo did.
const dvd: Pattern = {
  isLit: (x, y, t) => {
    const left = Math.round(bounce(t * 4, DOT_COLUMNS - 4))
    const top = Math.round(bounce(t * 1.3, DOT_ROWS - 2))
    return x >= left && x < left + 4 && y >= top && y < top + 2
  },
  focus: t => bounce(t * 4, DOT_COLUMNS - 4) + 2,
}

// A Newton's cradle: the outer balls swing out and knock in turn.
const BALLS = [8, 10, 12, 14, 16]
const cradle: Pattern = {
  isLit: (x, y, t) => {
    const swing = Math.sin(t * 2.4)
    const leftOut = Math.max(0, -swing)
    const rightOut = Math.max(0, swing)
    const isString = y === 0 && x >= 7 && x <= 17
    const ballAt = (index: number) => {
      const home = BALLS[index] ?? 0
      if (index === 0) {
        return { ballX: Math.round(home - leftOut * 4), ballY: Math.round(BOTTOM - leftOut * 1.5) }
      }
      if (index === BALLS.length - 1) {
        return { ballX: Math.round(home + rightOut * 4), ballY: Math.round(BOTTOM - rightOut * 1.5) }
      }
      return { ballX: home, ballY: BOTTOM }
    }
    return isString || BALLS.some((_, index) => {
      const { ballX, ballY } = ballAt(index)
      return (x === ballX || x === ballX + 1) && (y === ballY || y === ballY - 1)
    })
  },
  focus: () => CENTER,
}

// Shell

// A space invader marches side to side, legs swapping with every step.
const INVADER_A = ['..#..#..', '.######.', '##.##.##', '#.#..#.#']
const INVADER_B = ['..#..#..', '.######.', '##.##.##', '.#....#.']
const invader: Pattern = {
  isLit: (x, y, t) => {
    const step = Math.floor(t * 3)
    return sprite(step % 2 === 0 ? INVADER_A : INVADER_B, Math.round(bounce(step, DOT_COLUMNS - 8)))(x, y)
  },
  focus: t => bounce(Math.floor(t * 3), DOT_COLUMNS - 8) + 4,
}

// Breakout: a ball knocks out a row of bricks while the paddle chases it.
const breakout: Pattern = {
  isLit: (x, y, t) => {
    const ballX = Math.round(bounce(t * 7, DOT_COLUMNS - 1))
    const ballY = Math.round(1 + bounce(t * 2.2, 2))
    const round = Math.floor(t / 7)
    const isBrick = y === 0 && x % 3 !== 2 && noise(Math.floor(x / 3), round) > ((t % 7) / 7) * 0.9
    const paddleLeft = Math.max(0, Math.min(DOT_COLUMNS - 4, ballX - 2))
    const isPaddle = y === BOTTOM && x >= paddleLeft && x < paddleLeft + 4
    return isBrick || isPaddle || (x === ballX && y === ballY)
  },
  focus: t => bounce(t * 7, DOT_COLUMNS - 1),
}

// Reading

// A bookworm inches along a line of text, bunching up and stretching out.
const bookworm: Pattern = {
  isLit: (x, y, t) => {
    const step = Math.floor(t * 4)
    const tail = Math.floor(step / 2) * 2 % (DOT_COLUMNS + 6) - 4
    const isBunched = step % 2 === 1
    const length = isBunched ? 3 : 5
    const isText = y === BOTTOM && x % 4 !== 3
    const isHump = isBunched && y === 1 && x === tail + 1
    const isBody = y === 2 && x >= tail && x < tail + length
    return isText || isHump || isBody
  },
  focus: t => (Math.floor(Math.floor(t * 4) / 2) * 2) % (DOT_COLUMNS + 6) - 2,
}

// A book opens, its pages fan through from right to left, and it closes again.
const pageFlip: Pattern = {
  isLit: (x, y, t) => {
    const spine = Math.round(CENTER)
    const isSpine = x === spine
    const isCover = y === BOTTOM && Math.abs(x - spine) <= 8
    const flipping = (t * 3) % 6
    const page = Math.floor(flipping)
    const progress = flipping - page
    const pageX = Math.round(spine + 7 - progress * 14)
    const pageTop = Math.round(Math.abs(pageX - spine) / 4)
    const isPage = x === pageX && y >= pageTop && y < BOTTOM
    const isStack = y === 2 && Math.abs(x - spine) <= 7 && x !== spine && (x + page) % 2 === 0
    return isSpine || isCover || isPage || isStack
  },
  focus: t => CENTER + 7 - ((t * 3) % 1) * 14,
}

// Searching

// Pac-Man chomps along a row of pellets.
const PAC_OPEN = ['.##.', '##..', '##..', '.##.']
const PAC_SHUT = ['.##.', '###.', '###.', '.##.']
const pacman: Pattern = {
  isLit: (x, y, t) => {
    const left = Math.floor(t * 5) % (DOT_COLUMNS + 6) - 4
    if (sprite(Math.floor(t * 6) % 2 === 0 ? PAC_SHUT : PAC_OPEN, left)(x, y)) {
      return true
    }
    return y === 1 && x > left + 4 && x % 4 === 1
  },
  focus: t => (Math.floor(t * 5) % (DOT_COLUMNS + 6)) - 2,
}

// A magnifying glass drifts across, its lens a ring and its handle trailing behind.
const LENS = ['.##.', '#..#', '#..#', '.##.']
const magnifier: Pattern = {
  isLit: (x, y, t) => {
    const left = Math.round(bounce(t * 3, DOT_COLUMNS - 7))
    const isLens = sprite(LENS, left)(x, y)
    const isHandle = (x === left + 4 && y === 3) || (x === left + 5 && y === 3) || (x === left + 6 && y === 3)
    return isLens || isHandle
  },
  focus: t => bounce(t * 3, DOT_COLUMNS - 7) + 1.5,
}

// Editing

// A cursor scribbles a squiggly line, then erases it backwards.
const scribble: Pattern = {
  isLit: (x, y, t) => {
    const cycle = (t * 8) % (DOT_COLUMNS * 2)
    const isWriting = cycle < DOT_COLUMNS
    const pen = isWriting ? cycle : DOT_COLUMNS * 2 - cycle
    const row = Math.round(1.5 + 1.4 * Math.sin(x * 0.9) * Math.cos(x * 0.31))
    const isInk = x < pen && y === row
    const isCursor = x === Math.floor(pen) && Math.floor(t * 4) % 2 === 0
    return isInk || isCursor
  },
  focus: t => {
    const cycle = (t * 8) % (DOT_COLUMNS * 2)
    return cycle < DOT_COLUMNS ? cycle : DOT_COLUMNS * 2 - cycle
  },
}

// A paint roller rolls across, leaving a solid coat behind it.
const paintRoller: Pattern = {
  isLit: (x, y, t) => {
    const roller = (t * 5) % (DOT_COLUMNS + 8)
    const isHandle = (y === 0 && x >= roller && x <= roller + 3) || (x === Math.floor(roller + 3) && y === 1)
    const isRoller = y >= 1 && y <= 2 && x >= Math.floor(roller) - 1 && x <= Math.floor(roller)
    const isPaint = y >= 1 && y <= BOTTOM && x < Math.floor(roller) - 1
    return isHandle || isRoller || isPaint
  },
  focus: t => (t * 5) % (DOT_COLUMNS + 8),
}

// Web

// A satellite circles a little globe.
const GLOBE = ['.##.', '####', '####', '.##.']
const satellite: Pattern = {
  isLit: (x, y, t) => {
    const globeLeft = Math.round(CENTER) - 2
    if (sprite(GLOBE, globeLeft)(x, y)) {
      return true
    }
    const angle = t * 1.6
    const orbitX = Math.round(CENTER + Math.cos(angle) * 9)
    const orbitY = Math.round(1.5 + Math.sin(angle) * 1.5)
    const isBehind = Math.sin(angle) < 0 && Math.abs(orbitX - CENTER) < 2.5
    return !isBehind && y === orbitY && (x === orbitX || x === orbitX - 1 || x === orbitX + 1)
  },
  focus: t => CENTER + Math.cos(t * 1.6) * 9,
}

// A spider lowers itself on a thread, swings, and climbs back up.
const spider: Pattern = {
  isLit: (x, y, t) => {
    const column = Math.round(4 + bounce(t * 0.8, 1) * 16)
    const depth = Math.round(bounce(t * 1.4, 2))
    const isThread = x === column && y < depth
    const isBody = (x === column - 1 || x === column + 1) && y === depth + 1 ? true : x === column && (y === depth || y === depth + 1)
    const isWeb = y === 0 && x % 3 === 0
    return isThread || isBody || isWeb
  },
  focus: t => 4 + bounce(t * 0.8, 1) * 16,
}

// Subagents

// A squadron of invaders flies in formation, dipping as one.
const SHIP = ['#.#', '###', '.#.']
const formation: Pattern = {
  isLit: (x, y, t) => {
    const lead = Math.round(bounce(t * 3, DOT_COLUMNS - 15))
    return [0, 6, 12].some((gap, ship) => {
      const dip = Math.round(bounce(t * 2 + ship * 0.7, 1))
      return sprite(SHIP, lead + gap, dip)(x, y)
    })
  },
  focus: t => bounce(t * 3, DOT_COLUMNS - 15) + 7,
}

// A conga line of little dancers shuffles across, kicking in turn.
const conga: Pattern = {
  isLit: (x, y, t) => {
    const head = (t * 4) % (DOT_COLUMNS + 16)
    for (let dancer = 0; dancer < 4; dancer++) {
      const left = Math.round(head - dancer * 4)
      const isKicking = (Math.floor(t * 4) + dancer) % 2 === 0
      const isHead = x === left + 1 && y === 0
      const isBody = x === left + 1 && (y === 1 || y === 2)
      const isLegs = y === BOTTOM && (x === left || x === (isKicking ? left + 3 : left + 2))
      if (isHead || isBody || isLegs) {
        return true
      }
    }
    return false
  },
  focus: t => (t * 4) % (DOT_COLUMNS + 16),
}

// MCP

// Lightning arcs jaggedly between two posts.
const lightning: Pattern = {
  isLit: (x, y, t) => {
    const isPost = (x === 2 || x === DOT_COLUMNS - 3) && y >= 1
    const flash = Math.floor(t * 5)
    const isStriking = flash % 3 !== 2
    const boltRow = Math.round(1.5 + (noise(x, flash) - 0.5) * 3)
    const isBolt = isStriking && x > 2 && x < DOT_COLUMNS - 3 && y === Math.max(0, Math.min(BOTTOM, boltRow))
    return isPost || isBolt
  },
  focus: t => noise(Math.floor(t * 5), 1) * DOT_COLUMNS,
}

// Two toy bricks slide together and click into place, studs and all.
const BRICK = ['#.#.', '####', '####']
const bricks: Pattern = {
  isLit: (x, y, t) => {
    const gap = Math.round(bounce(t * 1.8, 6))
    const lower = sprite(BRICK, Math.round(CENTER) - 2, 1)(x, y)
    const upper = sprite(BRICK, Math.round(CENTER) - 2 - gap * 2, 0)(x, y) && y <= 1
    return lower || upper
  },
  focus: () => CENTER,
}

// Compacting

// Tetris: pieces drop into a row, and when it fills, the line clears with a flash.
const tetrisClear: Pattern = {
  isLit: (x, y, t) => {
    const cycle = (t * 2) % 10
    const filled = Math.min(DOT_COLUMNS, Math.floor(cycle * 3))
    const isClearing = cycle >= 8
    if (isClearing) {
      return y === BOTTOM && Math.floor(t * 8) % 2 === 0
    }
    const isStack = y === BOTTOM && x < filled
    const fallingLeft = filled
    const fallingTop = Math.floor((cycle * 3 - filled) * 3) % DOT_ROWS
    const isFalling = (x === fallingLeft || x === fallingLeft + 1) && (y === fallingTop || y === fallingTop + 1) && y < BOTTOM
    return isStack || isFalling
  },
  focus: t => Math.min(DOT_COLUMNS, Math.floor(((t * 2) % 10) * 3)),
}

// A vacuum nozzle sucks stray dots in, one after another.
const vacuum: Pattern = {
  isLit: (x, y, t) => {
    const isNozzle = (x === 0 || x === 1) && y >= 1 && y <= 2
    const isHose = x <= 1 && y === 0
    for (let dot = 0; dot < 8; dot++) {
      const life = (t * 0.6 + dot / 8) % 1
      const startX = 6 + noise(dot, 1) * 17
      const startY = noise(dot, 2) * BOTTOM
      const dotX = Math.round(startX - (startX - 2) * life * life)
      const dotY = Math.round(startY + (1.5 - startY) * life)
      if (x === dotX && y === dotY) {
        return true
      }
    }
    return isNozzle || isHose
  },
  focus: () => 1,
}

export type RareMotion = { id: string; name: string; pattern: Pattern }

// Two rare looks for every phase and tool group, keyed as the spinner names them.
export const RARE_MOTIONS: Record<string, readonly RareMotion[]> = {
  thinking: [
    { id: 'comet', name: 'Comet', pattern: comet },
    { id: 'warp', name: 'Warp speed', pattern: warp },
  ],
  requesting: [
    { id: 'paper-plane', name: 'Paper plane', pattern: paperPlane },
    { id: 'rocket', name: 'Rocket', pattern: rocket },
  ],
  responding: [
    { id: 'fireworks', name: 'Fireworks', pattern: fireworks },
    { id: 'dancer', name: 'Dance break', pattern: dancer },
  ],
  'tool-input': [
    { id: 'bricklayer', name: 'Bricklayer', pattern: bricklayer },
    { id: 'crane', name: 'Crane', pattern: crane },
  ],
  'tool-use': [
    { id: 'dvd', name: 'DVD bounce', pattern: dvd },
    { id: 'cradle', name: "Newton's cradle", pattern: cradle },
  ],
  shell: [
    { id: 'invader', name: 'Space invader', pattern: invader },
    { id: 'breakout', name: 'Breakout', pattern: breakout },
  ],
  read: [
    { id: 'bookworm', name: 'Bookworm', pattern: bookworm },
    { id: 'page-flip', name: 'Page flip', pattern: pageFlip },
  ],
  search: [
    { id: 'pacman', name: 'Pac-Man', pattern: pacman },
    { id: 'magnifier', name: 'Magnifying glass', pattern: magnifier },
  ],
  edit: [
    { id: 'scribble', name: 'Scribble', pattern: scribble },
    { id: 'paint-roller', name: 'Paint roller', pattern: paintRoller },
  ],
  web: [
    { id: 'satellite', name: 'Satellite', pattern: satellite },
    { id: 'spider', name: 'Spider', pattern: spider },
  ],
  agents: [
    { id: 'formation', name: 'Formation flight', pattern: formation },
    { id: 'conga', name: 'Conga line', pattern: conga },
  ],
  mcp: [
    { id: 'lightning', name: 'Lightning', pattern: lightning },
    { id: 'bricks', name: 'Toy bricks', pattern: bricks },
  ],
  compacting: [
    { id: 'tetris', name: 'Tetris', pattern: tetrisClear },
    { id: 'vacuum', name: 'Vacuum', pattern: vacuum },
  ],
}

const RARE_MOTION_ODDS = 120

const hashOf = (text: string) => Math.abs(Array.from(text).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 0))

// About one look in 120 is swapped for one of its group's rare animations; stable for one seed.
export const drawRareMotion = (group: string, seed: string): RareMotion | undefined => {
  const motions = RARE_MOTIONS[group] ?? []
  const isRare = motions.length > 0 && hashOf(`rare-motion:${seed}`) % RARE_MOTION_ODDS === 0
  return isRare ? motions[hashOf(`which-motion:${seed}`) % motions.length] : undefined
}

export const ALL_RARE_MOTIONS = Object.values(RARE_MOTIONS).flat()

export const rareMotionById = (id: string) =>
  Object.values(RARE_MOTIONS)
    .flat()
    .find(motion => motion.id === id)

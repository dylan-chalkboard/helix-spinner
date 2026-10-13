import type { HelixTapLook, HelixTaps } from '../types'
import { RARE_ODDS, SHINY_ODDS, VERB_PACKS, type VerbLuck } from './words'

// Saves from before this balance are reset to zero when read.
export const TAPS_BALANCE = 2

export const NO_TAPS: HelixTaps = { taps: 0, bestCombo: 0, earned: 0, upgrades: {}, looks: [], balance: TAPS_BALANCE }

export const DEFAULT_LOOK: HelixTapLook = { button: null, text: null }

// How long the taps of one second keep counting toward the heat.
export const HEAT_WINDOW_MS = 1000

// A combo holds while each tap follows the last within this long.
export const COMBO_GAP_MS = 600

export type Heat = 'cool' | 'warm' | 'hot' | 'frenzy'

// Taps in the last second, this one included: three warm up, five run hot, eight is a frenzy (six with Overdrive).
export const FRENZY_TAPS = 8
export const OVERDRIVE_FRENZY_TAPS = 6

export const heatOf = (recentTaps: number, frenzyAt = FRENZY_TAPS): Heat =>
  recentTaps >= frenzyAt ? 'frenzy' : recentTaps >= 5 ? 'hot' : recentTaps >= 3 ? 'warm' : 'cool'

export const HEAT_MULTIPLIERS: Record<Heat, number> = { cool: 1, warm: 2, hot: 3, frenzy: 5 }

// The button's color as the heat builds: muted, so it warms without shouting.
export const HEAT_COLORS: Record<Exclude<Heat, 'cool'>, string> = { warm: '#c9a46a', hot: '#c97f5f', frenzy: '#c4677f' }

// One run of a drawn button: its text and how it is painted.
export type ButtonPiece = { text: string; color?: string; backgroundColor?: string; dimColor?: boolean; bold?: boolean; inverse?: boolean }

// What a style is drawn from: the label (centered in seven cells), the heat's color if any, and whether it is down.
type Draw = (label: string, heat: string | undefined, isPressed: boolean) => ButtonPiece[]

const FILL = '#3f3f46'
const FILL_PRESSED = '#71717a'
const FILL_TEXT = '#a1a1aa'
const ON_HEAT = '#1c1917'

// Every style is nine cells wide, so the strip never shifts as the button changes.
export const BUTTON_WIDTH = 9
const LABEL_CELLS = 7
export const MAX_LABEL_CELLS = 5

const outlined =
  (left: string, right: string, pressedLeft = left, pressedRight = right): Draw =>
  (label, heat, isPressed) => {
    const edge = { color: heat, dimColor: heat === undefined, bold: isPressed }
    return [
      { text: isPressed ? pressedLeft : left, ...edge },
      { text: label, dimColor: !isPressed, bold: isPressed, inverse: isPressed },
      { text: isPressed ? pressedRight : right, ...edge },
    ]
  }

const filled =
  (left: string, right: string, rest = FILL): Draw =>
  (label, heat, isPressed) => {
    const fill = isPressed ? FILL_PRESSED : (heat ?? rest)
    const text = heat && !isPressed ? ON_HEAT : FILL_TEXT
    const caps = left === ' ' ? { backgroundColor: fill } : { color: fill }
    return [
      { text: left, ...caps },
      { text: label, color: text, backgroundColor: fill, bold: isPressed },
      { text: right, ...caps },
    ]
  }

// Each style is its own kind of container, bought once with sparks.
export const BUTTON_STYLES = [
  { id: 'brackets', name: 'Brackets', price: 0, draw: outlined('[', ']') },
  { id: 'block', name: 'Block', price: 100, draw: filled(' ', ' ') },
  { id: 'round', name: 'Round', price: 300, draw: outlined('(', ')', '❨', '❩') },
  { id: 'pill', name: 'Pill', price: 900, draw: filled('▐', '▌') },
  { id: 'chevrons', name: 'Chevrons', price: 2_700, draw: outlined('«', '»', '»', '«') },
  { id: 'rail', name: 'Rail', price: 8_100, draw: outlined('╺', '╸', '━', '━') },
  { id: 'keycap', name: 'Keycap', price: 25_000, draw: outlined('▕', '▏', '▐', '▌') },
  { id: 'sparkle', name: 'Sparkle', price: 75_000, draw: outlined('✧', '✧', '✦', '✦') },
  { id: 'wedge', name: 'Wedge', price: 220_000, draw: filled('◢', '◣') },
  { id: 'double', name: 'Double', price: 660_000, draw: outlined('║', '║', '┃', '┃') },
  { id: 'arrows', name: 'Arrows', price: 2_000_000, draw: outlined('▸', '◂', '›', '‹') },
  { id: 'hearts', name: 'Hearts', price: 6_000_000, draw: outlined('♡', '♡', '♥', '♥') },
  { id: 'shade', name: 'Shade', price: 18_000_000, draw: filled('▒', '▒') },
  { id: 'vault', name: 'Vault', price: 55_000_000, draw: outlined('⟦', '⟧', '⟪', '⟫') },
  { id: 'stars', name: 'Stars', price: 160_000_000, draw: outlined('⋆', '⋆', '✶', '✶') },
  { id: 'ember', name: 'Ember', price: 480_000_000, draw: filled('▐', '▌', '#5b3a3a') },
] as const

export type ButtonStyle = (typeof BUTTON_STYLES)[number]

export const styleById = (id: string | null): ButtonStyle => BUTTON_STYLES.find(style => style.id === id) ?? BUTTON_STYLES[0]

// Brackets is free; every other style is bought once with sparks in the Looks tab.
export const ownedStyles = (looks: readonly string[]) => BUTTON_STYLES.filter(style => style.price === 0 || looks.includes(style.id))

export const lookPrice = (id: string) => BUTTON_STYLES.find(style => style.id === id)?.price ?? 0

const centered = (text: string, width: number) => {
  const characters = Array.from(text).slice(0, width)
  const left = Math.floor((width - characters.length) / 2)
  return ' '.repeat(left) + characters.join('') + ' '.repeat(width - characters.length - left)
}

// `tint` paints over the heat's color: the gold of a golden tap.
export const drawButton = (look: HelixTapLook, heat: Heat, isPressed: boolean, tint?: string): ButtonPiece[] =>
  styleById(look.button).draw(centered(look.text ?? 'tap', LABEL_CELLS), tint ?? (heat === 'cool' ? undefined : HEAT_COLORS[heat]), isPressed)

// The style a step away among the owned ones, wrapping around.
export const stepStyle = (current: string | null, looks: readonly string[], step: 1 | -1) => {
  const styles = ownedStyles(looks)
  const index = Math.max(0, styles.findIndex(style => style.id === styleById(current).id))
  return styles[(index + step + styles.length) % styles.length]!
}

export type TapRequest =
  | { action: 'show' }
  | { action: 'shop' }
  | { action: 'button'; button: string }
  | { action: 'unowned'; name: string; price: number }
  | { action: 'text'; text: string | null }
  | { action: 'invalid'; reason: string }

// `/helix-tap button pill` picks a style; `/helix-tap text boop` (or `text default`) sets the label.
export const parseTapArgs = (args: string, looks: readonly string[]): TapRequest => {
  const [subject = '', ...rest] = args.trim().split(/\s+/)
  const value = rest.join(' ').replace(/^["']|["']$/g, '')
  if (subject === '' || subject === 'list') {
    return { action: 'show' }
  }
  if (subject === 'shop') {
    return { action: 'shop' }
  }
  if (subject === 'button') {
    const style = BUTTON_STYLES.find(candidate => candidate.id === value.toLowerCase())
    if (!style) {
      return { action: 'invalid', reason: `Pick a style: ${BUTTON_STYLES.map(candidate => candidate.id).join(', ')}.` }
    }
    const isOwned = ownedStyles(looks).some(owned => owned.id === style.id)
    return isOwned ? { action: 'button', button: style.id } : { action: 'unowned', name: style.name, price: style.price }
  }
  if (subject === 'text') {
    if (value.toLowerCase() === 'default' || value.toLowerCase() === 'tap') {
      return { action: 'text', text: null }
    }
    const cells = Array.from(value).length
    const isFitting = cells >= 1 && cells <= MAX_LABEL_CELLS
    return isFitting ? { action: 'text', text: value } : { action: 'invalid', reason: `The label fits 1 to ${MAX_LABEL_CELLS} characters.` }
  }
  return { action: 'invalid', reason: 'Try /helix-tap, /helix-tap shop, /helix-tap button <style>, or /helix-tap text <label|default>.' }
}

// A look saved by an earlier version (an icon, or `text:` in the button) read as today's.
export const normalizeLook = (saved: unknown): HelixTapLook => {
  const look = (typeof saved === 'object' && saved !== null ? saved : {}) as { button?: unknown; text?: unknown }
  const button = typeof look.button === 'string' && BUTTON_STYLES.some(style => style.id === look.button) ? look.button : null
  const text = typeof look.text === 'string' ? look.text : null
  return { button, text }
}

// ── The shop: sparks, and the upgrades they buy ──────────────────────────────

export type UpgradeId = 'strong' | 'steady' | 'hot' | 'golden' | 'thinking' | 'deep' | 'toolsmith' | 'chain' | 'tithe' | 'overclock' | 'crit' | 'jackpot' | 'lucky' | 'charm' | 'shinyCharm' | 'bounty' | 'packs' | 'trigger' | 'deepFocus' | 'goldenTouch' | 'overdrive' | 'marathon' | 'bigCrits' | 'completionist'

export type Upgrades = Partial<Record<UpgradeId, number>>

export type Path = 'tapper' | 'thinker' | 'luck' | 'collector'

export const PATHS: { id: Path; name: string; description: string }[] = [
  { id: 'tapper', name: '👆 Tapper', description: 'Make every tap of the button pay more.' },
  { id: 'thinker', name: '🧠 Thinker', description: 'Earn while Claude works: its time, its tools and its tokens.' },
  { id: 'luck', name: '🍀 Luck', description: 'Chances at big payouts: crits, jackpots and lucky streaks.' },
  { id: 'collector', name: '📖 Collector', description: 'Hunt rare verbs for bounties, and unlock new verb packs.' },
]

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`
const seconds = (ms: number) => `${(ms / 1000).toFixed(2).replace(/0$/, '')}s`
const minutes = (ms: number) => (ms < 60_000 ? `${ms / 1000}s` : `${ms / 60_000}m`)

// Each level of every upgrade costs 1.6 times the one before.
const COST_GROWTH = 1.6

// Income upgrades grow slower than their price, so every level pays back a little slower than the last:
// big numbers come from stacking multipliers over time, never from one upgrade compounding on itself.
const INCOME_GROWTH = 1.25

const income = (base: number, level: number) => Math.round(base * INCOME_GROWTH ** level)

// Tool chain's climb tops out at double pay per tool.
export const CHAIN_MAX_MULTIPLIER = 2

// Thinking pays for at most this much of Claude's working time in one turn, twice that with Marathon.
export const TURN_WORK_CAP_MS = 30 * 60_000
export const workCapFor = (upgrades: Upgrades) => TURN_WORK_CAP_MS * ((upgrades.marathon ?? 0) > 0 ? 2 : 1)

// Chances, windows and unlocks max out at these levels; amounts and multipliers grow forever.
export const STEADY_MAX = 10
export const GOLDEN_MAX = 10
export const CRIT_MAX = 20
export const JACKPOT_MAX = 15
export const TRIGGER_MAX = 5
export const DEEP_FOCUS_MAX = 2
export const GOLDEN_TOUCH_MAX = 3

export const tapsPerTap = (level: number) => 1 + level
export const comboGapMs = (level: number) => COMBO_GAP_MS + 140 * Math.min(level, STEADY_MAX)
export const frenzyMultiplier = (level: number) => HEAT_MULTIPLIERS.frenzy + level
export const goldenChancePerSecond = (level: number) => 0.02 * Math.min(level, GOLDEN_MAX)
export const goldenPayout = (level: number) => 9 + level
export const goldenMs = (level: number) => 1500 + 500 * Math.min(level, GOLDEN_TOUCH_MAX)
export const thinkingPer10s = (level: number) => income(1, level)
// Deep thought's two marks: 1m and 5m of work, brought in to 30s and 3m by Deep focus.
export const deepMarksMs = (focusLevel: number) => {
  const focus = Math.min(focusLevel, DEEP_FOCUS_MAX)
  return { warm: 60_000 - 15_000 * focus, deep: 300_000 - 60_000 * focus }
}
export const deepMultiplier = (level: number, workMs: number, focusLevel: number) => {
  const { warm, deep } = deepMarksMs(focusLevel)
  return workMs >= deep ? 1 + 0.5 * level : workMs >= warm ? 1 + 0.25 * level : 1
}
export const sparksPerTool = (level: number) => income(1, level)
export const chainStep = (level: number) => 0.05 * level
export const overclockMultiplier = (level: number) => 1 + 0.25 * level
export const sparksPer1kTokens = (level: number) => (level === 0 ? 0 : income(1, level))
export const critChance = (level: number) => 0.025 * Math.min(level, CRIT_MAX)
export const CRIT_MULTIPLIER = 10
export const BIG_CRIT_MULTIPLIER = 15
export const critMultiplierFor = (upgrades: Upgrades) => ((upgrades.bigCrits ?? 0) > 0 ? BIG_CRIT_MULTIPLIER : CRIT_MULTIPLIER)
export const frenzyAtFor = (upgrades: Upgrades) => ((upgrades.overdrive ?? 0) > 0 ? OVERDRIVE_FRENZY_TAPS : FRENZY_TAPS)
export const jackpotChance = (level: number) => 0.02 * Math.min(level, JACKPOT_MAX)
export const JACKPOT_MULTIPLIER = 20
export const luckyEvery = (triggerLevel: number) => 25 - 3 * Math.min(triggerLevel, TRIGGER_MAX)
export const luckyDrop = (level: number) => 10 * level

// Collector: more of the odds' slots hit, so rare and shiny verbs turn up more often.
export const rareSlots = (level: number) => 1 + level
export const shinySlots = (level: number) => 1 + 2 * level
export const rareBounty = (level: number) => (level === 0 ? 0 : income(20, level))
export const SHINY_BOUNTY_MULTIPLIER = 25
export const discoveryBounty = (level: number) => (level === 0 ? 0 : income(5, level))

const oneIn = (odds: number, slots: number) => `1 in ${Math.round(odds / slots).toLocaleString('en-US')}`

const packNames = (level: number) => VERB_PACKS.slice(0, level).map(pack => pack.name)

export const verbLuckOf = (upgrades: Upgrades): VerbLuck => ({
  rareSlots: rareSlots(upgrades.charm ?? 0),
  shinySlots: shinySlots(upgrades.shinyCharm ?? 0),
  packs: VERB_PACKS.slice(0, upgrades.packs ?? 0),
})

// What a verb sighting pays: rare and shiny ones every time, and any verb the first time it is found.
export const sightingSparks = (upgrades: Upgrades, rarity: 'common' | 'rare' | 'shiny', isNewVerb: boolean) => {
  const bounty = rareBounty(upgrades.bounty ?? 0)
  const forRarity = rarity === 'shiny' ? bounty * SHINY_BOUNTY_MULTIPLIER : rarity === 'rare' ? bounty : 0
  const completionist = (upgrades.completionist ?? 0) > 0 ? 2 : 1
  return (forRarity + (isNewVerb ? discoveryBounty(upgrades.bounty ?? 0) : 0)) * completionist
}

// A skill opens once the skill it hangs from reaches a level; roots are open from the start.
type Requirement = { id: UpgradeId; level: number }

export type Upgrade = {
  id: UpgradeId
  path: Path
  name: string
  base: number
  max?: number
  requires?: Requirement
  isCapstone?: true
  effect: (level: number) => string
}

// The skill tree, branch by branch, each skill listed after the one it hangs from.
export const UPGRADES: Upgrade[] = [
  { id: 'strong', path: 'tapper', name: 'Strong tap', base: 25, effect: level => `+${tapsPerTap(level)} per tap` },
  { id: 'hot', path: 'tapper', name: 'Hot streak', base: 60, requires: { id: 'strong', level: 3 }, effect: level => `frenzy ×${frenzyMultiplier(level)}` },
  {
    id: 'golden',
    path: 'tapper',
    name: 'Golden taps',
    base: 100,
    max: GOLDEN_MAX,
    requires: { id: 'hot', level: 5 },
    effect: level => (level === 0 ? 'none yet' : `${percent(goldenChancePerSecond(level))}/s, pays ×${goldenPayout(level)}`),
  },
  {
    id: 'goldenTouch',
    path: 'tapper',
    name: 'Golden touch',
    base: 250,
    max: GOLDEN_TOUCH_MAX,
    requires: { id: 'golden', level: 3 },
    effect: level => `golden taps last ${seconds(goldenMs(level))}`,
  },
  {
    id: 'steady',
    path: 'tapper',
    name: 'Steady hands',
    base: 40,
    max: STEADY_MAX,
    requires: { id: 'strong', level: 8 },
    effect: level => `${seconds(comboGapMs(level))} combo window`,
  },
  {
    id: 'overdrive',
    path: 'tapper',
    name: 'Overdrive',
    base: 50_000,
    max: 1,
    isCapstone: true,
    requires: { id: 'steady', level: STEADY_MAX },
    effect: level => `frenzy at ${level > 0 ? OVERDRIVE_FRENZY_TAPS : FRENZY_TAPS} taps a second`,
  },
  { id: 'thinking', path: 'thinker', name: 'Thinking pays', base: 30, effect: level => `✦ ${thinkingPer10s(level)} per 10s Claude works` },
  {
    id: 'deep',
    path: 'thinker',
    name: 'Deep thought',
    base: 80,
    requires: { id: 'thinking', level: 3 },
    effect: level => `×${deepMultiplier(level, 60_000, 0)} after 1m of work, ×${deepMultiplier(level, 300_000, 0)} after 5m`,
  },
  {
    id: 'deepFocus',
    path: 'thinker',
    name: 'Deep focus',
    base: 400,
    max: DEEP_FOCUS_MAX,
    requires: { id: 'deep', level: 5 },
    effect: level => `Deep thought kicks in at ${minutes(deepMarksMs(level).warm)} and ${minutes(deepMarksMs(level).deep)}`,
  },
  {
    id: 'overclock',
    path: 'thinker',
    name: 'Overclock',
    base: 150,
    requires: { id: 'deep', level: 8 },
    effect: level => `everything Claude earns ×${overclockMultiplier(level)}`,
  },
  {
    id: 'marathon',
    path: 'thinker',
    name: 'Marathon',
    base: 50_000,
    max: 1,
    isCapstone: true,
    requires: { id: 'overclock', level: 10 },
    effect: level => `a turn pays for up to ${minutes(level > 0 ? TURN_WORK_CAP_MS * 2 : TURN_WORK_CAP_MS)} of work`,
  },
  { id: 'toolsmith', path: 'thinker', name: 'Toolsmith', base: 40, requires: { id: 'thinking', level: 5 }, effect: level => `✦ ${sparksPerTool(level)} per tool` },
  {
    id: 'chain',
    path: 'thinker',
    name: 'Tool chain',
    base: 90,
    requires: { id: 'toolsmith', level: 5 },
    effect: level => `each tool in a turn pays +${percent(chainStep(level))} more than the last, up to ×${CHAIN_MAX_MULTIPLIER}`,
  },
  {
    id: 'tithe',
    path: 'thinker',
    name: 'Token tithe',
    base: 50,
    requires: { id: 'thinking', level: 8 },
    effect: level => `✦ ${sparksPer1kTokens(level)} per 1k tokens`,
  },
  { id: 'crit', path: 'luck', name: 'Crit taps', base: 50, max: CRIT_MAX, effect: level => `${percent(critChance(level))} for ×${CRIT_MULTIPLIER}` },
  { id: 'lucky', path: 'luck', name: 'Lucky streak', base: 70, requires: { id: 'crit', level: 3 }, effect: level => `✦ ${luckyDrop(level)} each lucky combo` },
  {
    id: 'trigger',
    path: 'luck',
    name: 'Hair trigger',
    base: 150,
    max: TRIGGER_MAX,
    requires: { id: 'lucky', level: 5 },
    effect: level => `lucky combo every ${luckyEvery(level)} taps`,
  },
  {
    id: 'jackpot',
    path: 'luck',
    name: 'Jackpot turns',
    base: 120,
    max: JACKPOT_MAX,
    requires: { id: 'crit', level: 8 },
    effect: level => `${percent(jackpotChance(level))} for ×${JACKPOT_MULTIPLIER}`,
  },
  {
    id: 'bigCrits',
    path: 'luck',
    name: 'Big crits',
    base: 50_000,
    max: 1,
    isCapstone: true,
    requires: { id: 'jackpot', level: JACKPOT_MAX },
    effect: level => `crits pay ×${level > 0 ? BIG_CRIT_MULTIPLIER : CRIT_MULTIPLIER}`,
  },
  { id: 'charm', path: 'collector', name: 'Lucky charm', base: 120, max: 14, effect: level => `rare verbs ${oneIn(RARE_ODDS, rareSlots(level))}` },
  {
    id: 'bounty',
    path: 'collector',
    name: 'Bounty hunter',
    base: 80,
    requires: { id: 'charm', level: 3 },
    effect: level => (level === 0 ? 'no bounties' : `✦ ${rareBounty(level)} a rare, ×${SHINY_BOUNTY_MULTIPLIER} a shiny, ✦ ${discoveryBounty(level)} a new verb`),
  },
  {
    id: 'shinyCharm',
    path: 'collector',
    name: 'Shiny charm',
    base: 300,
    max: 15,
    requires: { id: 'bounty', level: 5 },
    effect: level => `shiny verbs ${oneIn(SHINY_ODDS, shinySlots(level))}`,
  },
  {
    id: 'packs',
    path: 'collector',
    name: 'Verb packs',
    base: 200,
    max: VERB_PACKS.length,
    requires: { id: 'charm', level: 5 },
    effect: level => (level === 0 ? 'no packs' : `${packNames(level).at(-1)} pack (${level}/${VERB_PACKS.length})`),
  },
  {
    id: 'completionist',
    path: 'collector',
    name: 'Completionist',
    base: 50_000,
    max: 1,
    isCapstone: true,
    requires: { id: 'packs', level: VERB_PACKS.length },
    effect: level => `bounties ×${level > 0 ? 2 : 1}`,
  },
]

const upgradeOf = (id: UpgradeId) => UPGRADES.find(upgrade => upgrade.id === id)

// A skill already owned stays open, so anything bought before the tree existed is never locked away.
export const isUnlocked = (upgrades: Upgrades, id: UpgradeId) => {
  const requirement = upgradeOf(id)?.requires
  return requirement === undefined || (upgrades[id] ?? 0) > 0 || (upgrades[requirement.id] ?? 0) >= requirement.level
}

// How deep a skill sits in its branch, roots at 0, so the tree can indent it.
export const depthOf = (id: UpgradeId): number => {
  const requirement = upgradeOf(id)?.requires
  return requirement ? depthOf(requirement.id) + 1 : 0
}

// One branch laid out as a tree: each skill with the guide lines drawn before it (├─, └─, │).
export const branchRows = (path: Path) => {
  const rows: { upgrade: Upgrade; prefix: string }[] = []
  const childrenOf = (id: UpgradeId | undefined) => UPGRADES.filter(upgrade => upgrade.path === path && upgrade.requires?.id === id)
  const walk = (id: UpgradeId | undefined, indent: string) => {
    const children = childrenOf(id)
    children.forEach((upgrade, index) => {
      const isLast = index === children.length - 1
      const isRoot = id === undefined
      rows.push({ upgrade, prefix: isRoot ? '' : `${indent}${isLast ? '└─ ' : '├─ '}` })
      walk(upgrade.id, isRoot ? '' : `${indent}${isLast ? '   ' : '│  '}`)
    })
  }
  walk(undefined, '')
  return rows
}

// What a locked skill still needs, as the tree shows it.
export const requirementText = (id: UpgradeId) => {
  const requirement = upgradeOf(id)?.requires
  return requirement ? `needs ${upgradeOf(requirement.id)?.name ?? requirement.id} ${requirement.level}` : ''
}


export const upgradeMax = (id: UpgradeId) => upgradeOf(id)?.max ?? Infinity

export const upgradeCost = (id: UpgradeId, level: number) => Math.round((upgradeOf(id)?.base ?? 0) * COST_GROWTH ** level)

export const spentOn = (upgrades: Upgrades) =>
  Object.entries(upgrades).reduce((sum, [id, level = 0]) => {
    let spent = 0
    for (let owned = 0; owned < level; owned++) {
      spent += upgradeCost(id as UpgradeId, owned)
    }
    return sum + spent
  }, 0)

export const sparksOf = (totals: HelixTaps) => totals.earned - spentOn(totals.upgrades) - (totals.looks ?? []).reduce((sum, id) => sum + lookPrice(id), 0)

export const levelOfUpgrade = (totals: HelixTaps, id: UpgradeId) => totals.upgrades[id] ?? 0

// A turn's tools: each pays Toolsmith's rate, and Tool chain raises every one after the first, up to CHAIN_MAX_MULTIPLIER.
export const toolSparks = (upgrades: Upgrades, toolCount: number) => {
  const step = chainStep(upgrades.chain ?? 0)
  let multiplied = 0
  for (let index = 0; index < toolCount; index++) {
    multiplied += Math.min(1 + step * index, CHAIN_MAX_MULTIPLIER)
  }
  return sparksPerTool(upgrades.toolsmith ?? 0) * multiplied
}

// What a main turn pays when it ends: working time (capped), tokens and tools, multiplied by Deep thought and Overclock.
export const turnSparks = (upgrades: Upgrades, workMs: number, outputTokens: number, toolCount: number) => {
  const counted = Math.min(workMs, workCapFor(upgrades))
  const thinking = Math.floor(counted / 10_000) * thinkingPer10s(upgrades.thinking ?? 0)
  const tithe = Math.floor(outputTokens / 1000) * sparksPer1kTokens(upgrades.tithe ?? 0)
  const multiplier = deepMultiplier(upgrades.deep ?? 0, counted, upgrades.deepFocus ?? 0) * overclockMultiplier(upgrades.overclock ?? 0)
  return Math.floor((thinking + tithe + toolSparks(upgrades, toolCount)) * multiplier)
}

// Saved totals, from any earlier version, with every field there.
export const normalizeTaps = (saved: unknown): HelixTaps => {
  const totals = (typeof saved === 'object' && saved !== null ? saved : {}) as Partial<HelixTaps>
  if (totals.balance !== TAPS_BALANCE) {
    return NO_TAPS
  }
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  const upgrades = typeof totals.upgrades === 'object' && totals.upgrades !== null ? totals.upgrades : {}
  const looks = Array.isArray(totals.looks) ? totals.looks.filter(look => typeof look === 'string') : []
  return { taps: number(totals.taps), bestCombo: number(totals.bestCombo), earned: number(totals.earned), upgrades, looks, balance: TAPS_BALANCE }
}

// Two copies of the totals, as two windows saved them: every count only grows, so the larger of each wins.
export const mergeTaps = (a: HelixTaps, b: HelixTaps): HelixTaps => {
  const ids = new Set([...Object.keys(a.upgrades), ...Object.keys(b.upgrades)]) as Set<UpgradeId>
  const upgrades: Upgrades = {}
  for (const id of ids) {
    upgrades[id] = Math.max(a.upgrades[id] ?? 0, b.upgrades[id] ?? 0)
  }
  return {
    taps: Math.max(a.taps, b.taps),
    bestCombo: Math.max(a.bestCombo, b.bestCombo),
    earned: Math.max(a.earned, b.earned),
    upgrades,
    looks: [...new Set([...(a.looks ?? []), ...(b.looks ?? [])])],
    balance: TAPS_BALANCE,
  }
}

// What the spinner's taps add since its last post.
export type TapDelta = { taps: number; sparks: number; bestCombo: number }

export const NO_DELTA: TapDelta = { taps: 0, sparks: 0, bestCombo: 0 }

export const addDelta = (totals: HelixTaps, delta: TapDelta): HelixTaps => ({
  ...totals,
  taps: totals.taps + delta.taps,
  earned: totals.earned + delta.sparks,
  bestCombo: Math.max(totals.bestCombo, delta.bestCombo),
})

export const sumDeltas = (a: TapDelta, b: TapDelta): TapDelta => ({
  taps: a.taps + b.taps,
  sparks: a.sparks + b.sparks,
  bestCombo: Math.max(a.bestCombo, b.bestCombo),
})

export const diffDelta = (later: TapDelta, earlier: TapDelta): TapDelta => ({
  taps: later.taps - earlier.taps,
  sparks: later.sparks - earlier.sparks,
  bestCombo: later.bestCombo,
})

// What a spinner tells the hooks: everything its taps added since it appeared, and how many times its ☰ was
// clicked. Totals, not changes, so a post the next one replaces loses nothing; the hooks apply the difference.
export type TapState = { instance: string; total: TapDelta; menu: number }

export const isTapState = (data: unknown): data is { tapState: TapState } => {
  const state = typeof data === 'object' && data !== null ? (data as { tapState?: Partial<TapState> }).tapState : undefined
  return typeof state === 'object' && state !== null && typeof state.instance === 'string' && typeof state.total === 'object' && typeof state.menu === 'number'
}

// "1,284", "12.3k", "1.2m": short enough for the strip.
export const formatSparks = (sparks: number) =>
  sparks < 10_000 ? sparks.toLocaleString('en-US') : sparks < 1_000_000 ? `${(sparks / 1000).toFixed(1)}k` : `${(sparks / 1_000_000).toFixed(1)}m`

// One tap's gain in at most five cells, so the strip's gain field never overflows: 999, 1.3k, 19k, 1.3m, 25m.
export const formatGain = (gain: number) =>
  gain < 1000
    ? String(gain)
    : gain < 10_000
      ? `${(gain / 1000).toFixed(1)}k`
      : gain < 1_000_000
        ? `${Math.round(gain / 1000)}k`
        : gain < 10_000_000
          ? `${(gain / 1_000_000).toFixed(1)}m`
          : `${Math.min(9999, Math.round(gain / 1_000_000))}m`

export const GOLD = '#d4b25f'


import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { HelixAlerts, HelixDex, HelixFailure, HelixFocus, HelixProject, HelixRunningTool, HelixTapLook, HelixTaps, HelixTheme, HelixTurn } from '../types'
import { drawVerb, pickPastVerb, pickToolVerb, pickVerb, RARE_VERBS, VERB_PACKS, VERBS_BY_MODE, WACKY_VERBS } from './words'
import type { Rarity } from './words'
import { TIP_LINES } from './tips'
import type { TipLine } from './tips'
import { activeSeasons, hanukkahNight, SEASONS, seasonById } from './seasons'
import type { Season } from './seasons'
import { formatRemaining, parseFocusArgs } from './focus'
import { autoColorName, colorNames, parseColorArgs, projectColor, projectNameOf } from './project'
import { isFailedCommand } from './reactions'
import { ALL_RARE_MOTIONS, drawRareMotion, RARE_MOTIONS } from './rare-motions'
import { situationsFor } from './situations'
import { toolGroupOf } from './tools'
import {
  addDelta,
  diffDelta,
  DEFAULT_LOOK,
  drawButton,
  formatSparks,
  GOLD,
  isTapState,
  NO_DELTA,
  JACKPOT_MULTIPLIER,
  jackpotChance,
  mergeTaps,
  ownedStyles,
  lookPrice,
  isUnlocked,
  requirementText,
  branchRows,
  BUTTON_STYLES,
  NO_TAPS,
  normalizeLook,
  normalizeTaps,
  parseTapArgs,
  PATHS,
  sparksOf,
  sparksPerTool,
  stepStyle,
  styleById,
  turnSparks,
  upgradeCost,
  UPGRADES,
  upgradeMax,
  verbLuckOf,
  sightingSparks,
} from './taps'
import type { Heat, TapState, UpgradeId } from './taps'

const turn = atom({ plugin: 'helix-spinner', key: 'turn' } as const, null as HelixTurn | null)
const dex = atom({ plugin: 'helix-spinner', key: 'dex' } as const, { seen: [], shiny: [] } as HelixDex)
const agents = atom({ plugin: 'helix-spinner', key: 'agents' } as const, [] as string[])
const tools = atom({ plugin: 'helix-spinner', key: 'tools' } as const, [] as HelixRunningTool[])
// The situations whose tips have already cut in this session.
const introduced = atom({ plugin: 'helix-spinner', key: 'introduced' } as const, [] as string[])
const failure = atom({ plugin: 'helix-spinner', key: 'failure' } as const, null as HelixFailure | null)
const focus = atom({ plugin: 'helix-spinner', key: 'focus' } as const, null as HelixFocus | null)
const project = atom({ plugin: 'helix-spinner', key: 'project' } as const, null as HelixProject | null)
// Each project's chosen color by its root folder: a color's name, or 'off'.
const compacting = atom({ plugin: 'helix-spinner', key: 'compacting' } as const, false)
const projectColors = atom({ plugin: 'helix-spinner', key: 'projectColors' } as const, {} as Record<string, string>)

const alerts = atom({ plugin: 'helix-spinner', key: 'alerts' } as const, 'off' as HelixAlerts)

const tipsOn = atom({ plugin: 'helix-spinner', key: 'tipsOn' } as const, true)

const theme = atom({ plugin: 'helix-spinner', key: 'theme' } as const, 'auto' as HelixTheme)

const taps = atom({ plugin: 'helix-spinner', key: 'taps' } as const, NO_TAPS as HelixTaps)
// The last batch of taps each spinner sent, so it can tell which of its taps the totals now hold.
const tapAck = atom({ plugin: 'helix-spinner', key: 'tapAck' } as const, null as TapState | null)
const tapTab = atom({ plugin: 'helix-spinner', key: 'tapTab' } as const, 'status' as 'status' | 'shop' | 'tree')
const tapLook = atom({ plugin: 'helix-spinner', key: 'tapLook' } as const, DEFAULT_LOOK as HelixTapLook)

const DEX_STORE_KEY = 'dex'
const THEME_STORE_KEY = 'theme'
const TIPS_STORE_KEY = 'tipsOn'
const ALERTS_STORE_KEY = 'alerts'
const FOCUS_STORE_KEY = 'focus'
const PROJECT_COLORS_STORE_KEY = 'projectColors'
const TAPS_STORE_KEY = 'taps'
const TAP_LOOK_STORE_KEY = 'tapLook'
const FOCUS_CHIME = 'sounds/focus-done.wav'

const NEXT_ALERTS: Record<HelixAlerts, HelixAlerts> = { off: 'all', all: 'special', special: 'off' }
const ALERTS_LABELS: Record<HelixAlerts, string> = { all: 'All', special: 'Rare & shiny only', off: 'Off' }

const DEX_PANE = 'helix-dex'
const TAP_PANE = 'helix-tap'
const BAR_WIDTH = 16

const SECTIONS = [
  { mode: 'thinking', label: 'Thinking', color: '#a855f7' },
  { mode: 'requesting', label: 'Requesting', color: '#0ea5e9' },
  { mode: 'responding', label: 'Responding', color: '#10b981' },
  { mode: 'tool-input', label: 'Preparing a tool call', color: '#eab308' },
  { mode: 'tool-use', label: 'Running a tool', color: '#f97316' },
] as const

type Sighting = { verb: string; rarity: Rarity }

const isSighting = (data: unknown): data is Sighting =>
  typeof data === 'object' && data !== null && typeof (data as Sighting).verb === 'string'

type MotionSighting = { motion: string }

const isMotionSighting = (data: unknown): data is MotionSighting =>
  typeof data === 'object' && data !== null && typeof (data as MotionSighting).motion === 'string'

type Introduction = { introduced: string }

const isIntroduction = (data: unknown): data is Introduction =>
  typeof data === 'object' && data !== null && typeof (data as Introduction).introduced === 'string'

const bar = (found: number, total: number) => {
  const filled = total === 0 ? 0 : Math.round((found / total) * BAR_WIDTH)
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
}

const totalVerbs = WACKY_VERBS.length + RARE_VERBS.length

// The last verb sighting paid, so a repeated post of the same appearance pays once.
let lastSighting = ''

const rareMotionByIdName = (id: string) => ALL_RARE_MOTIONS.find(motion => motion.id === id)?.name

// The Dex's names for the groups the rare animations belong to.
const MOTION_GROUP_LABELS: Record<string, string> = {
  thinking: 'Thinking',
  requesting: 'Requesting',
  responding: 'Responding',
  'tool-input': 'Preparing a tool call',
  'tool-use': 'Running a tool',
  shell: 'Shell',
  read: 'Reading',
  search: 'Searching',
  edit: 'Editing',
  web: 'Web',
  agents: 'Subagents',
  mcp: 'MCP',
  compacting: 'Compacting',
}
const COLLECTIBLE = new Set([...WACKY_VERBS, ...RARE_VERBS])

// The holiday packs in play: the calendar's on auto, none when off, or the one forced.
const seasonsFor = (setting: HelixTheme, date: Date): readonly Season[] => {
  if (setting === 'off') {
    return []
  }
  const forced = seasonById(setting)
  return forced ? [forced] : activeSeasons(date)
}

const seedNumber = (seed: string) => Array.from(seed).reduce((sum, character) => sum + character.charCodeAt(0), 0)

// Every third line of the tips rotation is from the holiday pack.
const withSeasonLines = (lines: readonly TipLine[], season: Season | undefined) => {
  if (!season) {
    return lines
  }
  const seasonal = season.lines.map(text => ({ kind: season.name, text, color: season.palette[1] }))
  return lines.flatMap((line, index) => (index % 2 === 1 ? [line, seasonal[Math.floor(index / 2) % seasonal.length]!] : [line]))
}

const themeLabel = (setting: HelixTheme) =>
  setting === 'auto' ? 'auto (follows the calendar)' : setting === 'off' ? 'off' : (seasonById(setting)?.name ?? setting)

const DEMO_PANE = 'helix-demo'
const RARE_DEMO_PANE = 'helix-demo-rare'

// How each group's rare animations are drawn in the demo: the group's own mode, tool or compaction colors.
const rareDemoLook = (group: string) => {
  if (group === 'compacting') {
    return { mode: 'tool-use', tool: null, compacting: true }
  }
  const isToolGroup = !['thinking', 'requesting', 'responding', 'tool-input', 'tool-use'].includes(group)
  return isToolGroup ? { mode: 'tool-use', tool: group, compacting: false } : { mode: group, tool: null, compacting: false }
}

const DEMO_STATES = [
  { mode: 'thinking', label: 'Thinking' },
  { mode: 'requesting', label: 'Requesting' },
  { mode: 'responding', label: 'Responding' },
  { mode: 'tool-input', label: 'Preparing a tool call' },
  { mode: 'tool-use', label: 'Running a tool' },
  { mode: 'tool-use', label: 'Running a shell command', tool: 'shell' },
  { mode: 'tool-use', label: 'Reading a file', tool: 'read' },
  { mode: 'tool-use', label: 'Searching', tool: 'search' },
  { mode: 'tool-use', label: 'Editing a file', tool: 'edit' },
  { mode: 'tool-use', label: 'On the web', tool: 'web' },
  { mode: 'tool-use', label: 'Running a subagent', tool: 'agents' },
  { mode: 'tool-use', label: 'Calling an MCP tool', tool: 'mcp' },
  { mode: 'tool-use', label: 'Compacting the conversation', text: 'Compacting conversation', compacting: true },
  { mode: 'responding', label: 'Rare verb', text: RARE_VERBS[1], rarity: 'rare' },
  { mode: 'thinking', label: 'Shiny verb', rarity: 'shiny' },
  { mode: 'tool-use', label: 'Two subagents running', agents: 2 },
] as const

const demoVerb = (state: (typeof DEMO_STATES)[number]) => {
  if ('text' in state) {
    return state.text
  }
  return 'tool' in state ? pickToolVerb(state.tool, state.label) : pickVerb(state.mode, state.label)
}

// The pending end of the focus timer; a reload starts the module over and re-arms it from the store.
let focusTimer: Timer | undefined

const clearFocus = async ($: EngineInterface) => {
  focusTimer?.cancel()
  focusTimer = undefined
  await update($, focus, () => null)
  await $.store.delete(FOCUS_STORE_KEY)
}

const finishFocus = async ($: EngineInterface, finished: HelixFocus) => {
  const current = await read($, focus)
  if (current?.endsAt !== finished.endsAt) {
    return
  }
  await clearFocus($)
  $.ui.toast(`⏱ Focus done: ${finished.minutes} minutes. Take a break!`, { timeoutMs: 10_000 })
  await $.audio.play({ asset: FOCUS_CHIME }).catch(() => undefined)
}

const armFocus = async ($: EngineInterface, timer: HelixFocus) => {
  focusTimer?.cancel()
  await update($, focus, () => timer)
  const remaining = timer.endsAt - (await $.clock.now())
  if (remaining <= 0) {
    await finishFocus($, timer)
    return
  }
  focusTimer = $.clock.after(remaining, () => {
    void finishFocus($, timer)
  })
}

// One git answer, trimmed, or '' when git says no or cannot run.
const askGit = async ($: EngineInterface, cwd: string, args: string[]) =>
  $.process
    .run(['git', ...args], { cwd, timeoutMs: 5000 })
    .then(({ exitCode, stdout }) => (exitCode === 0 ? stdout.trim() : ''))
    .catch(() => '')

// The branch checked out, or `@` and the short commit when none is (a detached HEAD).
const readBranch = async ($: EngineInterface, root: string) => {
  const branch = await askGit($, root, ['symbolic-ref', '--short', '-q', 'HEAD'])
  if (branch) {
    return branch
  }
  const commit = await askGit($, root, ['rev-parse', '--short', 'HEAD'])
  return commit ? `@${commit}` : null
}

// The repo this session works in, by git's top folder, or the folder itself outside a repo.
const findProject = async ($: EngineInterface, cwd: string): Promise<HelixProject> => {
  const fromGit = await askGit($, cwd, ['rev-parse', '--show-toplevel'])
  const root = fromGit || cwd
  return { root, name: projectNameOf(root), branch: fromGit ? await readBranch($, root) : null }
}

// Branches change mid-session (a checkout, a switch), so the divider asks again now and then.
const refreshBranch = async ($: EngineInterface) => {
  const current = await read($, project)
  if (!current || current.branch === null) {
    return
  }
  const branch = await readBranch($, current.root)
  if (branch !== current.branch) {
    await update($, project, previous => (previous ? { ...previous, branch } : previous))
  }
}

// What the divider needs for the project: its name and color, or nothing when it is off.
const projectProps = async ($: EngineInterface) => {
  const current = await read($, project)
  if (!current) {
    return null
  }
  const color = projectColor(current.name, (await read($, projectColors))[current.root])
  return color ? { name: current.name, branch: current.branch, color } : null
}

// Reads the saved totals afresh and merges in this session's, so two windows never overwrite each other's taps.
const currentTaps = async ($: EngineInterface) => mergeTaps(normalizeTaps(await $.store.get(TAPS_STORE_KEY)), normalizeTaps(await read($, taps)))

const changeTaps = async ($: EngineInterface, change: (totals: HelixTaps) => HelixTaps) => {
  const before = await currentTaps($)
  const after = change(before)
  await $.store.set(TAPS_STORE_KEY, after)
  await update($, taps, () => after)
  return { before, after }
}

// One tool's run counts as work for at most this long.
const TOOL_WORK_CAP_MS = 2 * 60_000

// The Skills tab's columns: names padded to line up their levels, and effects indented under the names.
const SKILL_NAME_CELLS = 18
const SKILL_DETAIL_INDENT = 14
const STORE_RULE_CELLS = 60

const earn = async ($: EngineInterface, sparks: number) => {
  if (sparks > 0) {
    await changeTaps($, totals => ({ ...totals, earned: totals.earned + sparks }))
  }
}

const buyUpgrade = async ($: EngineInterface, id: UpgradeId) => {
  const { before, after } = await changeTaps($, totals => {
    const level = totals.upgrades[id] ?? 0
    const isAffordable = isUnlocked(totals.upgrades, id) && level < upgradeMax(id) && sparksOf(totals) >= upgradeCost(id, level)
    return isAffordable ? { ...totals, upgrades: { ...totals.upgrades, [id]: level + 1 } } : totals
  })
  const name = UPGRADES.find(upgrade => upgrade.id === id)?.name ?? id
  if (after === before && !isUnlocked(before.upgrades, id)) {
    $.ui.toast(`${name} is locked: it ${requirementText(id)}.`, { timeoutMs: 3000 })
  } else if (after === before && (before.upgrades[id] ?? 0) >= upgradeMax(id)) {
    $.ui.toast(`${name} is maxed out.`, { timeoutMs: 3000 })
  } else if (after === before) {
    const short = upgradeCost(id, before.upgrades[id] ?? 0) - sparksOf(before)
    $.ui.toast(`Not enough sparks for ${name}: ✦ ${formatSparks(short)} to go.`, { timeoutMs: 3000 })
  }
}

// Buys a button style once, then wears it.
const buyLook = async ($: EngineInterface, id: string) => {
  const price = lookPrice(id)
  const { before, after } = await changeTaps($, totals => {
    const looks = totals.looks ?? []
    const isAffordable = !looks.includes(id) && sparksOf(totals) >= price
    return isAffordable ? { ...totals, looks: [...looks, id] } : totals
  })
  if (after === before) {
    $.ui.toast(`Not enough sparks for ${styleById(id).name}: ✦ ${formatSparks(price - sparksOf(before))} to go.`, { timeoutMs: 3000 })
    return
  }
  await chooseTapLook($, { button: id })
}

const chooseTapLook = async ($: EngineInterface, change: Partial<HelixTapLook>) => {
  const next = { ...(await read($, tapLook)), ...change }
  await update($, tapLook, () => next)
  await $.store.set(TAP_LOOK_STORE_KEY, next)
}

// What the spinner needs to draw the countdown: the timer, and the hooks' own clock at drawing time.
const focusProps = async ($: EngineInterface) => {
  const timer = await read($, focus)
  return timer ? { startedAt: timer.startedAt, endsAt: timer.endsAt, sentAt: await $.clock.now() } : null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // The mod pins nothing to the status line, so clear anything an older version left there.
    $.ui.status(undefined)
    await update($, agents, () => [])
    await update($, tools, () => [])
    await update($, introduced, () => [])
    await update($, compacting, () => false)
    const saved = (await $.store.get(DEX_STORE_KEY)) as HelixDex | undefined
    if (saved) {
      await update($, dex, () => saved)
    }
    const savedAlerts = (await $.store.get(ALERTS_STORE_KEY)) as HelixAlerts | undefined
    if (savedAlerts) {
      await update($, alerts, () => savedAlerts)
    }
    const savedTipsOn = (await $.store.get(TIPS_STORE_KEY)) as boolean | undefined
    if (savedTipsOn !== undefined) {
      await update($, tipsOn, () => savedTipsOn)
    }
    const savedTheme = (await $.store.get(THEME_STORE_KEY)) as HelixTheme | undefined
    if (savedTheme) {
      await update($, theme, () => savedTheme)
    }
    const savedColors = (await $.store.get(PROJECT_COLORS_STORE_KEY)) as Record<string, string> | undefined
    if (savedColors) {
      await update($, projectColors, () => savedColors)
    }
    const savedTaps = await $.store.get(TAPS_STORE_KEY)
    if (savedTaps) {
      await update($, taps, () => normalizeTaps(savedTaps))
    }
    const savedLook = await $.store.get(TAP_LOOK_STORE_KEY)
    if (savedLook) {
      await update($, tapLook, () => normalizeLook(savedLook))
    }
    const found = await findProject($, e.cwd)
    await update($, project, () => found)
    const savedFocus = (await $.store.get(FOCUS_STORE_KEY)) as HelixFocus | undefined
    if (savedFocus) {
      await armFocus($, savedFocus)
    }
    await $.command.register({
      name: 'helix-theme',
      description: 'Holiday packs for the spinner: auto, off, or a holiday to preview (try "list")',
    })
    await $.command.register({ name: 'helix-dex', description: 'Show every spinner verb you have collected' })
    await $.command.register({ name: 'helix-demo', description: 'Show every helix spinner animation side by side (/helix-demo rare for the rare ones)' })
    await $.command.register({
      name: 'helix-color',
      description: "This project's divider color: /helix-color teal, auto, off, or list",
    })
    await $.command.register({
      name: 'helix-tap',
      description: 'Tapper menu: your level and tap button. Also /helix-tap button <style>, /helix-tap text <label>',
    })
    await $.command.register({
      name: 'helix-focus',
      description: 'Start a focus timer in the spinner divider: /helix-focus [minutes], or stop',
    })
    return next(e)
  })

  on('command.run', { command: 'helix-demo' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'rare') {
      await $.ui.open({ id: RARE_DEMO_PANE, title: 'Helix rare animations' })
      return { text: 'Rare animations demo opened. Spoilers ahead!' }
    }
    await $.ui.open({ id: DEMO_PANE, title: 'Helix spinner' })
    return { text: 'Helix spinner demo opened. /helix-demo rare shows the rare animations.' }
  })

  on('ui.render', { component: 'Pane', requestId: RARE_DEMO_PANE }, async ($, e) => {
    const isAnimatable = e.surface === 'terminal' || e.surface === 'desktop'
    if (!isAnimatable) {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>The helix animations draw in the terminal and the desktop app.</Text>
    }
    const { Box, Button, Client, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {Object.entries(RARE_MOTIONS).flatMap(([group, motions]) =>
          motions.map(motion => (
            <Box flexDirection="column" marginBottom={1}>
              <Text dimColor>
                {MOTION_GROUP_LABELS[group] ?? group} · {motion.name}
              </Text>
              <Client
                key={`rare-${motion.id}`}
                module="./helix.tsx"
                props={{
                  ...rareDemoLook(group),
                  rareMotion: motion.id,
                  text: motion.name,
                  rarity: 'common',
                  agents: 0,
                  suffix: '…',
                  startedAt: null,
                  outputTokens: 0,
                  inputTokens: 0,
                  isDemo: true,
                }}
              />
            </Box>
          )),
        )}
        <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: RARE_DEMO_PANE })} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: DEMO_PANE }, async ($, e) => {
    const isAnimatable = e.surface === 'terminal' || e.surface === 'desktop'
    if (!isAnimatable) {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>The helix animations draw in the terminal and the desktop app.</Text>
    }

    const { Box, Button, Client, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {DEMO_STATES.map(state => (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>{state.label}</Text>
            <Client
              key={`demo-${state.label}`}
              module="./helix.tsx"
              props={{
                mode: state.mode,
                tool: 'tool' in state ? state.tool : null,
                compacting: 'compacting' in state,
                text: demoVerb(state),
                rarity: 'rarity' in state ? state.rarity : 'common',
                agents: 'agents' in state ? state.agents : 0,
                suffix: '…',
                startedAt: null,
                outputTokens: 0,
                inputTokens: 0,
                isDemo: true,
              }}
            />
          </Box>
        ))}
        <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: DEMO_PANE })} />
      </Box>
    )
  })

  on('turn.start', async ($, e, next) => {
    const startedAt = await $.clock.now()
    await update($, turn, () => ({ turnId: e.turnId, startedAt, outputTokens: 0, inputTokens: 0, stepIndex: 0, tools: 0, workMs: 0 }))
    await update($, tools, () => [])
    await update($, failure, () => null)
    await refreshBranch($)
    return next(e)
  })

  // While the main conversation compacts, the spinner squeezes its dots together.
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }
    await update($, compacting, () => true)
    try {
      return await next(e)
    } finally {
      await update($, compacting, () => false)
    }
  })

  // Tracks which tools the main loop is running, so the spinner can wear the newest one's look,
  // and notes a failed shell command so the divider can flash red.
  on('tool.call', async ($, e, next) => {
    const isMainLoop = e.agentId === undefined
    if (!isMainLoop) {
      return next(e)
    }
    const group = toolGroupOf(e.tool)
    const toolStartedAt = await $.clock.now()
    const id = e.tool_use_id ?? `${e.tool}:${toolStartedAt}`
    if (group) {
      await update($, tools, running => [...running, { id, group }])
    }
    try {
      const result = await next(e)
      if (isFailedCommand(e.tool, result)) {
        await update($, failure, () => ({ id }))
      }
      if (e.tool === 'Bash') {
        await refreshBranch($)
      }
      return result
    } finally {
      if (group) {
        await update($, tools, running => running.filter(tool => tool.id !== id))
      }
      // Toolsmith: a turn's tools are paid when it ends, so Deep thought, Overclock and Jackpot multiply them.
      // A tool's time counts as work up to a cap, so a prompt left waiting or a long sleep pays nothing extra.
      const toolMs = Math.min((await $.clock.now()) - toolStartedAt, TOOL_WORK_CAP_MS)
      const current = await read($, turn)
      if (current) {
        await update($, turn, running =>
          running?.turnId === current.turnId ? { ...running, tools: (running.tools ?? 0) + 1, workMs: (running.workMs ?? 0) + toolMs } : running,
        )
      } else {
        const { upgrades } = await currentTaps($)
        await earn($, sparksPerTool(upgrades.toolsmith ?? 0))
      }
    }
  })

  on('turn.step', async function* ($, e, next) {
    const isMainLoop = e.agentId === undefined
    const agentId = e.agentId
    if (agentId !== undefined) {
      await update($, agents, running => (running.includes(agentId) ? running : [...running, agentId]))
    }
    if (isMainLoop) {
      await update($, turn, current => (current?.turnId === e.turnId ? { ...current, stepIndex: e.index } : current))
    }

    const stepStartedAt = await $.clock.now()
    const result = yield* next(e)
    const stepMs = (await $.clock.now()) - stepStartedAt
    const usage = result.usage
    if (isMainLoop) {
      const inputTokens = usage ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens : undefined
      await update($, turn, current =>
        current?.turnId === e.turnId
          ? {
              ...current,
              outputTokens: current.outputTokens + (usage?.output_tokens ?? 0),
              inputTokens: inputTokens ?? current.inputTokens,
              workMs: (current.workMs ?? 0) + stepMs,
            }
          : current,
      )
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      await update($, agents, running => running.filter(id => id !== agentId))
      return next(e)
    }
    // The main turn is done: thinking, tokens and tools settle up through Deep thought and Overclock, with a chance of a jackpot.
    const current = await read($, turn)
    if (current) {
      const { upgrades } = await currentTaps($)
      const workMs = current.workMs ?? 0
      const paid = turnSparks(upgrades, workMs, current.outputTokens, current.tools ?? 0)
      const isJackpot = paid > 0 && Math.random() < jackpotChance(upgrades.jackpot ?? 0)
      await earn($, isJackpot ? paid * JACKPOT_MULTIPLIER : paid)
      if (isJackpot && (await read($, alerts)) !== 'off') {
        $.ui.toast(`🎰 Jackpot turn! ✦ +${formatSparks(paid * JACKPOT_MULTIPLIER)}`, { timeoutMs: 6000 })
      }
    }
    return next(e)
  })

  on('command.run', { command: 'helix-focus' }, async ($, e) => {
    const running = await read($, focus)
    const now = await $.clock.now()
    const request = parseFocusArgs(e.args, running !== null)
    switch (request.action) {
      case 'status':
        return { text: `⏱ ${formatRemaining((running?.endsAt ?? now) - now)} left of ${running?.minutes} minutes. /helix-focus stop to cancel.` }
      case 'stop':
        if (!running) {
          return { text: 'No focus timer is running.' }
        }
        await clearFocus($)
        return { text: 'Focus timer stopped.' }
      case 'invalid':
        return { text: 'Try /helix-focus, /helix-focus 50 (1 to 180 minutes), or /helix-focus stop.' }
      case 'start': {
        const timer = { startedAt: now, endsAt: now + request.minutes * 60_000, minutes: request.minutes }
        await $.store.set(FOCUS_STORE_KEY, timer)
        await armFocus($, timer)
        const restarted = running ? ' (restarted)' : ''
        return { text: `⏱ Focus timer: ${request.minutes} minutes${restarted}. It fills the divider while Claude works.` }
      }
    }
  })

  on('command.run', { command: 'helix-tap' }, async ($, e) => {
    const looks = (await currentTaps($)).looks ?? []
    const choose = (change: Partial<HelixTapLook>) => chooseTapLook($, change)
    const request = parseTapArgs(e.args, looks)
    switch (request.action) {
      case 'show':
        await $.ui.open({ id: TAP_PANE, title: 'Tapper' })
        return { text: 'Tapper menu opened.' }
      case 'shop':
        await update($, tapTab, () => 'shop')
        await $.ui.open({ id: TAP_PANE, title: 'Tapper' })
        return { text: 'Tapper shop opened.' }
      case 'button':
        await choose({ button: request.button })
        return { text: `Tap button: ${styleById(request.button).name}` }
      case 'unowned':
        return { text: `${request.name} costs ✦ ${formatSparks(request.price)}. Buy it in the Looks tab of /helix-tap.` }
      case 'text':
        await choose({ text: request.text })
        return { text: `Tap button label: ${request.text ?? 'tap'}` }
      case 'invalid':
        return { text: request.reason }
    }
  })

  on('command.run', { command: 'helix-color' }, async ($, e) => {
    const current = await read($, project)
    if (!current) {
      return { text: 'No project found for this session yet.' }
    }
    const saved = (await read($, projectColors))[current.root]
    const request = parseColorArgs(e.args)
    const choose = async (setting: string | undefined) => {
      const { [current.root]: _previous, ...others } = await read($, projectColors)
      const next = setting ? { ...others, [current.root]: setting } : others
      await update($, projectColors, () => next)
      await $.store.set(PROJECT_COLORS_STORE_KEY, next)
    }
    switch (request.action) {
      case 'show': {
        const now = saved === 'off' ? 'off' : (saved ?? `${autoColorName(current.name)} (auto)`)
        return { text: `${current.name}: ${now}. Choose from ${colorNames()}, or auto, or off.` }
      }
      case 'invalid':
        return { text: `No color by that name. Choose from ${colorNames()}, or auto, or off.` }
      case 'off':
        await choose('off')
        return { text: `${current.name}: divider color and name off.` }
      case 'auto':
        await choose(undefined)
        return { text: `${current.name}: back to ${autoColorName(current.name)} (auto).` }
      case 'set':
        await choose(request.color)
        return { text: `${current.name}: ${request.color}.` }
    }
  })

  on('command.run', { command: 'helix-theme' }, async ($, e) => {
    const choice = e.args.trim().toLowerCase()
    const names = SEASONS.map(season => season.id).join(', ')
    const now = new Date(await $.clock.now())
    if (choice === '' || choice === 'list') {
      const active = activeSeasons(now).map(season => season.name)
      const today = active.length > 0 ? active.join(' and ') : 'none'
      return {
        text: `Holiday packs: ${themeLabel(await read($, theme))}. In season today: ${today}.\nUse /helix-theme auto, off, or one of: ${names}`,
      }
    }
    const match = SEASONS.find(season => season.id === choice || season.name.toLowerCase() === choice)
    const next = choice === 'auto' || choice === 'off' ? choice : match?.id
    if (!next) {
      return { text: `No holiday pack called "${choice}". Try auto, off, or one of: ${names}` }
    }
    await update($, theme, () => next)
    await $.store.set(THEME_STORE_KEY, next)
    return { text: `Holiday packs: ${themeLabel(next)}.` }
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const seasons = seasonsFor(await read($, theme), new Date(await $.clock.now()))
    const seed = `${e.requestId}:${e.props.durationMs}`
    const season = seasons[seedNumber(seed) % Math.max(1, seasons.length)]
    return next({ ...e, props: { ...e.props, word: pickPastVerb(seed, season?.verbs) } })
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const current = await read($, turn)
    const seed = current ? `${current.turnId}:${current.stepIndex}` : `${e.requestId}:${e.props.word}`
    const now = new Date(await $.clock.now())
    const seasons = seasonsFor(await read($, theme), now)
    const season = seasons[seedNumber(current?.turnId ?? seed) % Math.max(1, seasons.length)]
    const newestTool = (await read($, tools)).at(-1)
    const runningTool = e.props.mode === 'tool-use' ? newestTool : undefined
    const verbSeed = runningTool ? `${seed}:${runningTool.id}` : seed
    const luck = verbLuckOf((await currentTaps($)).upgrades)
    const { verb, rarity } = drawVerb(e.props.mode, verbSeed, season?.verbs, runningTool?.group, luck)
    const isCompacting = await read($, compacting)
    const motionGroup = isCompacting ? 'compacting' : (runningTool?.group ?? e.props.mode)
    const rareMotion = drawRareMotion(motionGroup, verbSeed)
    const isAnimatable = e.surface === 'terminal' || e.surface === 'desktop'
    if (!isAnimatable) {
      return next({ ...e, props: { ...e.props, word: verb } })
    }

    const { Client } = $.ui.resolve(e)
    const isShowingVerb = e.props.message === null
    const row = {
      mode: e.props.mode,
      tool: runningTool?.group ?? null,
      failure: await read($, failure),
      focus: await focusProps($),
      project: await projectProps($),
      compacting: isCompacting,
      rareMotion: rareMotion?.id ?? null,
      collectMotion: true,
      text: e.props.message ?? verb,
      rarity: isShowingVerb ? rarity : 'common',
      collect: isShowingVerb ? verb : null,
      agents: (await read($, agents)).length,
      suffix: e.props.message?.endsWith('…') ? '' : '…',
      startedAt: current?.startedAt ?? null,
      outputTokens: current?.outputTokens ?? 0,
      turnTools: current?.tools ?? 0,
      workMs: current?.workMs ?? 0,
      inputTokens: current?.inputTokens ?? 0,
      ...((await read($, tipsOn))
        ? {
            tips: withSeasonLines(TIP_LINES, season),
            situations: situationsFor({ tool: runningTool?.group, contextTokens: current?.inputTokens ?? 0, now }),
            introduced: await read($, introduced),
          }
        : { tips: [] }),
      ...(season && {
        palette: season.palette,
        signature: season.signature,
        night: season.id === 'hanukkah' ? (hanukkahNight(now) ?? 8) : 0,
      }),
      tipSeed: seed.length * 7 + (current?.startedAt ?? 0),
      divider: true,
      // Clicks only reach the spinner in fullscreen, so the tap strip shows only there.
      ...(e.viewport?.isFullscreen === true && {
        taps: await currentTaps($),
        tapAck: await read($, tapAck),
        tapLook: await read($, tapLook),
      }),
    }

    return <Client key="helix" module="./helix.tsx" props={row} width="100%" />
  })

  on('command.run', { command: 'helix-dex' }, async $ => {
    await $.ui.open({ id: DEX_PANE, title: 'Helix Dex' })
    return { text: 'Helix Dex opened.' }
  })

  // The live spinner's Client posts each verb it actually shows.
  on('ui.message', async ($, e, next) => {
    // A spinner's taps since it appeared, and its ☰ clicks: apply what is new since the last word from it.
    if (e.element === 'helix' && isTapState(e.data)) {
      const { tapState } = e.data
      const ack = await read($, tapAck)
      const previous = ack?.instance === tapState.instance ? ack : { total: NO_DELTA, menu: 0 }
      const fresh = diffDelta(tapState.total, previous.total)
      await update($, tapAck, () => tapState)
      if (fresh.taps > 0) {
        const { before, after } = await changeTaps($, totals => addDelta(totals, fresh))
      }
      // The ☰ (or the sparks count) at the end of the tap strip opens the shop, with no need to stop Claude.
      if (tapState.menu > previous.menu) {
        await update($, tapTab, () => 'shop')
        const opened = await $.ui.open({ id: TAP_PANE, title: 'Tapper' })
        if (!opened.isPlaced) {
          $.ui.toast('The shop needs a wider window here. Widen the terminal, or run /helix-tap shop.', { timeoutMs: 5000 })
        }
      }
      return {}
    }
    if (e.element === 'helix' && isMotionSighting(e.data)) {
      const { motion } = e.data
      const found = rareMotionByIdName(motion)
      const before = await read($, dex)
      const known = before.motions ?? []
      if (!found || known.includes(motion)) {
        return {}
      }
      const after: HelixDex = { ...before, motions: [...known, motion] }
      await update($, dex, () => after)
      await $.store.set(DEX_STORE_KEY, after)
      if ((await read($, alerts)) !== 'off') {
        $.ui.toast(`🎞 Rare animation discovered: ${found}! (${after.motions?.length}/${ALL_RARE_MOTIONS.length} in your Helix Dex)`, { timeoutMs: 6000 })
      }
      return {}
    }
    if (e.element === 'helix' && isIntroduction(e.data)) {
      const { introduced: key } = e.data
      await update($, introduced, keys => (keys.includes(key) ? keys : [...keys, key]))
      return {}
    }
    const isSpinnerSighting = e.element === 'helix' && isSighting(e.data)
    if (!isSpinnerSighting) {
      return next(e)
    }

    const { verb, rarity } = e.data as Sighting
    const before = await read($, dex)
    const isNewVerb = !before.seen.includes(verb)
    const isNewShiny = rarity === 'shiny' && !before.shiny.includes(verb)
    // Bounty hunter: the client posts a verb once as it appears, but a redraw can post the same one again.
    const sightingKey = `${verb}:${rarity}`
    const bounty = sightingKey === lastSighting ? 0 : sightingSparks((await currentTaps($)).upgrades, rarity, isNewVerb)
    lastSighting = sightingKey
    if (bounty > 0) {
      await earn($, bounty)
      if (rarity !== 'common' && (await read($, alerts)) !== 'off') {
        $.ui.toast(`🎯 Bounty: ✦ +${formatSparks(bounty)} for ${rarity === 'shiny' ? 'a shiny' : 'a rare'} ${verb}`, { timeoutMs: 4000 })
      }
    }
    if (!isNewVerb && !isNewShiny) {
      return {}
    }

    const after: HelixDex = {
      seen: isNewVerb ? [...before.seen, verb] : before.seen,
      shiny: isNewShiny ? [...before.shiny, verb] : before.shiny,
    }
    await update($, dex, () => after)
    await $.store.set(DEX_STORE_KEY, after)

    const alertLevel = await read($, alerts)
    const isSpecial = isNewShiny || rarity === 'rare'
    const isMuted = alertLevel === 'off' || (alertLevel === 'special' && !isSpecial)
    if (isMuted) {
      return {}
    }

    const count = `${after.seen.length}/${totalVerbs}`
    if (isNewShiny) {
      $.ui.toast(`✨ SHINY! A golden ${verb} appeared! (${after.shiny.length} shiny caught)`, { timeoutMs: 8000 })
    } else if (rarity === 'rare') {
      $.ui.toast(`🌟 Rare verb discovered: ${verb}! (${count} in your Helix Dex)`, { timeoutMs: 6000 })
    } else {
      $.ui.toast(`📖 New verb: ${verb} (${count} in your Helix Dex)`)
    }
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: TAP_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const progress = await currentTaps($)
    const look = await read($, tapLook)
    const tab = await read($, tapTab)
    const sparks = sparksOf(progress)
    const looks = progress.looks ?? []
    const owned = ownedStyles(looks)
    const style = styleById(look.button)
    const step = (direction: 1 | -1) => chooseTapLook($, { button: stepStyle(look.button, looks, direction).id })
    const showTab = (next: 'status' | 'shop' | 'tree') => update($, tapTab, () => next)
    const drawn = (key: string, heat: Heat, isPressed: boolean, button = look.button) =>
      drawButton({ ...look, button }, heat, isPressed).map((piece, index) => (
        <Text
          key={`${key}-${index}`}
          color={piece.color}
          backgroundColor={piece.backgroundColor}
          dimColor={piece.dimColor}
          bold={piece.bold}
          inverse={piece.inverse}
        >
          {piece.text}
        </Text>
      ))

    const header = (
      <Box flexDirection="column">
        <Text>
          <Text bold>✦ {sparks.toLocaleString('en-US')}</Text>
          <Text dimColor>
            {'  '}
            {progress.taps.toLocaleString('en-US')} taps · best combo x{progress.bestCombo} · ✦ {progress.earned.toLocaleString('en-US')} earned in all
          </Text>
        </Text>
        <Box flexDirection="row">
          <Button key="tab-shop" label="Store" hotkey="b" variant={tab === 'shop' ? 'primary' : undefined} onPress={() => showTab('shop')} />
          <Text> </Text>
          <Button key="tab-tree" label="Tree" hotkey="t" variant={tab === 'tree' ? 'primary' : undefined} onPress={() => showTab('tree')} />
          <Text> </Text>
          <Button key="tab-status" label="Looks" hotkey="s" variant={tab === 'status' ? 'primary' : undefined} onPress={() => showTab('status')} />
        </Box>
        <Text> </Text>
      </Box>
    )

    const lockedCount = UPGRADES.filter(upgrade => !isUnlocked(progress.upgrades, upgrade.id)).length
    const sectionRule = '─'.repeat(Math.max(20, Math.min(STORE_RULE_CELLS, (e.props.bodyColumns ?? STORE_RULE_CELLS) - 2)))

    if (tab === 'tree') {
      return (
        <Box flexDirection="column">
          {header}
          {PATHS.map(path => (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>{path.name}</Text>
              {branchRows(path.id).map(({ upgrade, prefix }) => {
                const level = progress.upgrades[upgrade.id] ?? 0
                const isOpen = isUnlocked(progress.upgrades, upgrade.id)
                const isMaxed = level >= upgradeMax(upgrade.id)
                const name = `${upgrade.isCapstone ? '★ ' : ''}${upgrade.name}`
                const mark = !isOpen ? '🔒' : isMaxed ? '◆' : level > 0 ? '●' : '○'
                const status = !isOpen ? requirementText(upgrade.id) : isMaxed ? 'maxed' : level > 0 ? `Lv ${level}` : 'open'
                return (
                  <Text>
                    <Text dimColor>{prefix}</Text>
                    <Text dimColor={!isOpen} bold={level > 0}>
                      {mark} {name}
                    </Text>
                    <Text dimColor> {status}</Text>
                  </Text>
                )
              })}
            </Box>
          ))}
          <Text dimColor>● owned · ○ open to buy · ◆ maxed · 🔒 locked · ★ ends a branch. Buy skills in the Skills tab.</Text>
          <Text> </Text>
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: TAP_PANE })} />
        </Box>
      )
    }

    if (tab === 'shop') {
      return (
        <Box flexDirection="column">
          {header}
          <Box borderStyle="round" borderDimColor flexDirection="column" alignItems="center" width={sectionRule.length}>
            <Text bold>✦ STORE ✦</Text>
            <Text bold color={GOLD}>
              {`✦ ${sparks.toLocaleString('en-US')} to spend`}
            </Text>
          </Box>
          <Text> </Text>
          {PATHS.map(path => (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>{path.name}</Text>
              <Text dimColor>{path.description}</Text>
              <Text dimColor>{sectionRule}</Text>
              {UPGRADES.filter(upgrade => upgrade.path === path.id && isUnlocked(progress.upgrades, upgrade.id)).map(upgrade => {
                const level = progress.upgrades[upgrade.id] ?? 0
                const cost = upgradeCost(upgrade.id, level)
                const isMaxed = level >= upgradeMax(upgrade.id)
                const isAffordable = !isMaxed && sparks >= cost
                const name = `${upgrade.isCapstone ? '★ ' : ''}${upgrade.name}`
                const effect = isMaxed ? upgrade.effect(level) : `${upgrade.effect(level)} → ${upgrade.effect(level + 1)}`
                // Two lines a skill: the price, name and level, then what the next level does, under the name.
                return (
                  <Box flexDirection="column">
                    <Box flexDirection="row">
                      <Button
                        key={`buy-${upgrade.id}`}
                        label={(isMaxed ? '★ MAX' : `✦ ${formatSparks(cost)}`).padEnd(9)}
                        dimColor={!isAffordable}
                        onPress={() => buyUpgrade($, upgrade.id)}
                      />
                      <Text bold={level > 0}> {name.padEnd(SKILL_NAME_CELLS)}</Text>
                      <Text dimColor>Lv {level}</Text>
                    </Box>
                    <Box paddingLeft={SKILL_DETAIL_INDENT}>
                      <Text dimColor>{effect}</Text>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          ))}
          <Text dimColor>Sparks come from taps, and from Claude working: ✦ 1 every 10 seconds and ✦ 1 per tool, paid when the turn ends.</Text>
          <Text dimColor>
            {lockedCount > 0 ? `${lockedCount} more skills open as you level these up. See the Tree tab for the map.` : 'Every skill in the store is open.'}
          </Text>
          <Text> </Text>
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: TAP_PANE })} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {header}
        <Box flexDirection="row">
          <Button key="style-prev" label="‹" hotkey="p" dimColor onPress={() => step(-1)} />
          <Text> </Text>
          {drawn('rest', 'cool', false)}
          <Text> </Text>
          <Button key="style-next" label="›" hotkey="n" dimColor onPress={() => step(1)} />
          <Text>
            {'  '}
            <Text bold>{style.name}</Text>
            <Text dimColor>
              {' '}
              {owned.findIndex(candidate => candidate.id === style.id) + 1} of {owned.length} owned
            </Text>
          </Text>
        </Box>
        <Text> </Text>
        <Text dimColor>pressed and tapping fast:</Text>
        <Box flexDirection="row">
          {drawn('pressed', 'cool', true)}
          <Text> </Text>
          {drawn('warm', 'warm', false)}
          <Text> </Text>
          {drawn('hot', 'hot', false)}
          <Text> </Text>
          {drawn('frenzy', 'frenzy', false)}
        </Box>
        <Text> </Text>
        {BUTTON_STYLES.map(candidate => {
          const isOwned = owned.some(one => one.id === candidate.id)
          const isWorn = candidate.id === style.id
          const label = isWorn ? 'wearing' : isOwned ? 'wear' : `✦ ${formatSparks(candidate.price)}`
          return (
            <Box flexDirection="row">
              <Button
                key={`look-${candidate.id}`}
                label={label.padEnd(9)}
                dimColor={isWorn || (!isOwned && sparks < candidate.price)}
                onPress={() => (isOwned ? chooseTapLook($, { button: candidate.id }) : buyLook($, candidate.id))}
              />
              <Text> </Text>
              {drawn(`preview-${candidate.id}`, 'cool', false, candidate.id)}
              <Text dimColor={!isOwned}> {candidate.name}</Text>
            </Box>
          )
        })}
        <Text> </Text>
        <Text dimColor>Label: {look.text ?? 'tap'} · change it with /helix-tap text boop</Text>
        <Text> </Text>
        <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: TAP_PANE })} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: DEX_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const collection = await read($, dex)
    const seen = new Set(collection.seen)
    const motionsFound = new Set(collection.motions ?? [])
    const rareFound = RARE_VERBS.filter(verb => seen.has(verb))
    const collectibleFound = collection.seen.filter(verb => COLLECTIBLE.has(verb)).length
    const inSeason = new Set(seasonsFor(await read($, theme), new Date(await $.clock.now())).map(season => season.id))
    const limited = SEASONS.map(season => ({ season, found: season.verbs.filter(verb => seen.has(verb)) }))
    const limitedFound = limited.reduce((sum, { found }) => sum + found.length, 0)
    const limitedShown = limited.filter(({ season, found }) => found.length > 0 || inSeason.has(season.id))
    const alertLevel = await read($, alerts)
    const cycleAlerts = async () => {
      await update($, alerts, level => NEXT_ALERTS[level])
      await $.store.set(ALERTS_STORE_KEY, await read($, alerts))
    }
    const tapper = await currentTaps($)
    const isShowingTips = await read($, tipsOn)
    const toggleTips = async () => {
      await update($, tipsOn, isOn => !isOn)
      await $.store.set(TIPS_STORE_KEY, await read($, tipsOn))
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text dimColor>New-verb alerts: </Text>
          <Button key="alerts" label={ALERTS_LABELS[alertLevel]} hotkey="a" onPress={cycleAlerts} />
        </Box>
        <Box flexDirection="row">
          <Text dimColor>Tips, facts & reminders: </Text>
          <Button key="tips" label={isShowingTips ? 'On' : 'Off'} hotkey="t" onPress={toggleTips} />
        </Box>
        <Text> </Text>
        <Text bold>
          {collectibleFound}/{totalVerbs} found · {rareFound.length}/{RARE_VERBS.length} rare · {collection.shiny.length} shiny · {limitedFound} limited · {motionsFound.size}/{ALL_RARE_MOTIONS.length} animations
        </Text>
        <Text>
          <Text bold>Tapper</Text>
          <Text dimColor>
            {' '}
            · {Object.values(tapper.upgrades).reduce<number>((sum, level) => sum + (level ?? 0), 0)} skill levels · {tapper.taps.toLocaleString('en-US')} taps · best combo x{tapper.bestCombo} · ✦ {sparksOf(tapper).toLocaleString('en-US')}
          </Text>
        </Text>
        <Text> </Text>
        {SECTIONS.map(({ mode, label, color }) => {
          const verbs = VERBS_BY_MODE[mode] ?? []
          const found = verbs.filter(verb => seen.has(verb))
          return (
            <Box flexDirection="column" marginBottom={1}>
              <Text>
                <Text color={color} bold>
                  {label}
                </Text>
                <Text dimColor>
                  {' '}
                  {bar(found.length, verbs.length)} {found.length}/{verbs.length}
                </Text>
              </Text>
              <Text color={color}>{found.length > 0 ? found.join(', ') : 'Nothing yet'}</Text>
            </Box>
          )
        })}
        <Box flexDirection="column" marginBottom={1}>
          <Text>
            <Text color="#e879f9" bold>
              🌟 Rare
            </Text>
            <Text dimColor>
              {' '}
              {bar(rareFound.length, RARE_VERBS.length)} {rareFound.length}/{RARE_VERBS.length}
            </Text>
          </Text>
          <Text color="#e879f9">
            {[...rareFound, ...Array.from({ length: RARE_VERBS.length - rareFound.length }, () => '???')].join(', ')}
          </Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text color="#38bdf8" bold>
            🎁 Verb packs
          </Text>
          {VERB_PACKS.map((pack, index) => {
            const isUnlocked = index < (tapper.upgrades.packs ?? 0)
            const found = pack.verbs.filter(verb => seen.has(verb))
            return isUnlocked ? (
              <Text>
                <Text color="#38bdf8">{pack.name}</Text>
                <Text dimColor>
                  {' '}
                  {bar(found.length, pack.verbs.length)} {found.length}/{pack.verbs.length}
                </Text>
                <Text color="#38bdf8"> {found.length > 0 ? found.join(', ') : 'Nothing yet'}</Text>
              </Text>
            ) : (
              <Text dimColor>🔒 {pack.name}: unlock it in the /helix-tap shop</Text>
            )
          })}
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text color="#facc15" bold>
            ✨ Shiny
          </Text>
          <Text color="#facc15">
            {collection.shiny.length > 0 ? collection.shiny.join(', ') : 'None yet. Any verb can turn up golden, about 1 in 1,000.'}
          </Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text>
            <Text color="#38bdf8" bold>
              🎞 Rare animations
            </Text>
            <Text dimColor>
              {' '}
              {bar(motionsFound.size, ALL_RARE_MOTIONS.length)} {motionsFound.size}/{ALL_RARE_MOTIONS.length}
            </Text>
          </Text>
          {Object.entries(RARE_MOTIONS).map(([group, motions]) => (
            <Text>
              <Text dimColor>{MOTION_GROUP_LABELS[group] ?? group}: </Text>
              <Text color="#38bdf8">{motions.map(motion => (motionsFound.has(motion.id) ? motion.name : '???')).join(', ')}</Text>
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text color="#fb923c" bold>
            Limited edition
          </Text>
          {limitedShown.length === 0 && (
            <Text dimColor>Holiday verbs appear during their season. Next up, check /helix-theme list.</Text>
          )}
          {limitedShown.map(({ season, found }) => (
            <Text>
              <Text color={season.palette[1]}>{season.name}</Text>
              <Text dimColor>
                {' '}
                {found.length}/{season.verbs.length}
                {inSeason.has(season.id) ? ' (in season now)' : ''}
                {found.length > 0 ? `: ${found.join(', ')}` : ''}
              </Text>
            </Text>
          ))}
        </Box>
        <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: DEX_PANE })} />
      </Box>
    )
  })
}

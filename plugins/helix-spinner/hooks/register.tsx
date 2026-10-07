import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { HelixAlerts, HelixDex, HelixFailure, HelixFocus, HelixProject, HelixRunningTool, HelixTheme, HelixTurn } from '../types'
import { drawVerb, pickPastVerb, pickToolVerb, pickVerb, RARE_VERBS, VERBS_BY_MODE, WACKY_VERBS } from './words'
import type { Rarity } from './words'
import { TIP_LINES } from './tips'
import type { TipLine } from './tips'
import { activeSeasons, hanukkahNight, SEASONS, seasonById } from './seasons'
import type { Season } from './seasons'
import { formatRemaining, parseFocusArgs } from './focus'
import { autoColorName, colorNames, parseColorArgs, projectColor, projectNameOf } from './project'
import { isFailedCommand } from './reactions'
import { situationsFor } from './situations'
import { toolGroupOf } from './tools'

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

const DEX_STORE_KEY = 'dex'
const THEME_STORE_KEY = 'theme'
const TIPS_STORE_KEY = 'tipsOn'
const ALERTS_STORE_KEY = 'alerts'
const FOCUS_STORE_KEY = 'focus'
const PROJECT_COLORS_STORE_KEY = 'projectColors'
const FOCUS_CHIME = 'sounds/focus-done.wav'

const NEXT_ALERTS: Record<HelixAlerts, HelixAlerts> = { off: 'all', all: 'special', special: 'off' }
const ALERTS_LABELS: Record<HelixAlerts, string> = { all: 'All', special: 'Rare & shiny only', off: 'Off' }

const DEX_PANE = 'helix-dex'
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

type Introduction = { introduced: string }

const isIntroduction = (data: unknown): data is Introduction =>
  typeof data === 'object' && data !== null && typeof (data as Introduction).introduced === 'string'

const bar = (found: number, total: number) => {
  const filled = total === 0 ? 0 : Math.round((found / total) * BAR_WIDTH)
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
}

const totalVerbs = WACKY_VERBS.length + RARE_VERBS.length
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
    await $.command.register({ name: 'helix-demo', description: 'Show every helix spinner animation side by side' })
    await $.command.register({
      name: 'helix-color',
      description: "This project's divider color: /helix-color teal, auto, off, or list",
    })
    await $.command.register({
      name: 'helix-focus',
      description: 'Start a focus timer in the spinner divider: /helix-focus [minutes], or stop',
    })
    return next(e)
  })

  on('command.run', { command: 'helix-demo' }, async $ => {
    await $.ui.open({ id: DEMO_PANE, title: 'Helix spinner' })
    return { text: 'Helix spinner demo opened.' }
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
    await update($, turn, () => ({ turnId: e.turnId, startedAt, outputTokens: 0, inputTokens: 0, stepIndex: 0 }))
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
    const id = e.tool_use_id ?? `${e.tool}:${await $.clock.now()}`
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

    const result = yield* next(e)
    const usage = result.usage
    if (isMainLoop && usage) {
      const inputTokens = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      await update($, turn, current =>
        current?.turnId === e.turnId
          ? { ...current, outputTokens: current.outputTokens + usage.output_tokens, inputTokens }
          : current,
      )
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      await update($, agents, running => running.filter(id => id !== agentId))
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
    const { verb, rarity } = drawVerb(e.props.mode, verbSeed, season?.verbs, runningTool?.group)
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
      compacting: await read($, compacting),
      text: e.props.message ?? verb,
      rarity: isShowingVerb ? rarity : 'common',
      collect: isShowingVerb ? verb : null,
      agents: (await read($, agents)).length,
      suffix: e.props.message?.endsWith('…') ? '' : '…',
      startedAt: current?.startedAt ?? null,
      outputTokens: current?.outputTokens ?? 0,
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
    }

    return <Client key="helix" module="./helix.tsx" props={row} width="100%" />
  })

  on('command.run', { command: 'helix-dex' }, async $ => {
    await $.ui.open({ id: DEX_PANE, title: 'Helix Dex' })
    return { text: 'Helix Dex opened.' }
  })

  // The live spinner's Client posts each verb it actually shows.
  on('ui.message', async ($, e, next) => {
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

  on('ui.render', { component: 'Pane', requestId: DEX_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const collection = await read($, dex)
    const seen = new Set(collection.seen)
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
          {collectibleFound}/{totalVerbs} found · {rareFound.length}/{RARE_VERBS.length} rare · {collection.shiny.length} shiny · {limitedFound} limited
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
          <Text color="#facc15" bold>
            ✨ Shiny
          </Text>
          <Text color="#facc15">
            {collection.shiny.length > 0 ? collection.shiny.join(', ') : 'None yet. Any verb can turn up golden, about 1 in 1,000.'}
          </Text>
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

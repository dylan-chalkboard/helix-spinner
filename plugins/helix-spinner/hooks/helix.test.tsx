import { describe, expect, mock, test } from 'claude-code/testing'

import { dividerCells, dividerLine } from './helix'
import { activeSeasons, easterOf, hanukkahNight, SEASONS, thanksgivingOf } from './seasons'
import { DOT_COLUMNS, DOT_ROWS } from './grid'
import { focusLine, formatRemaining, parseFocusArgs } from './focus'
import { autoColorName, parseColorArgs, PROJECT_COLORS, projectColor, projectNameOf, shortBranch, withProjectName } from './project'
import { isFailedCommand } from './reactions'
import { LONG_TURN_MS, situationsFor } from './situations'
import { activeSituations, firstUnintroduced, tipAt } from './tip-rotation'
import { ALL_RARE_MOTIONS, drawRareMotion, RARE_MOTIONS } from './rare-motions'
import { COMPACT_MOTION, TOOL_MOTIONS } from './tool-motions'
import { toolGroupOf } from './tools'
import {
  branchRows,
  BUTTON_STYLES,
  BUTTON_WIDTH,
  comboGapMs,
  critChance,
  critMultiplierFor,
  depthOf,
  drawButton,
  formatGain,
  frenzyAtFor,
  HEAT_COLORS,
  heatOf,
  isUnlocked,
  mergeTaps,
  NO_TAPS,
  normalizeLook,
  normalizeTaps,
  parseTapArgs,
  requirementText,
  sightingSparks,
  sparksOf,
  spentOn,
  stepStyle,
  turnSparks,
  upgradeCost,
  upgradeMax,
  UPGRADES,
  verbLuckOf,
} from './taps'
import type { Heat } from './taps'
import { drawVerb, RARE_VERBS, TOOL_VERBS, toPastTense, VERB_PACKS, VERBS_BY_MODE, WACKY_VERBS } from './words'

// A day with no holiday pack in season.
const QUIET_DAY = new Date(2026, 7, 15).getTime()

const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } as const

const rowText = async (ui: { findAll: (q: { type: string; in: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text', in: 'helix' }))
    .map(t => t.text ?? '')
    .join('')
    .replace(/^\s*[─━]+/, '')

describe('helix spinner', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`draws one animated row with a wacky verb on ${surface}`, async ($, on) => {
      mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
      const ui = await $.ui.mount({ plugin: 'helix-spinner', surface, component: 'Spinner', props: SPINNER })

      const firstFrame = await rowText(ui)
      const verbs = WACKY_VERBS.map(v => v.replace(/[-]/g, '\\-')).join('|')
      expect(firstFrame).toMatch(new RegExp(`^[\\u2800-\\u28ff]{12} (${verbs})… \\(\\d+s\\)(  ⎿  (Tip|Fun fact|Tech history|Reminder): .+  next ›)?$`))
      expect(firstFrame).not.toContain('Sauteing')

      await ui.advance(400)
      expect(await rowText(ui)).not.toBe(firstFrame)

      await ui.redraw({ ...SPINNER, mode: 'tool-use' })
      const toolVerbs = (VERBS_BY_MODE['tool-use'] ?? []).map(v => v.replace(/[-]/g, '\\-')).join('|')
      expect(await rowText(ui)).toMatch(new RegExp(` (${toolVerbs})… `))

      await ui.redraw({ ...SPINNER, message: 'Compacting conversation…', mode: 'tool-use' })
      expect(await rowText(ui)).toContain('Compacting conversation… (')
      await ui.unmount()
    })
  }

  test('each state draws its own animation', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const modes = ['thinking', 'requesting', 'responding', 'tool-input', 'tool-use'] as const
    const frames = new Set<string>()
    for (const mode of modes) {
      const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: { ...SPINNER, mode } })
      await ui.advance(400)
      frames.add((await rowText(ui)).slice(0, 12))
      await ui.unmount()
    }
    expect(frames.size).toBe(modes.length)
  })

  test('the demo pane shows every animation', async ($, on) => {
    mock.clock(on, { now: QUIET_DAY })
    const ui = await $.ui.mount({
      plugin: 'helix-spinner',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'helix-demo',
      props: { bodyColumns: 60, bodyRows: 20 } as never,
    })
    const labels = [
      'Thinking', 'Requesting', 'Responding', 'Preparing a tool call', 'Running a tool', 'Running a shell command',
      'Reading a file', 'Searching', 'Editing a file', 'On the web', 'Running a subagent', 'Calling an MCP tool',
      'Compacting the conversation',
    ]
    for (const label of labels) {
      expect(await ui.find({ key: `demo-${label}` })).toBeDefined()
    }
    await ui.unmount()
  })

  test('each tool group draws its own moving animation', () => {
    const frameAt = (group: keyof typeof TOOL_MOTIONS, t: number) =>
      Array.from({ length: DOT_ROWS }, (_, y) =>
        Array.from({ length: DOT_COLUMNS }, (_, x) => (TOOL_MOTIONS[group].pattern.isLit(x, y, t) ? '#' : '.')).join(''),
      ).join('/')
    const groups = Object.keys(TOOL_MOTIONS) as (keyof typeof TOOL_MOTIONS)[]
    const timeline = (group: keyof typeof TOOL_MOTIONS) => [1, 2.5, 4, 6.5].map(t => frameAt(group, t)).join('|')
    for (const group of groups) {
      expect(timeline(group)).toContain('#')
      expect(new Set([1, 2.5, 4, 6.5].map(t => frameAt(group, t))).size).toBeGreaterThan(1)
    }
    expect(new Set(groups.map(timeline)).size).toBe(groups.length)
  })

  test('while a tool runs the spinner wears its look, then goes back', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    let finish = () => {}
    const finished = new Promise<void>(resolve => {
      finish = resolve
    })
    on('tool.call', async () => {
      await finished
      return { result: 'done' } as never
    })
    const props = { ...SPINNER, mode: 'tool-use' } as const
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props })
    const pattern = (verbs: readonly string[]) => new RegExp(` (${verbs.map(v => v.replace(/[-]/g, '\\-')).join('|')})… `)

    const call = $.tool.call({ tool: 'Grep', pattern: 'helix' } as never)
    await ui.advance(100)
    await ui.redraw(props)
    expect(await rowText(ui)).toMatch(pattern(TOOL_VERBS.search))

    finish()
    await call
    await ui.redraw(props)
    expect(await rowText(ui)).toMatch(pattern(VERBS_BY_MODE['tool-use'] ?? []))
    await ui.unmount()
  })

  // Before the tool starts, the tip line is skipped 0 or 1 times, so the rotation alone
  // would land on a regular line in one of the two runs: only the cut-in shows the tool tip in both.
  for (const skips of [0, 1]) {
    test(`a running tool cuts in with a tip about it (${skips} skip${skips === 1 ? '' : 's'} before)`, async ($, on) => {
      mock.store(on)
      mock.clock(on, { now: new Date(2026, 7, 15, 12).getTime() })
      let finish = () => {}
      const finished = new Promise<void>(resolve => {
        finish = resolve
      })
      on('tool.call', async () => {
        await finished
        return { result: 'done' } as never
      })
      const props = { ...SPINNER, mode: 'tool-use' } as const
      const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props })
      for (let skip = 0; skip < skips; skip++) {
        await ui.pointer({ type: 'down', x: 4, y: 3, button: 'left' })
      }

      const call = $.tool.call({ tool: 'Grep', pattern: 'helix' } as never)
      await ui.advance(100)
      await ui.redraw(props)
      await ui.advance(100)
      expect(await rowText(ui)).toContain('Tip: Know where something lives?')

      finish()
      await call
      await ui.unmount()
    })
  }

  const redDivider = async (ui: { findAll: (q: { type: string; in: string }) => Promise<readonly { text: string; props: Record<string, unknown> }[]> }) =>
    (await ui.findAll({ type: 'Text', in: 'helix' })).some(t => t.props.color === '#ef4444' && /^[─━]+$/.test(t.text))

  type TestBody = Extract<Parameters<typeof test>[1], (...args: never) => unknown>

  const afterCommand = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], call: object, answer: object) => {
    mock.store(on)
    mock.clock(on, { now: new Date(2026, 7, 15, 12).getTime() })
    on('tool.call', async () => answer as never)
    const props = { ...SPINNER, mode: 'responding' } as const
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props })
    await $.tool.call(call as never)
    await ui.redraw(props)
    await ui.advance(100)
    return { ui, props }
  }

  test('a failed shell command turns the divider red for a moment', async ($, on) => {
    const { ui } = await afterCommand($, on, { tool: 'Bash', command: 'npm test' }, { result: 'boom', text: 'boom', isError: true })
    expect(await redDivider(ui)).toBe(true)
    expect(await rowText(ui)).toMatch(/^[\u2800-\u28ff]{12} /)
    await ui.advance(2500)
    expect(await redDivider(ui)).toBe(false)
    await ui.unmount()
  })

  test('a passing command or another failed tool leaves the divider alone', async ($, on) => {
    const passing = await afterCommand($, on, { tool: 'Bash', command: 'npm test' }, { result: { stdout: 'ok', stderr: '' }, text: 'ok' })
    expect(await redDivider(passing.ui)).toBe(false)
    await passing.ui.unmount()
    expect(isFailedCommand('Read', { isError: true })).toBe(false)
    expect(isFailedCommand('Bash', { deny: 'not allowed' })).toBe(false)
    expect(isFailedCommand('Bash', { isError: true })).toBe(true)
  })

  const NOON = new Date(2026, 7, 15, 12).getTime()

  const listenForDone = (on: Parameters<TestBody>[1]) => {
    const toasts: string[] = []
    const sounds: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return {} as never
    })
    on('audio.play', (_$, e) => {
      sounds.push(e.clip.asset ?? '')
      return {} as never
    })
    return { toasts, sounds }
  }

  const focusCommand = async ($: Parameters<TestBody>[0], args: string) =>
    ((await $.command.run({ command: 'helix-focus', args } as never)) as { text?: string }).text ?? ''

  test('focus commands parse and the countdown reads well', () => {
    expect(parseFocusArgs('', false)).toEqual({ action: 'start', minutes: 25 })
    expect(parseFocusArgs('', true)).toEqual({ action: 'status' })
    expect(parseFocusArgs(' 50 ', false)).toEqual({ action: 'start', minutes: 50 })
    expect(parseFocusArgs('stop', true)).toEqual({ action: 'stop' })
    for (const bad of ['0', '181', '2.5', 'soon']) {
      expect(parseFocusArgs(bad, false)).toEqual({ action: 'invalid' })
    }
    expect(formatRemaining(14 * 60_000 + 32_000)).toBe('14:32')
    expect(formatRemaining(65 * 60_000)).toBe('1:05:00')
    const half = focusLine(40, 0.5, 10 * 60_000)
    expect(half.length).toBe(40)
    expect(half.endsWith(' ⏱ 10:00')).toBe(true)
    expect((half.match(/━/g) ?? []).length).toBe(16)
  })

  test('a focus timer counts down, then toasts and chimes', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: NOON })
    const { toasts, sounds } = listenForDone(on)

    expect(await focusCommand($, '2')).toContain('2 minutes')
    expect(await focusCommand($, '')).toContain('2:00 left')

    await clock.advance(60_000)
    expect(toasts).toEqual([])
    await clock.advance(61_000)
    expect(toasts).toEqual(['⏱ Focus done: 2 minutes. Take a break!'])
    expect(sounds).toEqual(['sounds/focus-done.wav'])
    expect(await focusCommand($, 'stop')).toBe('No focus timer is running.')
  })

  test('a stopped focus timer never goes off', async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: NOON })
    const { toasts } = listenForDone(on)
    await focusCommand($, '1')
    expect(await focusCommand($, 'stop')).toBe('Focus timer stopped.')
    await clock.advance(120_000)
    expect(toasts).toEqual([])
  })

  test('the divider fills with the focus countdown while Claude works', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: NOON })
    await focusCommand($, '25')
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    await ui.resize({ columns: 60, rows: 4 })
    const texts = (await ui.findAll({ type: 'Text', in: 'helix' })).map(t => t.text).join('')
    expect(texts).toMatch(/─+ ⏱ (25:00|24:5\d)/)
    await ui.unmount()
  })

  const reload = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) => {
    on('session.start', (_$, e) => e as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('ui.status', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
  }

  test('a focus timer picks up again after a reload', async ($, on) => {
    mock.store(on, { focus: { startedAt: NOON - 60_000, endsAt: NOON + 60_000, minutes: 2 } })
    const clock = mock.clock(on, { now: NOON })
    const { toasts } = listenForDone(on)
    await reload($, on)
    expect(toasts).toEqual([])
    await clock.advance(61_000)
    expect(toasts).toEqual(['⏱ Focus done: 2 minutes. Take a break!'])
  })

  test('a focus timer that ran out while Claude Code was closed goes off on the next start', async ($, on) => {
    mock.store(on, { focus: { startedAt: NOON - 600_000, endsAt: NOON - 300_000, minutes: 5 } })
    mock.clock(on, { now: NOON })
    const { toasts } = listenForDone(on)
    await reload($, on)
    expect(toasts).toEqual(['⏱ Focus done: 5 minutes. Take a break!'])
  })

  const REPO = '/Users/someone/projects/chalkboardHQ'

  // A fake git: the repo's top folder, and whatever `git.branch` (or, when null, `git.commit`) says is checked out.
  const reloadInRepo = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], git = { branch: 'main' as string | null, commit: 'a1b2c3d' }) => {
    const answer = (exitCode: number, stdout = '') => ({ value: { exitCode, stdout: `${stdout}\n`, stderr: '' } }) as never
    on('process.run', (_$, e) => {
      const command = e.argv.slice(1).join(' ')
      if (command === 'rev-parse --show-toplevel') {
        return answer(0, REPO)
      }
      if (command === 'symbolic-ref --short -q HEAD') {
        return git.branch ? answer(0, git.branch) : answer(1)
      }
      return command === 'rev-parse --short HEAD' ? answer(0, git.commit) : answer(128)
    })
    await reload($, on)
    return git
  }

  const dividerTexts = async (ui: { findAll: (q: { type: string; in: string }) => Promise<readonly { text: string; props: Record<string, unknown> }[]> }) =>
    (await ui.findAll({ type: 'Text', in: 'helix' })).filter(t => /[─━]/.test(t.text) && !/[\u2800-\u28ff]/.test(t.text))

  test('each project gets a steady color of its own', () => {
    expect(autoColorName('chalkboardHQ')).toBe(autoColorName('chalkboardHQ'))
    expect(Object.keys(PROJECT_COLORS)).toContain(autoColorName('helix-spinner'))
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(autoColorName)).size).toBeGreaterThan(2)
    expect(projectColor('anything', 'off')).toBeNull()
    expect(projectColor('anything', 'violet')).toBe(PROJECT_COLORS.violet)
    expect(projectColor('anything', 'lavender')).toBe(PROJECT_COLORS.lavender)
    expect(parseColorArgs('white')).toEqual({ action: 'set', color: 'white' })
    const autoPicks = new Set(Array.from({ length: 200 }, (_, index) => autoColorName(`project-${index}`)))
    expect([...autoPicks].sort()).toEqual(['amber', 'emerald', 'indigo', 'lime', 'orange', 'pink', 'rose', 'sky', 'teal', 'violet'])
    expect(autoColorName('chalkboardHQ')).toBe('teal')
    expect(projectColor('anything', 'not-a-color')).toBe(PROJECT_COLORS[autoColorName('anything')])
    expect(projectNameOf('/Users/someone/projects/chalkboardHQ/')).toBe('chalkboardHQ')
    expect(parseColorArgs(' Teal ')).toEqual({ action: 'set', color: 'teal' })
    expect(parseColorArgs('')).toEqual({ action: 'show' })
    expect(parseColorArgs('off')).toEqual({ action: 'off' })
    expect(parseColorArgs('red')).toEqual({ action: 'invalid' })
    const line = withProjectName(Array.from('─'.repeat(40), character => ({ character, isMark: false })), 'demo')
    expect(line.map(cell => cell.character).join('')).toBe(`─── demo ${'─'.repeat(31)}`)
    const narrow = withProjectName(Array.from('─'.repeat(12), character => ({ character, isMark: false })), 'chalkboardHQ')
    expect(narrow.map(cell => cell.character).join('')).toBe('─'.repeat(12))
  })

  test('the divider wears the project color and name, until it is turned off', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: NOON })
    await reloadInRepo($, on)
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    await ui.resize({ columns: 60, rows: 4 })
    const autoColor = PROJECT_COLORS[autoColorName('chalkboardHQ')]
    const tinted = await dividerTexts(ui)
    expect(tinted.map(t => t.text).join('')).toContain(' chalkboardHQ · main ')
    expect(tinted.every(t => t.props.color === autoColor)).toBe(true)
    expect(tinted.some(t => t.props.dimColor === true)).toBe(false)

    const reply = ((await $.command.run({ command: 'helix-color', args: 'off' } as never)) as { text?: string }).text
    expect(reply).toBe('chalkboardHQ: divider color and name off.')
    await ui.redraw(SPINNER)
    const plain = await dividerTexts(ui)
    expect(plain.map(t => t.text).join('')).not.toContain('chalkboardHQ')
    expect(plain.some(t => t.props.color === autoColor)).toBe(false)
    await ui.unmount()
  })

  test('the branch follows a switch, and a detached HEAD shows its commit', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: NOON })
    on('tool.call', async () => ({ result: { stdout: '', stderr: '' }, text: '' }) as never)
    const git = await reloadInRepo($, on)
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    await ui.resize({ columns: 120, rows: 4 })
    const line = async () => (await dividerTexts(ui)).map(t => t.text).join('')
    expect(await line()).toContain(' chalkboardHQ · main ')

    git.branch = 'feature/branch-in-divider'
    await $.tool.call({ tool: 'Bash', command: 'git switch feature/branch-in-divider' } as never)
    await ui.redraw(SPINNER)
    expect(await line()).toContain(' chalkboardHQ · feature/branch-in-divider ')

    git.branch = null
    await $.tool.call({ tool: 'Bash', command: 'git checkout a1b2c3d' } as never)
    await ui.redraw(SPINNER)
    expect(await line()).toContain(' chalkboardHQ · @a1b2c3d ')
    await ui.unmount()
  })

  test('long branches are shortened, and a narrow line drops the branch before the name', () => {
    expect(shortBranch('main')).toBe('main')
    expect(shortBranch('dylan/RET-1234-a-really-long-description')).toBe('dylan/RET-1234-a-really-lon…')
    const line = (width: number, branch: string | null) =>
      withProjectName(Array.from('─'.repeat(width), character => ({ character, isMark: false })), 'chalkboardHQ', branch)
        .map(cell => cell.character)
        .join('')
    expect(line(80, 'main')).toContain(' chalkboardHQ · main ')
    expect(line(40, 'main')).toContain(' chalkboardHQ ')
    expect(line(40, 'main')).not.toContain('main')
    expect(line(20, 'main')).toBe('─'.repeat(20))
    expect(line(80, null)).toContain(' chalkboardHQ ')
  })

  test('a chosen project color is remembered across sessions', async ($, on) => {
    mock.store(on, { projectColors: { [REPO]: 'violet' } })
    mock.clock(on, { now: NOON })
    await reloadInRepo($, on)
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    await ui.resize({ columns: 60, rows: 4 })
    expect((await dividerTexts(ui)).every(t => t.props.color === PROJECT_COLORS.violet)).toBe(true)
    await ui.unmount()
  })

  test('situations match the moment', () => {
    const saturdayNoon = new Date(2026, 7, 15, 12)
    const keys = (input: Parameters<typeof situationsFor>[0]) => situationsFor(input).map(situation => situation.key)
    expect(keys({ contextTokens: 0, now: saturdayNoon })).toEqual(['long-turn'])
    expect(keys({ tool: 'edit', contextTokens: 200_000, now: saturdayNoon })).toEqual(['tool:edit', 'big-context', 'long-turn'])
    expect(keys({ contextTokens: 0, now: new Date(2026, 7, 15, 23, 30) })).toContain('late-night')
    expect(keys({ contextTokens: 0, now: new Date(2026, 7, 17, 9) })).toContain('monday-morning')
    expect(keys({ contextTokens: 0, now: new Date(2026, 7, 21, 16) })).toContain('friday-afternoon')
  })

  test('a long turn brings its reminders only once it runs long', () => {
    const situations = situationsFor({ contextTokens: 0, now: new Date(2026, 7, 15, 12) })
    expect(activeSituations(situations, 30_000)).toEqual([])
    expect(activeSituations(situations, LONG_TURN_MS).map(situation => situation.key)).toEqual(['long-turn'])
  })

  test('situation lines take every other slot and each cuts in once', () => {
    const regular = [{ kind: 'Fun fact', text: 'a' }, { kind: 'Fun fact', text: 'b' }]
    const active = [{ key: 'tool:shell', after: 0, lines: [{ kind: 'Tip', text: 'x' }] }]
    expect([0, 1, 2, 3].map(index => tipAt(regular, active, index)?.text)).toEqual(['x', 'a', 'x', 'b'])
    expect([0, 1, 2].map(index => tipAt(regular, [], index)?.text)).toEqual(['a', 'b', 'a'])
    expect(firstUnintroduced(active, [])?.key).toBe('tool:shell')
    expect(firstUnintroduced(active, ['tool:shell'])).toBeUndefined()
  })

  test('compacting squeezes scattered dots into a packed block', () => {
    const litColumns = (t: number) =>
      new Set(
        Array.from({ length: DOT_COLUMNS * DOT_ROWS }, (_, index) => index)
          .filter(index => COMPACT_MOTION.pattern.isLit(index % DOT_COLUMNS, Math.floor(index / DOT_COLUMNS), t))
          .map(index => index % DOT_COLUMNS),
      )
    const scattered = litColumns(0)
    const packed = litColumns(5)
    expect(Math.max(...scattered) - Math.min(...scattered)).toBeGreaterThan(12)
    expect(Math.max(...packed) - Math.min(...packed)).toBeLessThan(6)
  })

  test('the spinner squeezes while the conversation compacts, then goes back', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: NOON })
    let finish = () => {}
    const finished = new Promise<void>(resolve => {
      finish = resolve
    })
    on('session.compact', async (_$, e) => {
      await finished
      return e as never
    })
    const props = { ...SPINNER, message: 'Compacting conversation…', mode: 'tool-use' } as const
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props })
    const isSqueezing = async () => (await ui.find({ key: 'helix' }))?.props.props as { compacting?: boolean } | undefined

    const compaction = $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hello', toolUses: [], handle: 'm1' }] } as never)
    await ui.advance(100)
    await ui.redraw(props)
    expect((await isSqueezing())?.compacting).toBe(true)

    finish()
    await compaction
    await ui.redraw(props)
    expect((await isSqueezing())?.compacting).toBe(false)
    await ui.unmount()
  })

  test('every group has two rare animations, each one moving and its own', () => {
    const frame = (pattern: (typeof ALL_RARE_MOTIONS)[number]['pattern'], t: number) =>
      Array.from({ length: DOT_COLUMNS * DOT_ROWS }, (_, index) =>
        pattern.isLit(index % DOT_COLUMNS, Math.floor(index / DOT_COLUMNS), t) ? '#' : '.',
      ).join('')
    const groups = ['thinking', 'requesting', 'responding', 'tool-input', 'tool-use', 'shell', 'read', 'search', 'edit', 'web', 'agents', 'mcp', 'compacting']
    expect(Object.keys(RARE_MOTIONS).sort()).toEqual([...groups].sort())
    for (const group of groups) {
      expect(RARE_MOTIONS[group]?.length).toBe(2)
    }
    const timelines = ALL_RARE_MOTIONS.map(({ pattern }) => [0.4, 1.3, 2.2, 3.1].map(t => frame(pattern, t)))
    for (const timeline of timelines) {
      expect(timeline.join('')).toContain('#')
      expect(new Set(timeline).size).toBeGreaterThan(1)
    }
    expect(new Set(timelines.map(timeline => timeline.join('|'))).size).toBe(ALL_RARE_MOTIONS.length)
    expect(new Set(ALL_RARE_MOTIONS.map(motion => motion.id)).size).toBe(ALL_RARE_MOTIONS.length)
  })

  test('rare animations turn up about one time in 120, always from their own group', () => {
    let rare = 0
    for (let seed = 0; seed < 24_000; seed++) {
      const motion = drawRareMotion('shell', `turn-${seed}:0`)
      if (motion) {
        rare += 1
        expect(RARE_MOTIONS.shell?.map(entry => entry.id)).toContain(motion.id)
      }
    }
    expect(rare).toBeGreaterThan(130)
    expect(rare).toBeLessThan(280)
    expect(drawRareMotion('not-a-group', 'seed')).toBeUndefined()
  })

  test('a rare animation seen for the first time joins the dex and says so', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: NOON })
    const { toasts } = listenForDone(on)
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    await ui.post({ motion: 'comet' }, { in: 'helix' })
    await ui.post({ motion: 'comet' }, { in: 'helix' })
    await ui.post({ motion: 'not-a-real-one' }, { in: 'helix' })
    expect(toasts).toEqual([])
    await ui.unmount()

    const pane = await $.ui.mount({
      plugin: 'helix-spinner',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'helix-dex',
      props: { bodyColumns: 80, bodyRows: 40 } as never,
    })
    expect(await pane.find({ type: 'Text', text: /· 1\/26 animations$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^Comet, \?\?\?$/ })).toBeDefined()
    await pane.press({ key: 'alerts' })
    await pane.unmount()

    const again = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    await again.post({ motion: 'warp' }, { in: 'helix' })
    expect(toasts).toEqual(['🎞 Rare animation discovered: Warp speed! (2/26 in your Helix Dex)'])
    await again.unmount()
  })

  test('the rare demo shows every rare animation in its group colors', async ($, on) => {
    mock.clock(on, { now: NOON })
    const ui = await $.ui.mount({
      plugin: 'helix-spinner',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'helix-demo-rare',
      props: { bodyColumns: 60, bodyRows: 80 } as never,
    })
    for (const motion of ALL_RARE_MOTIONS) {
      expect(await ui.find({ key: `rare-${motion.id}` })).toBeDefined()
    }
    const comet = await ui.findAll({ type: 'Text', in: 'rare-comet' })
    const pacman = await ui.findAll({ type: 'Text', in: 'rare-pacman' })
    const firstDotColor = (texts: readonly { text: string; props: Record<string, unknown> }[]) =>
      texts.find(t => /[\u2801-\u28ff]/.test(t.text))?.props.color
    expect(firstDotColor(comet)).not.toBe(firstDotColor(pacman))
    const glyphs = async (key: string) =>
      (await ui.findAll({ type: 'Text', in: key }))
        .map(t => t.text)
        .join('')
        .replace(/[^\u2800-\u28ff]/g, '')
        .slice(0, 12)
    await ui.advance(800)
    expect(await glyphs('rare-comet')).not.toBe(await glyphs('rare-warp'))
    await ui.unmount()
  })

  test('tools map to their groups', () => {
    expect(toolGroupOf('Bash')).toBe('shell')
    expect(toolGroupOf('Grep')).toBe('search')
    expect(toolGroupOf('Write')).toBe('edit')
    expect(toolGroupOf('mcp__linear__get_issue')).toBe('mcp')
    expect(toolGroupOf('TodoWrite')).toBeUndefined()
  })

  test('tool verbs have clean past tenses and no repeats', () => {
    const toolVerbs = Object.values(TOOL_VERBS).flat()
    for (const verb of toolVerbs) {
      expect(toPastTense(verb)).not.toMatch(/ing$/)
    }
    expect(toPastTense('Net-casting')).toBe('Net-cast')
    const seasonal = SEASONS.flatMap(season => season.verbs)
    const everything = [...WACKY_VERBS, ...RARE_VERBS, ...seasonal, ...toolVerbs]
    expect(everything.filter((verb, index) => everything.indexOf(verb) !== index)).toEqual([])
  })

  test('running subagents never draw over the animation', async ($, on) => {
    mock.clock(on, { now: QUIET_DAY })
    const ui = await $.ui.mount({
      plugin: 'helix-spinner',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'helix-demo',
      props: { bodyColumns: 60, bodyRows: 60 } as never,
    })
    const glyphs = async (key: string) =>
      (await ui.findAll({ type: 'Text', in: key }))
        .map(t => t.text)
        .join('')
        .replace(/[^\u2800-\u28ff]/g, '')
        .slice(0, 12)
    for (const ms of [0, 400, 1300]) {
      await ui.advance(ms)
      expect(await glyphs('demo-Two subagents running')).toBe(await glyphs('demo-Running a tool'))
    }
    await ui.unmount()
  })

  test('verbs turn past tense for the end-of-turn line', () => {
    expect(toPastTense('Hornswoggling')).toBe('Hornswoggled')
    expect(toPastTense('Latke-frying')).toBe('Latke-fried')
    expect(toPastTense('Waxing-poetic')).toBe('Waxed-poetic')
    expect(toPastTense('Okey-dokeying')).toBe('Okey-dokeyed')
    expect(toPastTense('Ringing-the-bell')).toBe('Rang-the-bell')
    expect(toPastTense('Lickety-splitting')).toBe('Lickety-split')
    for (const verb of WACKY_VERBS) {
      expect(toPastTense(verb)).not.toMatch(/ing$/)
    }
  })

  test('the end-of-turn line gets a wacky past-tense verb', async ($, on) => {
    mock.clock(on, { now: QUIET_DAY })
    on('ui.render', { component: 'TurnDuration' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>{e.props.word} for 3s</Text>
    })
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'TurnDuration', props: { word: 'Baked', durationMs: 3000 } })
    const past = WACKY_VERBS.map(v => toPastTense(v).replace(/[-]/g, '\\-')).join('|')
    expect(await ui.find({ type: 'Text', text: new RegExp(`^(${past}) for 3s$`) })).toBeDefined()
    await ui.unmount()
  })

  test('a verb seen for the first time joins the dex', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    await ui.advance(100)

    const dexPane = await $.ui.mount({
      plugin: 'helix-spinner',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'helix-dex',
      props: { bodyColumns: 60, bodyRows: 30 } as never,
    })
    expect(await dexPane.find({ type: 'Text', text: new RegExp(`^1/\\d+ found · 0/${RARE_VERBS.length} rare · 0 shiny · 0 limited · 0/\\d+ animations$`) })).toBeDefined()
    await dexPane.unmount()
    await ui.unmount()
  })

  test('rare verbs and shinies stay rare', () => {
    let rare = 0
    let shiny = 0
    for (let seed = 0; seed < 50_000; seed++) {
      const { rarity } = drawVerb('thinking', `turn-${seed}:0`)
      rare += rarity === 'rare' ? 1 : 0
      shiny += rarity === 'shiny' ? 1 : 0
    }
    expect(rare).toBeGreaterThan(150)
    expect(rare).toBeLessThan(700)
    expect(shiny).toBeGreaterThan(15)
    expect(shiny).toBeLessThan(110)
  })

  test('the Collector shop raises the odds and mixes in unlocked packs', () => {
    const draws = (upgrades: Parameters<typeof verbLuckOf>[0]) =>
      Array.from({ length: 20_000 }, (_, seed) => drawVerb('thinking', `turn-${seed}:0`, undefined, undefined, verbLuckOf(upgrades)))
    const count = (list: ReturnType<typeof draws>, rarity: string) => list.filter(draw => draw.rarity === rarity).length
    const plain = draws({})
    const charmed = draws({ charm: 4, shinyCharm: 3 })
    // Lucky charm 4 is five slots of 150, Shiny charm 3 is seven of 1,024.
    expect(count(charmed, 'rare')).toBeGreaterThan(count(plain, 'rare') * 3)
    expect(count(charmed, 'shiny')).toBeGreaterThan(count(plain, 'shiny') * 4)
    const spaceVerbs = new Set(VERB_PACKS[0]?.verbs)
    expect(plain.some(draw => spaceVerbs.has(draw.verb))).toBe(false)
    const packed = draws({ packs: 1 }).filter(draw => spaceVerbs.has(draw.verb)).length
    expect(packed).toBeGreaterThan(20_000 / 6)
    expect(packed).toBeLessThan(20_000 / 3)
  })

  test('bounties pay for rare and shiny sightings and first finds, and packs cap', () => {
    expect(sightingSparks({}, 'shiny', true)).toBe(0)
    expect(sightingSparks({ bounty: 1 }, 'rare', false)).toBe(25)
    expect(sightingSparks({ bounty: 1 }, 'shiny', false)).toBe(25 * 25)
    expect(sightingSparks({ bounty: 1 }, 'common', true)).toBe(6)
    expect(sightingSparks({ bounty: 1 }, 'common', false)).toBe(0)
    expect(upgradeMax('packs')).toBe(VERB_PACKS.length)
    expect(upgradeMax('bounty')).toBe(Infinity)
  })

  test('a tap gain fits its five cells however big it gets', () => {
    expect([126, 1260, 18_900, 1_260_000].map(formatGain)).toEqual(['126', '1.3k', '19k', '1.3m'])
    expect(Math.max(...[999, 9_999, 999_499, 9_999_999, 999_999_999_999].map(gain => formatGain(gain).length))).toBeLessThanOrEqual(5)
  })

  test('the Gen Z & Alpha pack only turns up while Claude is responding', () => {
    const slang = new Set(VERB_PACKS.find(pack => pack.id === 'slang')?.verbs)
    const luck = verbLuckOf({ packs: VERB_PACKS.length })
    const shown = (mode: string) =>
      Array.from({ length: 4000 }, (_, seed) => drawVerb(mode, `turn-${seed}:0`, undefined, undefined, luck).verb).filter(verb => slang.has(verb)).length
    expect(shown('responding')).toBeGreaterThan(50)
    expect(shown('thinking')).toBe(0)
    expect(shown('requesting')).toBe(0)
  })

  test('every pack verb is new, so packs only add to the dex', () => {
    const elsewhere = new Set([...Object.values(VERBS_BY_MODE).flat(), ...Object.values(TOOL_VERBS).flat(), ...RARE_VERBS, ...WACKY_VERBS])
    const packVerbs = VERB_PACKS.flatMap(pack => pack.verbs)
    expect(packVerbs.filter(verb => elsewhere.has(verb))).toEqual([])
    expect(new Set(packVerbs).size).toBe(packVerbs.length)
  })

  test('alerts start off and the button cycles all, rare & shiny only, off', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const pane = await $.ui.mount({
      plugin: 'helix-spinner',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'helix-dex',
      props: { bodyColumns: 60, bodyRows: 30 } as never,
    })
    const label = async () => (await pane.find({ key: 'alerts' }))?.text
    expect(await label()).toBe('Off')
    await pane.press({ key: 'alerts' })
    expect(await label()).toBe('All')
    await pane.press({ key: 'alerts' })
    expect(await label()).toBe('Rare & shiny only')
    await pane.press({ key: 'alerts' })
    expect(await label()).toBe('Off')
    await pane.unmount()
  })

  test('a tip, fact or reminder shows under the row and can be switched off', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    expect(await ui.find({ type: 'Text', text: '  ⎿  ', in: 'helix' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^(Tip|Fun fact|Tech history|Reminder):$/, in: 'helix' })).toBeDefined()

    const pane = await $.ui.mount({
      plugin: 'helix-spinner',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'helix-dex',
      props: { bodyColumns: 60, bodyRows: 30 } as never,
    })
    expect((await pane.find({ key: 'tips' }))?.text).toBe('On')
    await pane.press({ key: 'tips' })
    expect((await pane.find({ key: 'tips' }))?.text).toBe('Off')
    expect(await ui.find({ type: 'Text', text: '  ⎿  ', in: 'helix' })).toBeUndefined()
    await pane.unmount()
    await ui.unmount()
  })

  test('clicking the tip line skips to the next one', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    const tipText = async () => (await ui.findAll({ type: 'Text', in: 'helix' })).map(t => t.text ?? '').join('').split('⎿')[1]
    const before = await tipText()
    await ui.pointer({ type: 'down', x: 4, y: 3, button: 'left' })
    const after = await tipText()
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
    await ui.pointer({ type: 'down', x: 4, y: 2, button: 'left' })
    expect(await tipText()).toBe(after)
    await ui.unmount()
  })

  const FULLSCREEN = { columns: 140, rows: 40, isFullscreen: true }
  // At 140 columns the 50-cell strip ends a cell short of the edge: its button starts at 89, its ☰ at 138.
  const stripTap = (ui: { pointer: (e: { type: 'down'; x: number; y: number; button: 'left' }) => Promise<void> }) =>
    ui.pointer({ type: 'down', x: 108, y: 2, button: 'left' })
  const mountTapper = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER, viewport: FULLSCREEN })
    await ui.resize({ columns: 140, rows: 4 })
    return ui
  }

  test('the tap strip shows on the right only in fullscreen', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const windowed = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER, viewport: { ...FULLSCREEN, isFullscreen: false } })
    await windowed.resize({ columns: 140, rows: 4 })
    expect(await rowText(windowed)).not.toContain('☰')
    await windowed.unmount()

    const ui = await mountTapper($)
    expect(await rowText(ui)).toMatch(/\(\d+s\) +\[  tap  \] +✦ +0 ☰/)
    await ui.unmount()
  })

  test('every tap pays a spark, and the total is kept for the Dex', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await mountTapper($)
    await stripTap(ui)
    expect(await rowText(ui)).toMatch(/\] +\+1 +✦ +1 ☰/)
    await ui.advance(700)
    await stripTap(ui)
    expect(await rowText(ui)).toMatch(/\] +\+1 +✦ +2 ☰/)
    await ui.pointer({ type: 'down', x: 4, y: 2, button: 'left' })
    await ui.advance(500)
    expect(await rowText(ui)).toMatch(/\] +✦ +2 ☰ +⎿/)

    const dexPane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-dex', props: { bodyColumns: 60, bodyRows: 30 } as never })
    expect(await dexPane.find({ type: 'Text', text: / · 2 taps · best combo x1 · ✦ 2$/ })).toBeDefined()
    await dexPane.unmount()
    await ui.unmount()
  })

  test('a burst of taps in one frame, before anything else is sent, all reach the save', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await mountTapper($)
    for (let index = 0; index < 5; index++) {
      await stripTap(ui)
    }
    await ui.advance(500)
    const dexPane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-dex', props: { bodyColumns: 60, bodyRows: 30 } as never })
    expect(await dexPane.find({ type: 'Text', text: / · 5 taps · best combo x5 · / })).toBeDefined()
    await dexPane.unmount()
    await ui.unmount()
  })

  test('the tap strip stays put as the numbers change', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await mountTapper($)
    const barStart = async () => (await rowText(ui)).indexOf('✦')
    const before = await barStart()
    for (let index = 0; index < 12; index++) {
      await stripTap(ui)
      await ui.advance(50)
      expect(await barStart()).toBe(before)
    }
    await ui.unmount()
  })

  test('the button goes down for a moment on each tap', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await mountTapper($)
    const label = async () => (await ui.find({ type: 'Text', text: '  tap  ', in: 'helix' }))?.props.inverse
    await stripTap(ui)
    expect(await label()).toBe(true)
    await ui.advance(200)
    expect(await label()).toBeFalsy()
    await ui.unmount()
  })

  test('the button warms up as you tap faster, then cools back to grey', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await mountTapper($)
    const edgeColor = async () => (await ui.find({ type: 'Text', text: '[', in: 'helix' }))?.props.color
    expect(await edgeColor()).toBeUndefined()
    const seen: unknown[] = []
    for (let index = 0; index < 8; index++) {
      await stripTap(ui)
      seen.push(await edgeColor())
      await ui.advance(50)
    }
    expect(seen).toEqual([undefined, undefined, HEAT_COLORS.warm, HEAT_COLORS.warm, HEAT_COLORS.hot, HEAT_COLORS.hot, HEAT_COLORS.hot, HEAT_COLORS.frenzy])
    await ui.advance(1500)
    expect(await edgeColor()).toBeUndefined()
    await ui.unmount()
  })

  test('the numbers stay plain grey, so they never outshine the spinner', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await mountTapper($)
    for (let index = 0; index < 8; index++) {
      await stripTap(ui)
    }
    const readout = await ui.find({ type: 'Text', text: /✦/, in: 'helix' })
    expect(readout?.props.dimColor).toBe(true)
    expect(readout?.props.color).toBeUndefined()
    await ui.unmount()
  })

  test('tapping fast multiplies sparks and builds a combo', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await mountTapper($)
    for (let index = 0; index < 8; index++) {
      await stripTap(ui)
      await ui.advance(50)
    }
    // 1 + 1 + 2 + 2 + 3 + 3 + 3 + 5 sparks.
    expect(await rowText(ui)).toMatch(/\] +\+5 +x8 +✦ +20 /)
    await ui.unmount()
  })

  test('/helix-tap opens the menu, and sets the style and label', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const opened: string[] = []
    on('ui.open', async (_$, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } } as never
    })
    const say = async (args: string) => ((await $.command.run({ command: 'helix-tap', args } as never)) as { text?: string }).text ?? ''
    expect(await say('')).toBe('Tapper menu opened.')
    expect(opened).toEqual(['helix-tap'])
    expect(await say('button pill')).toBe('Pill costs ✦ 900. Buy it in the Looks tab of /helix-tap.')
    expect(await say('button brackets')).toBe('Tap button: Brackets')
    expect(await say('text boop')).toBe('Tap button label: boop')
    const ui = await mountTapper($)
    expect(await rowText(ui)).toMatch(/\[ boop  \] +✦/)
    expect(await say('text default')).toBe('Tap button label: tap')
    await ui.unmount()
  })

  test('the tapper menu shows your sparks and the button in every state', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await mountTapper($)
    for (let index = 0; index < 3; index++) {
      await stripTap(ui)
      await ui.advance(700)
    }
    const pane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-tap', props: { bodyColumns: 70, bodyRows: 60 } as never })
    expect(await pane.find({ type: 'Text', text: '✦ 3' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /3 taps · best combo x1 · ✦ 3 earned in all$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Brackets' })).toBeDefined()
    // Only Brackets is owned to start, so stepping stays on it.
    await pane.press({ key: 'style-next' })
    expect(await pane.find({ type: 'Text', text: ' 1 of 1 owned' })).toBeDefined()
    expect(await pane.find({ key: 'look-block' })).toBeDefined()
    await pane.unmount()
    await ui.unmount()
  })

  test('button looks are bought once with sparks, then worn', async ($, on) => {
    mock.store(on, { taps: { taps: 0, bestCombo: 0, earned: 500, upgrades: {}, balance: 2 } })
    mock.clock(on, { now: QUIET_DAY })
    const toasts: string[] = []
    on('ui.toast', async (_$, e) => {
      toasts.push(e.text)
      return {} as never
    })
    const pane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-tap', props: { bodyColumns: 70, bodyRows: 60 } as never })
    await pane.press({ key: 'look-block' })
    expect(await pane.find({ type: 'Text', text: '✦ 400' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Block' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: ' 2 of 2 owned' })).toBeDefined()
    // Pill is 900: too dear, so it stays unbought.
    await pane.press({ key: 'look-pill' })
    expect(toasts).toContain('Not enough sparks for Pill: ✦ 500 to go.')
    expect(await pane.find({ type: 'Text', text: '✦ 400' })).toBeDefined()
    await pane.unmount()
  })

  test('the shop sells upgrades for sparks, and they change what a tap pays', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await mountTapper($)
    // 12 fast taps: 1 + 1 + 2 + 2 + 3 + 3 + 3 + 5 + 5 + 5 + 5 + 5 = 40 sparks.
    for (let index = 0; index < 12; index++) {
      await stripTap(ui)
      await ui.advance(50)
    }
    await ui.advance(1500)
    expect(await rowText(ui)).toMatch(/✦ +40 /)
    const pane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-tap', props: { bodyColumns: 90, bodyRows: 60 } as never })
    await pane.press({ key: 'tab-shop' })
    expect(await pane.find({ type: 'Text', text: '✦ STORE ✦' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '✦ 40 to spend' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Make every tap of the button pay more.' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^─{20,}$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '+1 per tap → +2 per tap' })).toBeDefined()
    await pane.press({ key: 'buy-strong' })
    expect(await pane.find({ type: 'Text', text: '+2 per tap → +3 per tap' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '✦ 15' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '✦ 15 to spend' })).toBeDefined()
    await ui.redraw(SPINNER)
    expect(await rowText(ui)).toMatch(/✦ +15 /)
    // Strong tap Lv 1: a slow tap now pays 2.
    await stripTap(ui)
    expect(await rowText(ui)).toMatch(/\+2 +✦ +17 /)
    await pane.unmount()
    await ui.unmount()
  })

  test('skills deeper in the tree stay locked until the one above is far enough along', async ($, on) => {
    mock.store(on, { taps: { taps: 0, bestCombo: 0, earned: 100_000, upgrades: { strong: 3, hot: 4 }, balance: 2 } })
    mock.clock(on, { now: QUIET_DAY })
    const pane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-tap', props: { bodyColumns: 120, bodyRows: 80 } as never })
    // The Skills tab lists only what can be bought now; locked skills live on the Tree tab's map.
    await pane.press({ key: 'tab-shop' })
    expect(await pane.find({ key: 'buy-golden' })).toBeUndefined()
    expect(await pane.find({ type: 'Text', text: /🔒/ })).toBeUndefined()
    await pane.press({ key: 'tab-tree' })
    expect(await pane.find({ type: 'Text', text: '🔒 Golden taps' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: ' needs Hot streak 5' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '● Hot streak' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '└─ ' })).toBeDefined()
    await pane.press({ key: 'tab-shop' })
    await pane.press({ key: 'buy-hot' })
    expect(await pane.find({ key: 'buy-golden' })).toBeDefined()
    await pane.unmount()
  })

  test('Golden taps can be bought, and a golden button is painted gold over the heat', async ($, on) => {
    mock.store(on, { taps: { taps: 0, bestCombo: 0, earned: 100_000, upgrades: { strong: 3, hot: 5 }, balance: 2 } })
    mock.clock(on, { now: QUIET_DAY })
    const pane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-tap', props: { bodyColumns: 120, bodyRows: 80 } as never })
    await pane.press({ key: 'tab-shop' })
    await pane.press({ key: 'buy-golden' })
    expect(await pane.find({ type: 'Text', text: /^2%\/s, pays ×10 → / })).toBeDefined()
    await pane.unmount()

    // A golden window is a roll of the dice; what it paints is not.
    const golden = drawButton({ button: null, text: null }, 'frenzy', false, '#d4b25f')
    expect(golden[0]?.color).toBe('#d4b25f')
  })

  test('the ☰ at the end of the strip opens the shop without stopping anything', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const opened: string[] = []
    on('ui.open', async (_$, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } } as never
    })
    const ui = await mountTapper($)
    expect(await rowText(ui)).toMatch(/✦ +0 ☰/)
    await ui.pointer({ type: 'down', x: 138, y: 2, button: 'left' })
    await ui.advance(300)
    expect(opened).toEqual(['helix-tap'])
    // A click on the menu is not a tap.
    expect(await rowText(ui)).toMatch(/\] +✦ +0 ☰/)
    const pane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-tap', props: { bodyColumns: 90, bodyRows: 60 } as never })
    expect(await pane.find({ key: 'buy-strong' })).toBeDefined()
    await pane.unmount()
    await ui.unmount()
  })

  test('an upgrade you cannot afford stays unbought', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const toasts: string[] = []
    on('ui.toast', async (_$, e) => {
      toasts.push(e.text)
      return {} as never
    })
    const pane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-tap', props: { bodyColumns: 90, bodyRows: 60 } as never })
    await pane.press({ key: 'tab-shop' })
    await pane.press({ key: 'buy-crit' })
    expect(await pane.find({ type: 'Text', text: /^0% for ×10 → / })).toBeDefined()
    expect(toasts).toContain('Not enough sparks for Crit taps: ✦ 50 to go.')
    await pane.unmount()
  })

  test('every tool Claude runs pays a spark', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    on('tool.call', async () => ({ result: 'done' }) as never)
    await $.tool.call({ tool: 'Grep', pattern: 'helix' } as never)
    await $.tool.call({ tool: 'Read', file_path: 'x' } as never)
    const dexPane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-dex', props: { bodyColumns: 60, bodyRows: 30 } as never })
    expect(await dexPane.find({ type: 'Text', text: / · ✦ 2$/ })).toBeDefined()
    await dexPane.unmount()
  })

  test('a finished turn pays for the time Claude worked, with the Thinker upgrades', async ($, on) => {
    mock.store(on, { taps: { xp: 0, taps: 0, bestCombo: 0, earned: 1000, upgrades: { thinking: 1 }, balance: 2 } })
    const clock = mock.clock(on, { now: QUIET_DAY })
    on('turn.start', async (_$, e) => ({ turnId: e.turnId }) as never)
    on('turn.complete', async () => ({ text: 'done' }) as never)
    on('tool.call', async () => {
      await clock.advance(95_000)
      return { result: 'done' } as never
    })
    await $.turn.start({ turnId: 't1', text: 'hi' } as never)
    await $.tool.call({ tool: 'Bash', command: 'yarn test' } as never)
    await $.turn.complete({ turnId: 't1', text: 'done', reason: 'answer' } as never)
    const dexPane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-dex', props: { bodyColumns: 60, bodyRows: 30 } as never })
    // 1,000 earned, less 30 for Thinking pays Lv 1, plus 9 tens of seconds of work at 1 each and 1 for the tool.
    expect(await dexPane.find({ type: 'Text', text: / · ✦ 980$/ })).toBeDefined()
    await dexPane.unmount()
  })

  test('a turn left waiting pays nothing for the wait', async ($, on) => {
    mock.store(on, { taps: { xp: 0, taps: 0, bestCombo: 0, earned: 1000, upgrades: { thinking: 1 }, balance: 2 } })
    const clock = mock.clock(on, { now: QUIET_DAY })
    on('turn.start', async (_$, e) => ({ turnId: e.turnId }) as never)
    on('turn.complete', async () => ({ text: 'done' }) as never)
    await $.turn.start({ turnId: 't1', text: 'hi' } as never)
    await clock.advance(8 * 60 * 60_000)
    await $.turn.complete({ turnId: 't1', text: 'done', reason: 'answer' } as never)
    const dexPane = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Pane', requestId: 'helix-dex', props: { bodyColumns: 60, bodyRows: 30 } as never })
    expect(await dexPane.find({ type: 'Text', text: / · ✦ 970$/ })).toBeDefined()
    await dexPane.unmount()
  })

  test('sparks, costs and Claude-work payouts add up', () => {
    expect([0, 1, 2].map(level => upgradeCost('strong', level))).toEqual([25, 40, 64])
    expect(spentOn({ strong: 2, crit: 1 })).toBe(25 + 40 + 50)
    expect(sparksOf({ ...NO_TAPS, earned: 200, upgrades: { strong: 2 } })).toBe(135)
    // 95 seconds of work: 9 tens; Thinking pays Lv 1 still pays 1 each (1.25 rounds down), Deep thought Lv 2 is ×1.5 past a minute.
    expect(turnSparks({}, 95_000, 0, 0)).toBe(9)
    expect(turnSparks({ thinking: 1, deep: 2 }, 95_000, 0, 0)).toBe(13)
    expect(turnSparks({ tithe: 2 }, 5_000, 3_400, 0)).toBe(6)
    // Income grows ×1.25 a level against prices at ×1.6: Toolsmith 12 pays 15 a tool.
    expect(turnSparks({ toolsmith: 12 }, 0, 0, 1)).toBe(15)
    // Tool chain 2 adds 10% per tool after the first: 3 tools pay 1 + 1.1 + 1.2.
    expect(turnSparks({ chain: 2 }, 0, 0, 3)).toBe(3)
    expect(turnSparks({ toolsmith: 5, chain: 2 }, 0, 0, 3)).toBe(9)
    // The climb tops out at double pay: past that, one more tool adds exactly 2.
    expect(turnSparks({ chain: 20 }, 0, 0, 51) - turnSparks({ chain: 20 }, 0, 0, 50)).toBe(2)
    // Overclock and Deep thought multiply tools along with thinking.
    expect(turnSparks({ overclock: 2, deep: 2 }, 60_000, 0, 4)).toBe(22)
    // Work past 30 minutes in one turn pays nothing more.
    expect(turnSparks({}, 8 * 60 * 60_000, 0, 0)).toBe(turnSparks({}, 30 * 60_000, 0, 0))
    expect(comboGapMs(0)).toBe(600)
    expect(comboGapMs(10)).toBe(2000)
    expect(critChance(0)).toBe(0)
    expect(critChance(20)).toBe(0.5)
    // Capped upgrades stop at their max even if a save holds more.
    expect(comboGapMs(50)).toBe(2000)
    expect(critChance(1000)).toBe(0.5)
    expect(upgradeMax('steady')).toBe(10)
    expect(upgradeMax('strong')).toBe(Infinity)
    // Deep focus 2 brings Deep thought's marks in to 30s and 3m.
    expect(turnSparks({ deep: 2 }, 30_000, 0, 0)).toBe(3)
    expect(turnSparks({ deep: 2, deepFocus: 2 }, 30_000, 0, 0)).toBe(4)
    expect(turnSparks({ deep: 2, deepFocus: 2 }, 180_000, 0, 0)).toBe(36)
  })

  test('two windows saving at once keep the larger of every count', () => {
    const a = { taps: 90, bestCombo: 12, earned: 300, upgrades: { strong: 2 }, looks: ['block'] }
    const b = { taps: 120, bestCombo: 30, earned: 260, upgrades: { strong: 1, crit: 3 }, looks: ['pill'] }
    expect(mergeTaps(a, b)).toEqual({ taps: 120, bestCombo: 30, earned: 300, upgrades: { strong: 2, crit: 3 }, looks: ['block', 'pill'], balance: 2 })
    expect(normalizeTaps({ taps: 54, bestCombo: 54, balance: 2 })).toEqual({ taps: 54, bestCombo: 54, earned: 0, upgrades: {}, looks: [], balance: 2 })
    // A save from before the current balance starts over.
    expect(normalizeTaps({ xp: 203_712, taps: 1371, bestCombo: 167, earned: 25_067_966, upgrades: { milestone: 13 } })).toEqual(NO_TAPS)
  })

  test('every button style is nine cells in every state, and each one is its own shape', () => {
    const heats: Heat[] = ['cool', 'warm', 'hot', 'frenzy']
    for (const style of BUTTON_STYLES) {
      for (const text of [null, 'a', 'hello']) {
        for (const heat of heats) {
          for (const isPressed of [false, true]) {
            const pieces = drawButton({ button: style.id, text }, heat, isPressed)
            expect(Array.from(pieces.map(piece => piece.text).join('')).length).toBe(BUTTON_WIDTH)
          }
        }
      }
    }
    const shapes = BUTTON_STYLES.map(style => JSON.stringify(drawButton({ button: style.id, text: null }, 'cool', false)))
    expect(new Set(shapes).size).toBe(BUTTON_STYLES.length)
  })

  test('styles are worn once bought, and old saved looks still load', () => {
    expect(parseTapArgs('button block', ['block'])).toEqual({ action: 'button', button: 'block' })
    expect(parseTapArgs('button brackets', [])).toEqual({ action: 'button', button: 'brackets' })
    expect(parseTapArgs('button block', [])).toEqual({ action: 'unowned', name: 'Block', price: 100 })
    expect(parseTapArgs('button nope', []).action).toBe('invalid')
    expect(parseTapArgs('text toolong', []).action).toBe('invalid')
    expect(parseTapArgs('text "hi!"', [])).toEqual({ action: 'text', text: 'hi!' })
    expect(stepStyle(null, ['block', 'round'], 1).id).toBe('block')
    expect(stepStyle('round', ['block', 'round'], 1).id).toBe('brackets')
    expect(stepStyle(null, ['block', 'round'], -1).id).toBe('round')
    expect(sparksOf({ ...NO_TAPS, earned: 1000, looks: ['block', 'round'] })).toBe(1000 - 100 - 300)
    expect(normalizeLook({ icon: '☆', button: 'text:hi' })).toEqual({ button: null, text: null })
    expect(normalizeLook({ button: 'pill', text: 'boop' })).toEqual({ button: 'pill', text: 'boop' })
  })

  test('the heat climbs with the pace, and Overdrive brings the frenzy sooner', () => {
    expect([1, 3, 5, 8].map(taps => heatOf(taps))).toEqual(['cool', 'warm', 'hot', 'frenzy'])
    expect(heatOf(6, frenzyAtFor({}))).toBe('hot')
    expect(heatOf(6, frenzyAtFor({ overdrive: 1 }))).toBe('frenzy')
  })

  test('the tree opens skills by their parents, and the strip aims at the cheapest one open', () => {
    expect(isUnlocked({}, 'strong')).toBe(true)
    expect(isUnlocked({ strong: 2 }, 'hot')).toBe(false)
    expect(isUnlocked({ strong: 3 }, 'hot')).toBe(true)
    expect(isUnlocked({ golden: 2 }, 'golden')).toBe(true)
    expect(depthOf('goldenTouch')).toBe(3)
    // Each branch draws as a tree: Strong tap's two children fork, and Hot streak's line runs past its own children.
    expect(branchRows('tapper').map(row => `${row.prefix}${row.upgrade.id}`)).toEqual([
      'strong',
      '├─ hot',
      '│  └─ golden',
      '│     └─ goldenTouch',
      '└─ steady',
      '   └─ overdrive',
    ])
    expect(requirementText('golden')).toBe('needs Hot streak 5')
    // Every skill but the roots hangs from one listed before it, in its own branch.
    UPGRADES.forEach((upgrade, index) => {
      const parent = UPGRADES.findIndex(other => other.id === upgrade.requires?.id)
      expect(upgrade.requires === undefined || (parent >= 0 && parent < index && UPGRADES[parent]?.path === upgrade.path)).toBe(true)
    })
    // Capstones change the rules once: crits, the work cap, and bounties.
    expect(critMultiplierFor({ bigCrits: 1 })).toBe(15)
    expect(turnSparks({ marathon: 1 }, 8 * 60 * 60_000, 0, 0)).toBe(turnSparks({}, 60 * 60_000, 0, 0) * 2)
    expect(sightingSparks({ bounty: 1, completionist: 1 }, 'rare', false)).toBe(50)
  })

  test('a divider line separates the live spinner from the response', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    await ui.resize({ columns: 40, rows: 3 })
    expect(await ui.find({ type: 'Text', text: /^[─━]{40}$/, in: 'helix' })).toBeDefined()
    await ui.unmount()
  })

  test('the divider pulse glides across, then rests', () => {
    expect(dividerLine(20, 0)).toBe('─'.repeat(20))
    expect(dividerLine(20, 150 * 10)).toBe('─'.repeat(4) + '━'.repeat(6) + '─'.repeat(10))
    expect(dividerLine(20, 150 * 40)).toBe('─'.repeat(20))
    expect(dividerLine(20, 150 * 46)).toBe('─'.repeat(20))
  })

  test('after a skip the next tip waits a full 15 seconds', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    const tipText = async () => (await ui.findAll({ type: 'Text', in: 'helix' })).map(t => t.text ?? '').join('').split('⎿')[1]
    await ui.advance(10_000)
    await ui.pointer({ type: 'down', x: 4, y: 3, button: 'left' })
    const skippedTo = await tipText()
    await ui.advance(10_000)
    expect(await tipText()).toBe(skippedTo)
    await ui.advance(5_500)
    expect(await tipText()).not.toBe(skippedTo)
    await ui.unmount()
  })

  test('the verb showing when the spinner first appears still reaches the dex', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: QUIET_DAY })
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: { ...SPINNER, mode: 'requesting' } })
    await ui.advance(100)
    const dexPane = await $.ui.mount({
      plugin: 'helix-spinner',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'helix-dex',
      props: { bodyColumns: 60, bodyRows: 30 } as never,
    })
    expect(await dexPane.find({ type: 'Text', text: /^ [█░]+ 1\/\d+$/ })).toBeDefined()
    await dexPane.unmount()
    await ui.unmount()
  })

  test('holiday dates land where they should', () => {
    const ids = (year: number, month: number, day: number) => activeSeasons(new Date(year, month - 1, day)).map(season => season.id)
    expect(thanksgivingOf(2026).getDate()).toBe(26)
    expect(thanksgivingOf(2027).getDate()).toBe(25)
    expect([easterOf(2026).getMonth() + 1, easterOf(2026).getDate()]).toEqual([4, 5])
    expect([easterOf(2027).getMonth() + 1, easterOf(2027).getDate()]).toEqual([3, 28])
    expect(hanukkahNight(new Date(2026, 11, 4))).toBe(1)
    expect(hanukkahNight(new Date(2026, 11, 11))).toBe(8)
    expect(hanukkahNight(new Date(2026, 11, 20))).toBe(null)
    expect(hanukkahNight(new Date(2026, 11, 12))).toBe(null)
    expect(hanukkahNight(new Date(2027, 11, 31))).toBe(8)
    expect(ids(2026, 10, 31)).toEqual(['halloween'])
    expect(ids(2026, 10, 30)).toEqual([])
    expect(ids(2026, 11, 26)).toEqual(['thanksgiving'])
    expect(ids(2026, 11, 25)).toEqual([])
    expect(ids(2026, 11, 8)).toEqual(['diwali'])
    expect(ids(2026, 12, 5)).toEqual(['hanukkah'])
    expect(ids(2026, 12, 25)).toEqual(['christmas'])
    expect(ids(2027, 12, 25)).toEqual(['hanukkah', 'christmas'])
    expect(ids(2026, 12, 31)).toEqual(['new-year'])
    expect(ids(2027, 1, 1)).toEqual(['new-year'])
    expect(ids(2027, 1, 2)).toEqual([])
    expect(ids(2026, 2, 17)).toEqual(['lunar-new-year'])
    expect(ids(2026, 2, 18)).toEqual([])
    expect(ids(2026, 2, 14)).toEqual(['valentines'])
    expect(ids(2026, 3, 17)).toEqual(['st-patricks'])
    expect(ids(2026, 4, 5)).toEqual(['easter'])
    expect(ids(2026, 4, 4)).toEqual([])
    expect(ids(2026, 7, 4)).toEqual(['fourth-of-july'])
    expect(ids(2026, 8, 15)).toEqual([])
  })

  test('holiday verbs have clean past tenses and no repeats', () => {
    const seasonal = SEASONS.flatMap(season => season.verbs)
    for (const verb of seasonal) {
      expect(toPastTense(verb)).not.toMatch(/ing$/)
    }
    const everything = [...WACKY_VERBS, ...seasonal]
    expect(everything.filter((verb, index) => everything.indexOf(verb) !== index)).toEqual([])
  })

  test('on Halloween the spinner wears Halloween colors and a bat flits along the divider', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: new Date(2026, 9, 31).getTime() })
    const ui = await $.ui.mount({ plugin: 'helix-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
    await ui.resize({ columns: 60, rows: 4 })
    const texts = (await ui.findAll({ type: 'Text', in: 'helix' })).map(t => t.text ?? '').join('')
    expect(texts).toContain('ᴥ')
    await ui.unmount()
  })

  test('each holiday signature draws within the divider', () => {
    for (const signature of ['bat', 'leaves', 'menorah', 'snow', 'fireworks', 'lantern', 'hearts', 'clovers', 'eggs', 'lamps']) {
      for (const ms of [0, 700, 2300, 9000]) {
        const cells = dividerCells(50, ms, signature, 3)
        expect(cells.length).toBe(50)
      }
    }
    const menorah = dividerCells(40, 0, 'menorah', 3).map(cell => cell.character).join('')
    expect((menorah.match(/[✶✷]/g) ?? []).length).toBe(3)
    expect(menorah).toContain('✦')
  })
})

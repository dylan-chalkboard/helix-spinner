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
import { drawVerb, RARE_VERBS, TOOL_VERBS, toPastTense, VERBS_BY_MODE, WACKY_VERBS } from './words'

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

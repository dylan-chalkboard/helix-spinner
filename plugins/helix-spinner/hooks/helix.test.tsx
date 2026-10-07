import { describe, expect, mock, test } from 'claude-code/testing'

import { dividerCells, dividerLine } from './helix'
import { activeSeasons, easterOf, hanukkahNight, SEASONS, thanksgivingOf } from './seasons'
import { DOT_COLUMNS, DOT_ROWS } from './grid'
import { TOOL_MOTIONS } from './tool-motions'
import { toolGroupOf } from './tools'
import { drawVerb, RARE_VERBS, TOOL_VERBS, toPastTense, VERBS_BY_MODE, WACKY_VERBS } from './words'

// A day with no holiday pack in season.
const QUIET_DAY = new Date(2026, 7, 15).getTime()

const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } as const

const rowText = async (ui: { findAll: (q: { type: string; in: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text', in: 'helix' }))
    .map(t => t.text ?? '')
    .join('')
    .replace(/^[─━]+/, '')

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
    expect(await dexPane.find({ type: 'Text', text: new RegExp(`^1/\\d+ found · 0/${RARE_VERBS.length} rare · 0 shiny · 0 limited$`) })).toBeDefined()
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
    await ui.pointer({ type: 'down', x: 4, y: 2, button: 'left' })
    const after = await tipText()
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
    await ui.pointer({ type: 'down', x: 4, y: 1, button: 'left' })
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
    await ui.pointer({ type: 'down', x: 4, y: 2, button: 'left' })
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

import type { HelixToolGroup } from '../types'
import type { Situation } from './tip-rotation'

const tips = (...texts: string[]) => texts.map(text => ({ kind: 'Tip', text }))
const reminders = (...texts: string[]) => texts.map(text => ({ kind: 'Reminder', text }))

export const BIG_CONTEXT_TOKENS = 150_000
export const LONG_TURN_MS = 2 * 60 * 1000

const BIG_CONTEXT = tips(
  'Context is getting big. /compact squeezes it down and keeps Claude sharp.',
  '/context shows what is filling up the context window.',
  'Switching tasks? /clear starts a fresh conversation.',
  'Long contexts get noisy. A fresh session with a short summary often works better.',
)

const TOOL_TIPS: Record<HelixToolGroup, readonly { kind: string; text: string }[]> = {
  shell: tips(
    'Tired of approving the same command? /permissions can allow it for good.',
    'Start a prompt with ! to run a shell command yourself.',
    'Claude can run long commands in the background and keep working.',
  ),
  read: tips(
    'Type @ to point Claude straight at a file.',
    'A CLAUDE.md tells Claude about your project before it reads a thing.',
  ),
  search: tips(
    'Know where something lives? Mention the file with @ and skip the search.',
    'Ctrl+O shows the full transcript, search results included.',
  ),
  edit: tips(
    'Changed your mind? Press Esc twice or use /rewind to jump back, code included.',
    'Shift+Tab into plan mode to review the plan before any edit.',
  ),
  web: tips(
    'Paste a URL into your prompt and Claude can read the page.',
    'Docs change fast. Asking Claude to check the latest docs avoids stale answers.',
  ),
  agents: tips(
    'Subagents work in their own context, so your main conversation stays lean.',
    '/agents lets you make custom subagents for jobs you repeat.',
  ),
  mcp: tips(
    '/mcp shows your connected servers and their status.',
    'MCP servers plug Claude into tools like Linear, Slack and databases.',
  ),
}

const LONG_TURN = reminders(
  'Long one! Good time to stretch.',
  'Grab some water while Claude works.',
  'Rest your eyes: look at something far away for 20 seconds.',
  'Claude will keep going. Step away for a minute if you like.',
)

const LATE_NIGHT = reminders(
  'It is late. Future you will appreciate some sleep.',
  'Late-night coding streak? Remember to rest.',
  'Nothing here that cannot wait until morning.',
)

const MONDAY_MORNING = reminders('Happy Monday! Ease into the week.', 'Monday morning: a good time to plan the week.')

const FRIDAY_AFTERNOON = reminders(
  'Friday afternoon. Maybe not the time for a big deploy.',
  'Almost the weekend. Jot down where you left off.',
)

const timeOfDay = (date: Date): Situation | undefined => {
  const hour = date.getHours()
  const day = date.getDay()
  if (hour >= 23 || hour < 5) {
    return { key: 'late-night', after: 0, lines: LATE_NIGHT }
  }
  if (day === 1 && hour >= 6 && hour < 12) {
    return { key: 'monday-morning', after: 0, lines: MONDAY_MORNING }
  }
  if (day === 5 && hour >= 14) {
    return { key: 'friday-afternoon', after: 0, lines: FRIDAY_AFTERNOON }
  }
  return undefined
}

// The situations that apply right now, most specific first; a long turn's waits for the turn to run long.
export const situationsFor = ({ tool, contextTokens, now }: { tool?: HelixToolGroup; contextTokens: number; now: Date }) =>
  [
    tool && { key: `tool:${tool}`, after: 0, lines: TOOL_TIPS[tool] },
    contextTokens >= BIG_CONTEXT_TOKENS && { key: 'big-context', after: 0, lines: BIG_CONTEXT },
    { key: 'long-turn', after: LONG_TURN_MS, lines: LONG_TURN },
    timeOfDay(now),
  ].filter((situation): situation is Situation => Boolean(situation))

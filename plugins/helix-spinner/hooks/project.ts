// Colors that read on dark and light terminals alike; red stays free for a failed command.
export const PROJECT_COLORS: Record<string, string> = {
  teal: '#2dd4bf',
  sky: '#38bdf8',
  indigo: '#818cf8',
  violet: '#a78bfa',
  pink: '#f472b6',
  rose: '#fb7185',
  orange: '#fb923c',
  amber: '#fbbf24',
  lime: '#a3e635',
  emerald: '#34d399',
  cyan: '#22d3ee',
  blue: '#60a5fa',
  purple: '#c084fc',
  fuchsia: '#e879f9',
  yellow: '#facc15',
  green: '#4ade80',
  mint: '#6ee7b7',
  peach: '#fdba74',
  lavender: '#c4b5fd',
  gold: '#eab308',
  slate: '#94a3b8',
  white: '#f8fafc',
}

const COLOR_NAMES = Object.keys(PROJECT_COLORS)

// The automatic pick keeps to the first ten, so adding colors never moves a project to a new one.
const AUTO_COLOR_NAMES = COLOR_NAMES.slice(0, 10)

const hashOf = (text: string) => Array.from(text).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 0)

// The same project always lands on the same color.
export const autoColorName = (projectName: string) =>
  AUTO_COLOR_NAMES[Math.abs(hashOf(projectName)) % AUTO_COLOR_NAMES.length] ?? 'teal'

// The folder's own name: `/Users/me/projects/chalkboardHQ` → `chalkboardHQ`.
export const projectNameOf = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

// What a project's color setting is: a color by name, 'off', or absent for the automatic pick.
export type ColorSetting = string | 'off' | undefined

export const projectColor = (projectName: string, setting: ColorSetting) => {
  if (setting === 'off') {
    return null
  }
  const name = setting && PROJECT_COLORS[setting] ? setting : autoColorName(projectName)
  return PROJECT_COLORS[name] ?? null
}

export type ColorRequest = { action: 'set'; color: string } | { action: 'auto' } | { action: 'off' } | { action: 'show' } | { action: 'invalid' }

export const parseColorArgs = (args: string): ColorRequest => {
  const choice = args.trim().toLowerCase()
  if (choice === '' || choice === 'list') {
    return { action: 'show' }
  }
  if (choice === 'auto' || choice === 'off') {
    return { action: choice }
  }
  return PROJECT_COLORS[choice] ? { action: 'set', color: choice } : { action: 'invalid' }
}

export const colorNames = () => COLOR_NAMES.join(', ')

// The project's name written into the divider near its left end: `── chalkboardHQ ─────`.
export const NAME_OFFSET = 3

export const withProjectName = (cells: { character: string; isMark: boolean }[], name: string) => {
  const label = ` ${name} `
  const fits = NAME_OFFSET + label.length < cells.length / 2
  if (!fits) {
    return cells
  }
  return cells.map((cell, column) => {
    const character = label[column - NAME_OFFSET]
    return character === undefined ? cell : { character, isMark: false }
  })
}

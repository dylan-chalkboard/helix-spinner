export const DEFAULT_FOCUS_MINUTES = 25
export const MAX_FOCUS_MINUTES = 180

export type FocusRequest = { action: 'start'; minutes: number } | { action: 'stop' } | { action: 'status' } | { action: 'invalid' }

// `/helix-focus` alone starts the default (or reports one running), `stop` cancels, a number sets the length.
export const parseFocusArgs = (args: string, isRunning: boolean): FocusRequest => {
  const choice = args.trim().toLowerCase()
  if (choice === '') {
    return isRunning ? { action: 'status' } : { action: 'start', minutes: DEFAULT_FOCUS_MINUTES }
  }
  if (choice === 'stop') {
    return { action: 'stop' }
  }
  const minutes = Number(choice)
  const isValidLength = Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_FOCUS_MINUTES
  return isValidLength ? { action: 'start', minutes } : { action: 'invalid' }
}

// "14:32", or "1:05:00" past an hour.
export const formatRemaining = (ms: number) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

// The divider as a progress bar: heavy for the time gone, light for the time left, the countdown at the end.
export const focusLine = (width: number, progress: number, remainingMs: number) => {
  const label = ` ⏱ ${formatRemaining(remainingMs)}`
  const barWidth = Math.max(0, width - label.length)
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * barWidth)
  return '━'.repeat(filled) + '─'.repeat(barWidth - filled) + label
}

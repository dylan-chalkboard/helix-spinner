export type HelixTurn = { turnId: string; startedAt: number; outputTokens: number; inputTokens: number; stepIndex: number }

export type HelixDex = { seen: string[]; shiny: string[] }

export type HelixToolGroup = 'shell' | 'read' | 'search' | 'edit' | 'web' | 'agents' | 'mcp'

// A tool running in the main loop right now, oldest first.
export type HelixRunningTool = { id: string; group: HelixToolGroup }

// The shell command that most recently failed, so the divider can flash red for it.
export type HelixFailure = { id: string }

// A focus timer running from `/helix-focus`, in epoch milliseconds.
export type HelixFocus = { startedAt: number; endsAt: number; minutes: number }

// The repo (or folder) this session works in, for its divider color; `branch` is null outside a repo.
export type HelixProject = { root: string; name: string; branch: string | null }

export type HelixAlerts = 'all' | 'special' | 'off'

// 'auto' follows the calendar, 'off' turns holiday packs off, anything else forces that pack.
export type HelixTheme = string

declare module 'claude-code' {
  interface PluginState {
    'helix-spinner': { turn: HelixTurn | null; dex: HelixDex; alerts: HelixAlerts; tipsOn: boolean; theme: HelixTheme; agents: string[]; tools: HelixRunningTool[]; introduced: string[]; failure: HelixFailure | null; focus: HelixFocus | null; project: HelixProject | null; projectColors: Record<string, string>; compacting: boolean }
  }
}

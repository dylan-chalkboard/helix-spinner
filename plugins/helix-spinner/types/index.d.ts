// `workMs` is time Claude spent generating or running tools, not waiting on the person.
export type HelixTurn = { turnId: string; startedAt: number; outputTokens: number; inputTokens: number; stepIndex: number; tools?: number; workMs?: number }

// `motions` holds the rare animations found; absent in a dex saved before they existed.
export type HelixDex = { seen: string[]; shiny: string[]; motions?: string[] }

export type HelixToolGroup = 'shell' | 'read' | 'search' | 'edit' | 'web' | 'agents' | 'mcp'

// A tool running in the main loop right now, oldest first.
export type HelixRunningTool = { id: string; group: HelixToolGroup }

// The shell command that most recently failed, so the divider can flash red for it.
export type HelixFailure = { id: string }

// A focus timer running from `/helix-focus`, in epoch milliseconds.
export type HelixFocus = { startedAt: number; endsAt: number; minutes: number }

// The repo (or folder) this session works in, for its divider color; `branch` is null outside a repo.
export type HelixProject = { root: string; name: string; branch: string | null }

// The tapper's lifetime progress: XP earned, taps made, and the longest combo.
// `earned` counts every spark ever won; what is left to spend is that less the upgrades' cost.
// `balance` marks which economy the totals were earned under; older saves are reset.
export type HelixTaps = { taps: number; bestCombo: number; earned: number; upgrades: Partial<Record<string, number>>; looks?: string[]; balance?: number }
export type HelixTapAck = { instance: string; total: { taps: number; sparks: number; bestCombo: number }; menu: number }

// The tap button's look: an unlocked style's id and the label inside it; null is the default.
export type HelixTapLook = { button: string | null; text: string | null }

export type HelixAlerts = 'all' | 'special' | 'off'

// 'auto' follows the calendar, 'off' turns holiday packs off, anything else forces that pack.
export type HelixTheme = string

declare module 'claude-code' {
  interface PluginState {
    'helix-spinner': { turn: HelixTurn | null; dex: HelixDex; alerts: HelixAlerts; tipsOn: boolean; theme: HelixTheme; agents: string[]; tools: HelixRunningTool[]; introduced: string[]; failure: HelixFailure | null; focus: HelixFocus | null; project: HelixProject | null; projectColors: Record<string, string>; compacting: boolean; taps: HelixTaps; tapLook: HelixTapLook; tapAck: HelixTapAck | null; tapTab: 'status' | 'shop' | 'tree' }
  }
}

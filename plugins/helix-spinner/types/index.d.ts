export type HelixTurn = { turnId: string; startedAt: number; outputTokens: number; inputTokens: number; stepIndex: number }

export type HelixDex = { seen: string[]; shiny: string[] }

export type HelixToolGroup = 'shell' | 'read' | 'search' | 'edit' | 'web' | 'agents' | 'mcp'

// A tool running in the main loop right now, oldest first.
export type HelixRunningTool = { id: string; group: HelixToolGroup }

export type HelixAlerts = 'all' | 'special' | 'off'

// 'auto' follows the calendar, 'off' turns holiday packs off, anything else forces that pack.
export type HelixTheme = string

declare module 'claude-code' {
  interface PluginState {
    'helix-spinner': { turn: HelixTurn | null; dex: HelixDex; alerts: HelixAlerts; tipsOn: boolean; theme: HelixTheme; agents: string[]; tools: HelixRunningTool[] }
  }
}

export type HelixTurn = { turnId: string; startedAt: number; outputTokens: number; inputTokens: number; stepIndex: number }

export type HelixDex = { seen: string[]; shiny: string[] }

export type HelixAlerts = 'all' | 'special' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'helix-spinner': { turn: HelixTurn | null; dex: HelixDex; alerts: HelixAlerts; tipsOn: boolean; agents: string[] }
  }
}

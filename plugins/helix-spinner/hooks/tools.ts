import type { HelixToolGroup } from '../types'

export type ToolGroup = HelixToolGroup

export const TOOL_GROUPS: readonly { group: ToolGroup; label: string; color: string; tools: readonly string[] }[] = [
  { group: 'shell', label: 'Shell', color: '#22c55e', tools: ['Bash'] },
  { group: 'read', label: 'Reading', color: '#d6d3d1', tools: ['Read'] },
  { group: 'search', label: 'Searching', color: '#2dd4bf', tools: ['Grep', 'Glob'] },
  { group: 'edit', label: 'Editing', color: '#f43f5e', tools: ['Edit', 'Write', 'NotebookEdit'] },
  { group: 'web', label: 'Web', color: '#818cf8', tools: ['WebSearch', 'WebFetch'] },
  { group: 'agents', label: 'Agents', color: '#a3e635', tools: ['Agent', 'Task'] },
  { group: 'mcp', label: 'MCP', color: '#e879f9', tools: [] },
]

// Which group a tool belongs to, or undefined for one that keeps the general tool-use look.
export const toolGroupOf = (tool: string): ToolGroup | undefined =>
  tool.startsWith('mcp__') ? 'mcp' : TOOL_GROUPS.find(({ tools }) => tools.includes(tool))?.group

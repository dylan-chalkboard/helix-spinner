type Outcome = { deny?: string; isError?: boolean }

// Only a shell command that ran and failed is worth flagging; a denied call never ran.
export const isFailedCommand = (tool: string, outcome: Outcome) =>
  tool === 'Bash' && outcome.deny === undefined && outcome.isError === true

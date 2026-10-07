export type TipLine = { kind: string; text: string; color?: string }

// Something going on right now with lines of its own; `after` is how long the turn must run before it applies.
export type Situation = { key: string; after: number; lines: readonly TipLine[] }

export const activeSituations = (situations: readonly Situation[], elapsedMs: number) =>
  situations.filter(situation => elapsedMs >= situation.after)

// While anything is going on, every other line comes from it.
export const tipAt = (regular: readonly TipLine[], active: readonly Situation[], index: number): TipLine | undefined => {
  const situational = active.flatMap(situation => situation.lines)
  if (situational.length === 0) {
    return regular.length > 0 ? regular[index % regular.length] : undefined
  }
  if (regular.length === 0 || index % 2 === 0) {
    return situational[Math.floor(index / 2) % situational.length]
  }
  return regular[Math.floor(index / 2) % regular.length]
}

// The first situation that has not had its moment yet this session.
export const firstUnintroduced = (active: readonly Situation[], introduced: readonly string[]) =>
  active.find(situation => !introduced.includes(situation.key) && situation.lines.length > 0)

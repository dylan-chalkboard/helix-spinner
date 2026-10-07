export const CELLS = 12
export const DOT_COLUMNS = CELLS * 2
export const DOT_ROWS = 4

// One animation: which braille dots are lit at time t, how deep each column sits
// (brighter in front), and where its glow centers, all in dot coordinates.
export type Pattern = {
  isLit: (x: number, y: number, t: number) => boolean
  depth?: (x: number, t: number) => number
  focus: (t: number) => number
}

export type Motion = { palette: string[]; speed: number; pattern: Pattern }

export const pingPong = (t: number, rate: number) => ((Math.sin(t * rate) + 1) / 2) * (DOT_COLUMNS - 1)

export const strandRow = (phase: number) => Math.round(((Math.sin(phase) + 1) / 2) * (DOT_ROWS - 1))

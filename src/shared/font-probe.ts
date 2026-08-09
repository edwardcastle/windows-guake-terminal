// Whether a font family is actually installed.
//
// document.fonts.check() cannot answer this: it returns true for any syntactically
// valid family, including names that do not exist. The reliable test is to render
// with the family in front of a generic and see whether the metrics move. If the
// family is missing, every stack collapses to its generic and the widths match
// exactly.
//
// The measurement is injected so the decision stays pure and testable; the
// renderer passes a canvas-backed measurer.

const GENERICS = ['monospace', 'serif', 'sans-serif'] as const

export type MeasureFont = (cssFontStack: string) => number

// A value containing a comma is a stack ("Cascadia Mono, Consolas, monospace"),
// which is expected to fall through to a later entry, so it is never "missing".
export function isFontStack(value: string): boolean {
  return value.includes(',')
}

export function isFontAvailable(measure: MeasureFont, family: string): boolean {
  const name = family.trim()
  if (!name) return false
  if (isFontStack(name)) return true
  return GENERICS.some((g) => measure(`"${name}", ${g}`) !== measure(g))
}

export function availableFonts(measure: MeasureFont, families: string[]): string[] {
  return families.filter((f) => isFontAvailable(measure, f))
}

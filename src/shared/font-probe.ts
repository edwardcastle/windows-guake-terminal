// Whether a font family is actually installed.
//
// document.fonts.check() cannot answer this: it returns true for any syntactically
// valid family, including names that do not exist. Comparing text width against a
// generic is better but still fooled by two cases -- a substitute whose metrics
// differ from the generic, and a font that shares its metrics with another.
//
// So compare what actually gets drawn. A family is rendered in front of a generic
// and its pixels compared against the same stack built from a name that certainly
// does not exist. If they match, the family is not installed: both fell through to
// the same fallback.
//
// Three anchors are needed because a generic can itself resolve to the candidate
// (on many Linux systems `monospace` *is* DejaVu Sans Mono). Differing from the
// missing-baseline under any one anchor proves the family resolved to something.
//
// Fingerprinting is injected so the decision stays pure and testable; the renderer
// supplies a canvas-backed implementation.

const ANCHORS = ['monospace', 'serif', 'sans-serif'] as const

// Not a font. Establishes what "fell back" looks like for each anchor.
export const MISSING_FAMILY = 'ZzQqNoSuchFamilyExists'

export type FingerprintFont = (cssFontStack: string) => string

export function fontStack(family: string, anchor: string): string {
  return `"${family}", ${anchor}`
}

// A value containing a comma is a stack ("Cascadia Mono, Consolas, monospace"),
// which is meant to fall through to a later entry, so it is never "missing".
export function isFontStack(value: string): boolean {
  return value.includes(',')
}

export function isFontAvailable(fingerprint: FingerprintFont, family: string): boolean {
  const name = family.trim()
  if (!name) return false
  if (isFontStack(name)) return true
  // Ordered cheapest-first: an installed monospace font settles on the first
  // anchor, so the extra two only run for families that look absent.
  return ANCHORS.some(
    (a) => fingerprint(fontStack(name, a)) !== fingerprint(fontStack(MISSING_FAMILY, a))
  )
}

export function availableFonts(fingerprint: FingerprintFont, families: string[]): string[] {
  return families.filter((f) => isFontAvailable(fingerprint, f))
}

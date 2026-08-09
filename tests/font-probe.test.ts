import { describe, expect, test } from 'vitest'
import {
  isFontAvailable, isFontStack, availableFonts, fontStack, MISSING_FAMILY
} from '../src/shared/font-probe'
import type { FingerprintFont } from '../src/shared/font-probe'

// Stands in for canvas rendering: an installed family draws its own glyphs,
// anything else draws whatever the anchor generic resolves to.
function fakeRender(installed: Record<string, string>): FingerprintFont {
  return (stack) => {
    const [quoted, anchor] = stack.split(', ')
    const family = quoted.replace(/"/g, '')
    return installed[family] ?? `pixels-of-${anchor}`
  }
}

describe('isFontAvailable', () => {
  const fp = fakeRender({ Consolas: 'pixels-of-consolas', 'Fira Code': 'pixels-of-fira' })

  test('an installed family draws its own glyphs', () => {
    expect(isFontAvailable(fp, 'Consolas')).toBe(true)
    expect(isFontAvailable(fp, 'Fira Code')).toBe(true)
  })

  test('a missing family is indistinguishable from a name that cannot exist', () => {
    expect(isFontAvailable(fp, 'Menlo')).toBe(false)
    expect(isFontAvailable(fp, 'Monaco')).toBe(false)
    expect(isFontAvailable(fp, MISSING_FAMILY)).toBe(false)
  })

  test('a family that IS the generic still counts as installed', () => {
    // On many Linux systems `monospace` resolves to DejaVu Sans Mono, so under
    // the monospace anchor it is identical to the fallback -- but under serif
    // and sans-serif it is not.
    const linux: FingerprintFont = (stack) => {
      const [quoted, anchor] = stack.split(', ')
      const family = quoted.replace(/"/g, '')
      if (family === 'DejaVu Sans Mono') return 'pixels-of-dejavu'
      return anchor === 'monospace' ? 'pixels-of-dejavu' : `pixels-of-${anchor}`
    }
    expect(isFontAvailable(linux, 'DejaVu Sans Mono')).toBe(true)
    expect(isFontAvailable(linux, 'Menlo')).toBe(false)
  })

  test('a substitute with different metrics is still caught by pixels', () => {
    // Width comparison would pass this: the substitute is not the generic. But
    // it draws exactly what every other missing family draws.
    const substituting: FingerprintFont = (stack) => {
      const anchor = stack.split(', ')[1]
      return anchor === 'monospace' ? 'pixels-of-substitute' : `pixels-of-${anchor}`
    }
    expect(isFontAvailable(substituting, 'Fira Code')).toBe(false)
  })

  test('blank is never available', () => {
    expect(isFontAvailable(fp, '')).toBe(false)
    expect(isFontAvailable(fp, '   ')).toBe(false)
  })

  test('surrounding whitespace is ignored', () => {
    expect(isFontAvailable(fp, '  Consolas  ')).toBe(true)
  })

  test('a stack is assumed fine -- it is meant to fall through', () => {
    expect(isFontAvailable(fp, 'Menlo, monospace')).toBe(true)
    expect(isFontAvailable(fp, 'Cascadia Mono, Consolas, monospace')).toBe(true)
  })
})

describe('fontStack', () => {
  test('quotes the family and appends the anchor', () => {
    expect(fontStack('Fira Code', 'monospace')).toBe('"Fira Code", monospace')
  })
})

describe('isFontStack', () => {
  test('detects comma-separated stacks', () => {
    expect(isFontStack('Consolas, monospace')).toBe(true)
    expect(isFontStack('Consolas')).toBe(false)
  })
})

describe('availableFonts', () => {
  test('drops families that are not installed, keeping order', () => {
    const fp = fakeRender({ Consolas: 'a', Hack: 'b' })
    expect(availableFonts(fp, ['Menlo', 'Consolas', 'Monaco', 'Hack'])).toEqual(['Consolas', 'Hack'])
  })

  test('an empty list stays empty', () => {
    expect(availableFonts(fakeRender({}), [])).toEqual([])
  })
})

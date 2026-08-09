import { describe, expect, test } from 'vitest'
import { isFontAvailable, isFontStack, availableFonts } from '../src/shared/font-probe'
import type { MeasureFont } from '../src/shared/font-probe'

// Stands in for canvas measureText: installed families get their own width,
// anything else collapses to the width of the generic it falls back to.
function fakeMeasure(installed: Record<string, number>): MeasureFont {
  const generics: Record<string, number> = { monospace: 100, serif: 110, 'sans-serif': 120 }
  return (stack) => {
    const [first, rest] = stack.split(', ')
    const family = first.replace(/"/g, '')
    if (generics[family] !== undefined) return generics[family]
    return installed[family] ?? generics[rest] ?? 0
  }
}

describe('isFontAvailable', () => {
  const measure = fakeMeasure({ Consolas: 42, 'Fira Code': 43 })

  test('an installed family shifts the metrics', () => {
    expect(isFontAvailable(measure, 'Consolas')).toBe(true)
    expect(isFontAvailable(measure, 'Fira Code')).toBe(true)
  })

  test('a missing family collapses to every generic', () => {
    expect(isFontAvailable(measure, 'Menlo')).toBe(false)
    expect(isFontAvailable(measure, 'ZzQqNotAFont')).toBe(false)
  })

  test('blank is never available', () => {
    expect(isFontAvailable(measure, '')).toBe(false)
    expect(isFontAvailable(measure, '   ')).toBe(false)
  })

  test('surrounding whitespace is ignored', () => {
    expect(isFontAvailable(measure, '  Consolas  ')).toBe(true)
  })

  test('a stack is assumed fine -- it is meant to fall through', () => {
    expect(isFontAvailable(measure, 'Menlo, monospace')).toBe(true)
    expect(isFontAvailable(measure, 'Cascadia Mono, Consolas, monospace')).toBe(true)
  })

  test('a family matching only one generic still counts as installed', () => {
    // Same width as monospace but not as serif/sans-serif.
    const m: MeasureFont = (stack) =>
      stack.startsWith('"Oddball"') ? (stack.endsWith('monospace') ? 100 : 55) : fakeMeasure({})(stack)
    expect(isFontAvailable(m, 'Oddball')).toBe(true)
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
    const measure = fakeMeasure({ Consolas: 42, Hack: 44 })
    expect(availableFonts(measure, ['Menlo', 'Consolas', 'Monaco', 'Hack'])).toEqual(['Consolas', 'Hack'])
  })

  test('an empty list stays empty', () => {
    expect(availableFonts(fakeMeasure({}), [])).toEqual([])
  })
})

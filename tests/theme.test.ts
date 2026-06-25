import { describe, expect, test } from 'vitest'
import {
  BUILTIN_THEMES, THEME_COLOR_KEYS, isHexColor, parseHex, toHex,
  isTerminalTheme, resolveTheme
} from '../src/shared/theme'

describe('hex helpers', () => {
  test('isHexColor accepts 3- and 6-digit hex, rejects others', () => {
    expect(isHexColor('#fff')).toBe(true)
    expect(isHexColor('#ff8800')).toBe(true)
    expect(isHexColor('fff')).toBe(false)
    expect(isHexColor('#ggg')).toBe(false)
    expect(isHexColor(42)).toBe(false)
  })

  test('parseHex expands shorthand and toHex round-trips', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(toHex({ r: 128, g: 128, b: 128 })).toBe('#808080')
    expect(toHex(parseHex('#bd93f9'))).toBe('#bd93f9')
  })
})

describe('themes', () => {
  test('every built-in is a complete theme', () => {
    for (const name of Object.keys(BUILTIN_THEMES)) {
      expect(isTerminalTheme(BUILTIN_THEMES[name])).toBe(true)
    }
    expect(Object.keys(BUILTIN_THEMES).length).toBe(11)
    expect(THEME_COLOR_KEYS.length).toBe(21)
  })

  test('isTerminalTheme rejects missing or non-hex colors', () => {
    expect(isTerminalTheme({ ...BUILTIN_THEMES.dracula, red: 'tomato' })).toBe(false)
    const { red, ...missing } = BUILTIN_THEMES.dracula
    expect(isTerminalTheme(missing)).toBe(false)
    expect(isTerminalTheme(null)).toBe(false)
  })

  test('resolveTheme prefers custom, then built-in, else dracula', () => {
    const mine = { ...BUILTIN_THEMES.nord }
    expect(resolveTheme('mine', { mine })).toBe(mine)
    expect(resolveTheme('nord')).toBe(BUILTIN_THEMES.nord)
    expect(resolveTheme('does-not-exist')).toBe(BUILTIN_THEMES.dracula)
  })
})

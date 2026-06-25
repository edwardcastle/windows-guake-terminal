import { describe, expect, test } from 'vitest'
import {
  BUILTIN_THEMES, THEME_COLOR_KEYS, isHexColor, parseHex, toHex,
  isTerminalTheme, resolveTheme,
  mix, relativeLuminance, isLight, deriveAccent, uiPalette,
  resolveAppearance
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

describe('palette math', () => {
  test('mix blends two colors at t', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  test('relativeLuminance ranks white above black', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeGreaterThan(relativeLuminance('#808080'))
  })

  test('isLight is true only for light backgrounds', () => {
    expect(isLight(BUILTIN_THEMES['solarized-light'])).toBe(true)
    expect(isLight(BUILTIN_THEMES.dracula)).toBe(false)
  })

  test('deriveAccent returns override when hex, else theme blue', () => {
    expect(deriveAccent(BUILTIN_THEMES.dracula, '#ff0000')).toBe('#ff0000')
    expect(deriveAccent(BUILTIN_THEMES.dracula, '')).toBe(BUILTIN_THEMES.dracula.blue)
    expect(deriveAccent(BUILTIN_THEMES.dracula, 'garbage')).toBe(BUILTIN_THEMES.dracula.blue)
  })

  test('uiPalette passes through and derives a matching-lightness chrome', () => {
    const dark = uiPalette(BUILTIN_THEMES.dracula, '')
    expect(dark.termBg).toBe(BUILTIN_THEMES.dracula.background)
    expect(dark.uiFg).toBe(BUILTIN_THEMES.dracula.foreground)
    expect(dark.uiAccent).toBe(BUILTIN_THEMES.dracula.blue)
    expect(relativeLuminance(dark.uiBg)).toBeLessThan(0.5)

    const light = uiPalette(BUILTIN_THEMES['solarized-light'], '#112233')
    expect(light.uiAccent).toBe('#112233')
    expect(relativeLuminance(light.uiBg)).toBeGreaterThan(0.5)
  })
})

describe('resolveAppearance', () => {
  const globals = { theme: 'dracula', fontFamily: 'Cascadia Mono', fontSize: 14 }

  test('returns globals when no profile overrides', () => {
    expect(resolveAppearance(globals)).toEqual(globals)
    expect(resolveAppearance(globals, {})).toEqual(globals)
  })

  test('profile overrides win field-by-field', () => {
    expect(resolveAppearance(globals, { theme: 'nord' }))
      .toEqual({ theme: 'nord', fontFamily: 'Cascadia Mono', fontSize: 14 })
    expect(resolveAppearance(globals, { fontSize: 20 }))
      .toEqual({ theme: 'dracula', fontFamily: 'Cascadia Mono', fontSize: 20 })
  })
})

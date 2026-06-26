import { describe, expect, test } from 'vitest'
import { DEFAULT_CONFIG, mergeConfig } from '../src/shared/config'
import { BUILTIN_THEMES } from '../src/shared/theme'

describe('mergeConfig', () => {
  test('empty input returns defaults', () => {
    expect(mergeConfig({})).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig('junk')).toEqual(DEFAULT_CONFIG)
  })

  test('valid overrides are kept', () => {
    const c = mergeConfig({ fontSize: 18, hideOnBlur: false, theme: 'gruvbox-dark' })
    expect(c.fontSize).toBe(18)
    expect(c.hideOnBlur).toBe(false)
    expect(c.theme).toBe('gruvbox-dark')
  })

  test('invalid types and out-of-range numbers fall back per-field', () => {
    const c = mergeConfig({ fontSize: 'big', opacity: 7, heightPct: 45 })
    expect(c.fontSize).toBe(DEFAULT_CONFIG.fontSize)
    expect(c.opacity).toBe(DEFAULT_CONFIG.opacity)
    expect(c.heightPct).toBe(45)
  })

  test('keybindings merge per-key', () => {
    const c = mergeConfig({ keybindings: { newTab: 'Ctrl+N', bogus: 'X', closePane: 42 } })
    expect(c.keybindings.newTab).toBe('Ctrl+N')
    expect(c.keybindings.closePane).toBe(DEFAULT_CONFIG.keybindings.closePane)
    expect('bogus' in c.keybindings).toBe(false)
  })

  test('malformed profiles are filtered out', () => {
    const good = { id: 'cmd', name: 'cmd', exe: 'cmd.exe', args: [] }
    const c = mergeConfig({ profiles: [good, { id: 'x' }, 'junk'] })
    expect(c.profiles).toEqual([good])
  })
})

describe('mergeConfig appearance fields', () => {
  test('defaults include the new fields', () => {
    const c = mergeConfig({})
    expect(c.customThemes).toEqual({})
    expect(c.accent).toBe('')
    expect(c.cursorStyle).toBe('block')
    expect(c.cursorBlink).toBe(true)
    expect(c.fontWeight).toBe(400)
    expect(c.letterSpacing).toBe(0)
    expect(c.padding).toBe(6)
  })

  test('cursorStyle accepts the enum, else falls back', () => {
    expect(mergeConfig({ cursorStyle: 'bar' }).cursorStyle).toBe('bar')
    expect(mergeConfig({ cursorStyle: 'fancy' }).cursorStyle).toBe('block')
  })

  test('numeric appearance fields clamp to range', () => {
    expect(mergeConfig({ fontWeight: 700 }).fontWeight).toBe(700)
    expect(mergeConfig({ fontWeight: 5000 }).fontWeight).toBe(400)
    expect(mergeConfig({ letterSpacing: 1 }).letterSpacing).toBe(1)
    expect(mergeConfig({ letterSpacing: -9 }).letterSpacing).toBe(0)
    expect(mergeConfig({ padding: 12 }).padding).toBe(12)
    expect(mergeConfig({ padding: 99 }).padding).toBe(6)
  })

  test('accent keeps strings, rejects non-strings', () => {
    expect(mergeConfig({ accent: '#abcdef' }).accent).toBe('#abcdef')
    expect(mergeConfig({ accent: 42 }).accent).toBe('')
  })

  test('customThemes keep valid entries and drop malformed', () => {
    const c = mergeConfig({
      customThemes: { good: BUILTIN_THEMES.nord, bad: { background: '#000' } }
    })
    expect(c.customThemes.good).toEqual(BUILTIN_THEMES.nord)
    expect('bad' in c.customThemes).toBe(false)
  })

  test('profile appearance overrides are validated, profile still loads', () => {
    const base = { id: 'ps', name: 'PowerShell', exe: 'pwsh.exe', args: [] }
    const c = mergeConfig({
      profiles: [{
        ...base, color: '#ff8800', theme: 'nord', fontFamily: 'Hack',
        fontSize: 99
      }]
    })
    const p = c.profiles[0]
    expect(p.color).toBe('#ff8800')
    expect(p.theme).toBe('nord')
    expect(p.fontFamily).toBe('Hack')
    expect('fontSize' in p).toBe(false) // 99 out of range -> dropped

    const c2 = mergeConfig({ profiles: [{ ...base, color: 'notacolor' }] })
    expect('color' in c2.profiles[0]).toBe(false)
  })
})

import { describe, expect, test } from 'vitest'
import { DEFAULT_CONFIG, mergeConfig } from '../src/shared/config'

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

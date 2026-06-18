import { describe, expect, test } from 'vitest'
import { parseCombo, comboMatches, matchAction } from '../src/shared/keys'

const ev = (key: string, mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt
})

describe('parseCombo', () => {
  test('parses modifiers and key', () => {
    expect(parseCombo('Ctrl+Shift+T')).toEqual({ ctrl: true, shift: true, alt: false, key: 't' })
    expect(parseCombo('Alt+ArrowLeft')).toEqual({ ctrl: false, shift: false, alt: true, key: 'ArrowLeft' })
    expect(parseCombo('Ctrl+=')).toEqual({ ctrl: true, shift: false, alt: false, key: '=' })
    expect(parseCombo('Ctrl+,')).toEqual({ ctrl: true, shift: false, alt: false, key: ',' })
  })
})

describe('comboMatches', () => {
  test('matches case-insensitively on single chars', () => {
    expect(comboMatches(parseCombo('Ctrl+Shift+C'), ev('C', { ctrl: true, shift: true }))).toBe(true)
  })
  test('rejects wrong modifiers', () => {
    expect(comboMatches(parseCombo('Ctrl+Shift+C'), ev('c', { ctrl: true }))).toBe(false)
  })
  test('matches named keys exactly', () => {
    expect(comboMatches(parseCombo('Ctrl+Tab'), ev('Tab', { ctrl: true }))).toBe(true)
    expect(comboMatches(parseCombo('Ctrl+Shift+Tab'), ev('Tab', { ctrl: true, shift: true }))).toBe(true)
  })
})

describe('matchAction', () => {
  const kb = { newTab: 'Ctrl+Shift+T', find: 'Ctrl+Shift+F' }
  test('returns the matching action name', () => {
    expect(matchAction(kb, ev('t', { ctrl: true, shift: true }))).toBe('newTab')
  })
  test('returns null when nothing matches', () => {
    expect(matchAction(kb, ev('x', { ctrl: true }))).toBeNull()
  })
})

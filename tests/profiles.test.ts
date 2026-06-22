import { describe, expect, test } from 'vitest'
import { detectProfiles, listWslDistros } from '../src/main/profiles'

describe('listWslDistros', () => {
  test('decodes UTF-16LE output and filters docker distros', () => {
    const out = Buffer.from('Ubuntu\r\ndocker-desktop\r\nDebian\r\n', 'utf16le')
    expect(listWslDistros(() => out)).toEqual(['Ubuntu', 'Debian'])
  })

  test('returns empty when wsl.exe fails', () => {
    expect(listWslDistros(() => { throw new Error('not installed') })).toEqual([])
  })
})

describe('detectProfiles', () => {
  test('detects Windows shells on win32 and a POSIX shell elsewhere', () => {
    const ids = detectProfiles().map((p) => p.id)
    if (process.platform === 'win32') {
      expect(ids).toContain('powershell')
      expect(ids).toContain('cmd')
    } else {
      expect(ids).toContain('shell')
    }
  })
})

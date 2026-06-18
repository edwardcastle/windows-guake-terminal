import { describe, expect, test } from 'vitest'
import { listWslDistros } from '../src/main/profiles'

describe('listWslDistros', () => {
  test('decodes UTF-16LE output and filters docker distros', () => {
    const out = Buffer.from('Ubuntu\r\ndocker-desktop\r\nDebian\r\n', 'utf16le')
    expect(listWslDistros(() => out)).toEqual(['Ubuntu', 'Debian'])
  })

  test('returns empty when wsl.exe fails', () => {
    expect(listWslDistros(() => { throw new Error('not installed') })).toEqual([])
  })
})

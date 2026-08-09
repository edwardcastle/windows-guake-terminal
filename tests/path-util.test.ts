import { describe, expect, test } from 'vitest'
import { relativePath } from '../src/shared/path-util'

describe('relativePath', () => {
  test('child path becomes relative to the directory', () => {
    expect(relativePath('/home/u/proj', '/home/u/proj/src/a.ts')).toBe('src/a.ts')
  })
  test('sibling path walks up', () => {
    expect(relativePath('/home/u/proj', '/home/u/other/b.ts')).toBe('../other/b.ts')
  })
  test('same directory yields .', () => {
    expect(relativePath('/home/u/proj', '/home/u/proj')).toBe('.')
  })
  test('windows backslashes normalize on the same drive', () => {
    expect(relativePath('C:\\Users\\me\\proj', 'C:\\Users\\me\\proj\\src\\a.ts')).toBe('src/a.ts')
  })
  test('different windows drive stays absolute', () => {
    expect(relativePath('C:\\a', 'D:\\b\\c.txt')).toBe('D:\\b\\c.txt')
  })
  test('empty directory returns the path unchanged', () => {
    expect(relativePath('', '/x/y')).toBe('/x/y')
  })
})

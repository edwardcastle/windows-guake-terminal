import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ConfigStore } from '../src/main/config-store'
import { DEFAULT_CONFIG } from '../src/shared/config'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-test-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('ConfigStore', () => {
  test('missing file loads defaults, not corrupt', () => {
    const s = new ConfigStore(dir)
    expect(s.load()).toEqual(DEFAULT_CONFIG)
    expect(s.corrupt).toBe(false)
  })

  test('set() persists and survives reload', () => {
    const s = new ConfigStore(dir)
    s.load()
    s.set({ fontSize: 20 })
    s.flush()
    const s2 = new ConfigStore(dir)
    expect(s2.load().fontSize).toBe(20)
  })

  test('set() debounces the write; flush persists it', () => {
    const s = new ConfigStore(dir)
    s.load()
    s.set({ fontSize: 22 })
    expect(fs.existsSync(s.file)).toBe(false) // not written synchronously
    s.flush()
    expect(JSON.parse(fs.readFileSync(s.file, 'utf8')).fontSize).toBe(22)
  })

  test('corrupt file: backed up, defaults loaded, flagged', () => {
    fs.writeFileSync(path.join(dir, 'config.json'), '{not json!!')
    const s = new ConfigStore(dir)
    expect(s.load()).toEqual(DEFAULT_CONFIG)
    expect(s.corrupt).toBe(true)
    expect(fs.existsSync(path.join(dir, 'config.json.bak'))).toBe(true)
  })

  test('invalid fields fall back individually, valid kept', () => {
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ fontSize: 'nope', heightPct: 60 })
    )
    const s = new ConfigStore(dir)
    const c = s.load()
    expect(c.fontSize).toBe(DEFAULT_CONFIG.fontSize)
    expect(c.heightPct).toBe(60)
    expect(s.corrupt).toBe(false)
  })
})

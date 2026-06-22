import { describe, expect, test } from 'vitest'
import { PtyManager, PtyLike, SpawnFn } from '../src/main/pty-manager'

class FakePty implements PtyLike {
  written: string[] = []
  size = { cols: 0, rows: 0 }
  killed = false
  private dataCb: ((d: string) => void) | null = null
  private exitCb: ((e: { exitCode: number }) => void) | null = null

  write(d: string) { this.written.push(d) }
  resize(cols: number, rows: number) { this.size = { cols, rows } }
  kill() { this.killed = true }
  onData(cb: (d: string) => void) { this.dataCb = cb }
  onExit(cb: (e: { exitCode: number }) => void) { this.exitCb = cb }

  emitData(d: string) { this.dataCb?.(d) }
  emitExit(code: number) { this.exitCb?.({ exitCode: code }) }
}

const profile = { id: 'cmd', name: 'cmd', exe: 'cmd.exe', args: [] }

function setup() {
  const spawned: FakePty[] = []
  const spawnFn: SpawnFn = () => {
    const p = new FakePty()
    spawned.push(p)
    return p
  }
  return { mgr: new PtyManager(spawnFn), spawned }
}

describe('PtyManager', () => {
  test('spawn wires data and exit callbacks', () => {
    const { mgr, spawned } = setup()
    const data: string[] = []
    let exit = -1
    mgr.spawn('a', profile, 80, 24, (d) => data.push(d), (c) => { exit = c })
    spawned[0].emitData('hello')
    expect(data).toEqual(['hello'])
    spawned[0].emitExit(0)
    expect(exit).toBe(0)
  })

  test('write and resize route to the right pty', () => {
    const { mgr, spawned } = setup()
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    mgr.spawn('b', profile, 80, 24, () => {}, () => {})
    mgr.write('b', 'x')
    mgr.resize('a', 100, 30)
    expect(spawned[1].written).toEqual(['x'])
    expect(spawned[0].size).toEqual({ cols: 100, rows: 30 })
  })

  test('respawning the same id kills the old pty', () => {
    const { mgr, spawned } = setup()
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    expect(spawned[0].killed).toBe(true)
    expect(spawned).toHaveLength(2)
  })

  test('a late exit from a replaced pty does not unregister the new one', () => {
    const { mgr, spawned } = setup()
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    spawned[0].emitExit(0) // old pty's delayed exit fires after replacement
    mgr.write('a', 'hi')
    expect(spawned[1].written).toEqual(['hi'])
  })

  test('exit removes the pty; killAll kills everything', () => {
    const { mgr, spawned } = setup()
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    mgr.spawn('b', profile, 80, 24, () => {}, () => {})
    spawned[0].emitExit(1)
    mgr.write('a', 'ignored')
    expect(spawned[0].written).toEqual([])
    mgr.killAll()
    expect(spawned[1].killed).toBe(true)
  })
})

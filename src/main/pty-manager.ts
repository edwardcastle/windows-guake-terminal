import type { Profile } from '../shared/config'

export interface PtyLike {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
}

export interface SpawnOpts {
  cols: number
  rows: number
  cwd: string
  env: NodeJS.ProcessEnv
}

export type SpawnFn = (exe: string, args: string[], opts: SpawnOpts) => PtyLike

export class PtyManager {
  private ptys = new Map<string, PtyLike>()

  constructor(private spawnFn: SpawnFn) {}

  spawn(
    id: string,
    profile: Profile,
    cols: number,
    rows: number,
    onData: (d: string) => void,
    onExit: (code: number) => void,
    cwd?: string
  ): void {
    this.kill(id)
    const pty = this.spawnFn(profile.exe, profile.args, {
      cols,
      rows,
      cwd: cwd || profile.cwd || process.env.USERPROFILE || process.env.HOME || (process.platform === 'win32' ? 'C:\\' : '/'),
      env: process.env
    })
    pty.onData(onData)
    pty.onExit(({ exitCode }) => {
      if (this.ptys.get(id) === pty) this.ptys.delete(id)
      onExit(exitCode)
    })
    this.ptys.set(id, pty)
  }

  write(id: string, data: string): void { this.ptys.get(id)?.write(data) }
  resize(id: string, cols: number, rows: number): void { this.ptys.get(id)?.resize(cols, rows) }

  kill(id: string): void {
    const p = this.ptys.get(id)
    if (p) {
      this.ptys.delete(id)
      p.kill()
    }
  }

  killAll(): void {
    for (const id of [...this.ptys.keys()]) this.kill(id)
  }
}

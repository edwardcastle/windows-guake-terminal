import fs from 'node:fs'
import path from 'node:path'
import { Config, DEFAULT_CONFIG, mergeConfig } from '../shared/config'

export class ConfigStore {
  readonly file: string
  config: Config = DEFAULT_CONFIG
  corrupt = false
  private writeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(dir: string) {
    this.file = path.join(dir, 'config.json')
    fs.mkdirSync(dir, { recursive: true })
  }

  load(): Config {
    this.corrupt = false
    if (fs.existsSync(this.file)) {
      try {
        this.config = mergeConfig(JSON.parse(fs.readFileSync(this.file, 'utf8')))
      } catch {
        fs.copyFileSync(this.file, this.file + '.bak')
        this.config = { ...DEFAULT_CONFIG }
        this.corrupt = true
      }
    } else {
      this.config = { ...DEFAULT_CONFIG }
    }
    return this.config
  }

  set(patch: Partial<Config>): Config {
    this.config = mergeConfig({ ...this.config, ...patch })
    // Update in-memory immediately (callers broadcast synchronously); debounce
    // the disk write so live edits (e.g. dragging a color swatch) don't trigger
    // a serialize + blocking write per change.
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flush(), 150)
    return this.config
  }

  // Force any pending debounced write to disk now, atomically (tmp + rename) so
  // a crash mid-write can't corrupt config.json.
  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2))
    fs.renameSync(tmp, this.file)
  }
}

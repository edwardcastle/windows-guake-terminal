import fs from 'node:fs'
import path from 'node:path'
import { Config, DEFAULT_CONFIG, mergeConfig } from '../shared/config'

export class ConfigStore {
  readonly file: string
  config: Config = DEFAULT_CONFIG
  corrupt = false

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
    fs.writeFileSync(this.file, JSON.stringify(this.config, null, 2))
    return this.config
  }
}

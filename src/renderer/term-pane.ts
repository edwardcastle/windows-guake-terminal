import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import type { Config } from '../shared/config'
import { themeOf } from './themes'

export class TermPane {
  readonly el = document.createElement('div')
  readonly term: Terminal
  readonly fit = new FitAddon()
  readonly search = new SearchAddon()
  exited = false
  onTitle?: (title: string) => void

  constructor(
    readonly id: string,
    readonly profileId: string,
    cfg: Config
  ) {
    this.el.className = 'pane'
    this.term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      scrollback: 10000,
      fontFamily: cfg.fontFamily,
      fontSize: cfg.fontSize,
      lineHeight: cfg.lineHeight,
      theme: themeOf(cfg.theme)
    })
    this.term.loadAddon(this.fit)
    this.term.loadAddon(this.search)
    this.term.loadAddon(new WebLinksAddon())
    this.term.open(this.el)
    try {
      this.term.loadAddon(new WebglAddon())
    } catch {
      // WebGL unavailable — xterm falls back to the DOM renderer
    }
    this.term.onData((d) => {
      if (!this.exited) window.api.write(this.id, d)
    })
    this.term.onResize(({ cols, rows }) => window.api.resize(this.id, cols, rows))
    this.term.onTitleChange((t) => this.onTitle?.(t))
    this.term.attachCustomKeyEventHandler((e) => {
      if (this.exited && e.type === 'keydown' && e.key === 'Enter') {
        this.respawn()
        return false
      }
      return true
    })
    new ResizeObserver(() => this.fitNow()).observe(this.el)
    this.el.addEventListener('contextmenu', async (e) => {
      e.preventDefault()
      const text = await navigator.clipboard.readText()
      if (text && !this.exited) window.api.write(this.id, text)
    })
  }

  async spawnShell(): Promise<void> {
    this.exited = false
    this.fitNow()
    const err = await window.api.spawn(this.id, this.profileId, this.term.cols, this.term.rows)
    if (err) {
      this.exited = true
      this.term.writeln(`\x1b[31mfailed to start: ${err}\x1b[0m`)
      this.term.writeln('\x1b[2mpress Enter to retry\x1b[0m')
    }
  }

  respawn(): void {
    this.term.reset()
    void this.spawnShell()
  }

  handleExit(code: number): void {
    this.exited = true
    this.term.writeln(
      `\r\n\x1b[2m[process exited with code ${code}] — press Enter to restart\x1b[0m`
    )
  }

  fitNow(): void {
    if (this.el.clientWidth > 0 && this.el.clientHeight > 0) this.fit.fit()
  }

  applyConfig(cfg: Config): void {
    this.term.options.fontFamily = cfg.fontFamily
    this.term.options.fontSize = cfg.fontSize
    this.term.options.lineHeight = cfg.lineHeight
    this.term.options.theme = themeOf(cfg.theme)
    this.fitNow()
  }

  setFontSize(px: number): void {
    this.term.options.fontSize = px
    this.fitNow()
  }

  dispose(): void {
    window.api.kill(this.id)
    this.term.dispose()
    this.el.remove()
  }
}

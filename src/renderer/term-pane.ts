import { Terminal } from '@xterm/xterm'
import type { FontWeight } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import type { Config, Profile } from '../shared/config'
import { resolveAppearance, resolveTheme } from '../shared/theme'

export class TermPane {
  readonly el = document.createElement('div')
  readonly term: Terminal
  readonly fit = new FitAddon()
  readonly search = new SearchAddon()
  readonly profileId: string
  exited = false
  onTitle?: (title: string) => void

  constructor(
    readonly id: string,
    profile: Profile | undefined,
    cfg: Config
  ) {
    this.profileId = profile?.id ?? ''
    this.el.className = 'pane'
    const app = resolveAppearance(cfg, profile)
    this.term = new Terminal({
      allowProposedApi: true,
      cursorBlink: cfg.cursorBlink,
      cursorStyle: cfg.cursorStyle,
      fontWeight: cfg.fontWeight as FontWeight,
      letterSpacing: cfg.letterSpacing,
      scrollback: 10000,
      fontFamily: app.fontFamily,
      fontSize: app.fontSize,
      lineHeight: cfg.lineHeight,
      theme: resolveTheme(app.theme, cfg.customThemes)
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
    const profile = cfg.profiles.find((p) => p.id === this.profileId)
    const app = resolveAppearance(cfg, profile)
    const o = this.term.options
    o.fontFamily = app.fontFamily
    o.fontSize = app.fontSize
    o.lineHeight = cfg.lineHeight
    o.fontWeight = cfg.fontWeight as FontWeight
    o.letterSpacing = cfg.letterSpacing
    o.cursorStyle = cfg.cursorStyle
    o.cursorBlink = cfg.cursorBlink
    o.theme = resolveTheme(app.theme, cfg.customThemes)
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

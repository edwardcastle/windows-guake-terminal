import { Terminal } from '@xterm/xterm'
import type { FontWeight } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import type { Config, Profile } from '../shared/config'
import type { TerminalTheme } from '../shared/theme'
import { resolveAppearance, resolveTheme } from '../shared/theme'
import { relativePath } from '../shared/path-util'
import { openContextMenu } from './context-menu'

// When a background image is set the terminal background must be see-through.
function termTheme(cfg: Config, themeName: string): TerminalTheme {
  const t = resolveTheme(themeName, cfg.customThemes)
  return cfg.backgroundImage ? { ...t, background: 'rgba(0,0,0,0)' } : t
}

export class TermPane {
  readonly el = document.createElement('div')
  readonly term: Terminal
  readonly fit = new FitAddon()
  readonly search = new SearchAddon()
  readonly profileId: string
  cwd?: string
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
      // Only allow transparency when a background image is set — with the WebGL
      // renderer it otherwise blends the text and shifts the theme's colors.
      allowTransparency: !!cfg.backgroundImage,
      cursorBlink: cfg.cursorBlink,
      cursorStyle: cfg.cursorStyle,
      fontWeight: cfg.fontWeight as FontWeight,
      letterSpacing: cfg.letterSpacing,
      scrollback: cfg.scrollback,
      fontFamily: app.fontFamily,
      fontSize: app.fontSize,
      lineHeight: cfg.lineHeight,
      theme: termTheme(cfg, app.theme)
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
    // OSC 7 reports the shell's working directory (file://host/path); track it so
    // new tabs/splits can open in the same directory.
    this.term.parser.registerOscHandler(7, (uri) => {
      try {
        const p = decodeURIComponent(new URL(uri).pathname)
        this.cwd = /^\/[a-zA-Z]:/.test(p) ? p.slice(1) : p
      } catch {
        // malformed OSC 7 payload — ignore
      }
      return false
    })
    this.term.attachCustomKeyEventHandler((e) => {
      if (this.exited && e.type === 'keydown' && e.key === 'Enter') {
        this.respawn()
        return false
      }
      return true
    })
    new ResizeObserver(() => this.fitNow()).observe(this.el)
    this.el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const sel = this.term.getSelection()
      openContextMenu(e.clientX, e.clientY, [
        { label: 'Copy', disabled: !sel, onClick: () => { if (sel) void navigator.clipboard.writeText(sel) } },
        { label: 'Paste', onClick: () => void this.paste() },
        { label: 'Select all', onClick: () => this.term.selectAll() },
        { label: 'Clear', onClick: () => this.term.clear() }
      ])
    })
    // Drag files in: insert each path (relative to the pane's cwd when known),
    // quoted if it contains spaces.
    this.el.addEventListener('dragover', (e) => e.preventDefault())
    this.el.addEventListener('drop', (e) => {
      e.preventDefault()
      const files = e.dataTransfer?.files
      if (!files || !files.length || this.exited) return
      const paths = Array.from(files)
        .map((f) => window.api.getPathForFile(f))
        .filter(Boolean)
        .map((abs) => {
          const rel = this.cwd ? relativePath(this.cwd, abs) : abs
          return /\s/.test(rel) ? `"${rel}"` : rel
        })
      if (paths.length) this.term.paste(paths.join(' '))
    })
  }

  // Bracketed-paste-safe: term.paste() wraps the text in paste markers when the
  // running app enabled bracketed paste, so newlines don't auto-execute.
  async paste(): Promise<void> {
    const text = await navigator.clipboard.readText()
    if (text && !this.exited) this.term.paste(text)
  }

  async spawnShell(cwd?: string): Promise<void> {
    this.exited = false
    this.fitNow()
    const err = await window.api.spawn(this.id, this.profileId, this.term.cols, this.term.rows, cwd ?? this.cwd)
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
    o.scrollback = cfg.scrollback
    o.theme = termTheme(cfg, app.theme)
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

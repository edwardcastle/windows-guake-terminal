import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import type { Config } from '../shared/config'

export class WindowManager {
  readonly win: BrowserWindow
  private animating = false

  constructor(private getConfig: () => Config) {
    // setOpacity() is a no-op on Linux, so opacity there is driven by a
    // transparent window + CSS opacity in the renderer. Windows/macOS keep the
    // native setOpacity path (see applyAppearance).
    const transparent = process.platform === 'linux'
    this.win = new BrowserWindow({
      show: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      transparent,
      backgroundColor: transparent ? '#00000000' : '#282a36',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.on('blur', () => {
      if (this.getConfig().hideOnBlur && !this.win.webContents.isDevToolsFocused()) {
        this.hide()
      }
    })
  }

  private targetBounds(): { x: number; y: number; width: number; height: number } {
    const cfg = this.getConfig()
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const wa = display.workArea
    const width = Math.round((wa.width * cfg.widthPct) / 100)
    const height = Math.round((wa.height * cfg.heightPct) / 100)
    return { x: wa.x + Math.round((wa.width - width) / 2), y: wa.y, width, height }
  }

  toggle(): void {
    if (this.win.isVisible() && this.win.isFocused()) this.hide()
    else if (this.win.isVisible()) this.win.focus() // Guake behavior: refocus, don't hide
    else this.show()
  }

  show(): void {
    if (this.animating) return
    if (this.win.isVisible()) {
      this.win.focus()
      return
    }
    const b = this.targetBounds()
    const ms = this.getConfig().animationMs
    if (ms === 0) {
      this.win.setBounds(b)
      this.win.show()
      return
    }
    this.win.setBounds({ ...b, y: b.y - b.height })
    this.win.show()
    this.animate(b.y - b.height, b.y, ms, (y) => this.win.setBounds({ ...b, y }))
  }

  hide(): void {
    if (this.animating || !this.win.isVisible()) return
    const b = this.win.getBounds()
    const ms = this.getConfig().animationMs
    if (ms === 0) {
      this.win.hide()
      return
    }
    this.animate(b.y, b.y - b.height, ms, (y) => this.win.setBounds({ ...b, y }), () =>
      this.win.hide()
    )
  }

  private animate(
    from: number, to: number, ms: number,
    step: (y: number) => void, done?: () => void
  ): void {
    this.animating = true
    const start = Date.now()
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / ms)
      const eased = 1 - (1 - t) * (1 - t) // ease-out
      step(Math.round(from + (to - from) * eased))
      if (t >= 1) {
        clearInterval(timer)
        this.animating = false
        done?.()
      }
    }, 16)
  }

  applyAppearance(): void {
    const cfg = this.getConfig()
    this.win.setOpacity(cfg.opacity)
    // setBackgroundMaterial is a Windows-only effect. On Linux, calling it with
    // 'none' resets the window to an opaque material, which clobbers the
    // transparent visual that CSS opacity relies on — so only touch it on Windows.
    if (process.platform === 'win32') {
      try {
        this.win.setBackgroundMaterial(cfg.acrylic ? 'acrylic' : 'none')
      } catch {
        // pre-Win11 — acrylic unsupported, opacity still applies
      }
    }
    if (this.win.isVisible() && !this.animating) this.win.setBounds(this.targetBounds())
  }
}

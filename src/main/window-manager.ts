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
    // The renderer only ever loads this app's own local content, so granting its
    // permission requests (local-fonts for the font picker, clipboard, …) is safe.
    this.win.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(true))
    this.win.webContents.session.setPermissionCheckHandler(() => true)
    this.win.on('blur', () => {
      if (this.getConfig().hideOnBlur && !this.win.webContents.isDevToolsFocused()) {
        this.hide()
      }
    })
  }

  private targetBounds(
    display: Electron.Display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  ): { x: number; y: number; width: number; height: number } {
    const cfg = this.getConfig()
    const wa = display.workArea
    const width = Math.round((wa.width * cfg.widthPct) / 100)
    const height = Math.round((wa.height * cfg.heightPct) / 100)
    const x = wa.x + Math.round((wa.width - width) / 2)
    const y = cfg.dropdownEdge === 'bottom' ? wa.y + wa.height - height : wa.y
    return { x, y, width, height }
  }

  private showDisplay(): Electron.Display {
    return this.getConfig().dropdownMonitor === 'primary'
      ? screen.getPrimaryDisplay()
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  }

  // Off-screen parked Y for the slide animation: above the work area for a
  // top-edge dropdown, below it for a bottom-edge one.
  private offscreenY(b: { y: number; height: number }): number {
    return this.getConfig().dropdownEdge === 'bottom' ? b.y + b.height : b.y - b.height
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
    const b = this.targetBounds(this.showDisplay())
    const ms = this.getConfig().animationMs
    if (ms === 0) {
      this.win.setBounds(b)
      this.win.show()
      return
    }
    const start = this.offscreenY(b)
    this.win.setBounds({ ...b, y: start })
    this.win.show()
    this.animate(start, b.y, ms, (y) => this.win.setBounds({ ...b, y }))
  }

  hide(): void {
    if (this.animating || !this.win.isVisible()) return
    const b = this.win.getBounds()
    const ms = this.getConfig().animationMs
    if (ms === 0) {
      this.win.hide()
      return
    }
    this.animate(b.y, this.offscreenY(b), ms, (y) => this.win.setBounds({ ...b, y }), () =>
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
    // Live appearance changes keep the window on its current display; only an
    // explicit show() re-targets the display under the cursor.
    if (this.win.isVisible() && !this.animating) {
      this.win.setBounds(this.targetBounds(screen.getDisplayMatching(this.win.getBounds())))
    }
  }
}

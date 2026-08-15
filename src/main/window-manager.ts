import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import type { Config } from '../shared/config'

export class WindowManager {
  readonly win: BrowserWindow
  modalOpen = false

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
      if (this.getConfig().hideOnBlur && !this.modalOpen && !this.win.webContents.isDevToolsFocused()) {
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

  // Window managers mark a frameless window shown at exactly the work area as
  // maximized, and a maximized window silently ignores every later resize
  // request -- which is why the Width and Height settings did nothing at the
  // default 100%. Dropping out of that state first makes the resize stick.
  private applyBounds(b: { x: number; y: number; width: number; height: number }): void {
    if (this.win.isMaximized()) this.win.unmaximize()
    this.win.setBounds(b)
  }

  toggle(): void {
    if (this.win.isVisible() && this.win.isFocused()) this.hide()
    else if (this.win.isVisible()) this.win.focus() // Guake behavior: refocus, don't hide
    else this.show()
  }

  show(): void {
    if (this.win.isVisible()) {
      this.win.focus()
      return
    }
    this.applyBounds(this.targetBounds(this.showDisplay()))
    this.win.show()
  }

  hide(): void {
    if (!this.win.isVisible()) return
    this.win.hide()
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
    if (this.win.isVisible()) {
      this.applyBounds(this.targetBounds(screen.getDisplayMatching(this.win.getBounds())))
    }
  }
}

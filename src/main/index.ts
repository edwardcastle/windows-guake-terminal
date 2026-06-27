import { app, globalShortcut, ipcMain, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import * as nodePty from 'node-pty'
import { autoUpdater } from 'electron-updater'
import { ConfigStore } from './config-store'
import { detectProfiles } from './profiles'
import { PtyManager, SpawnFn } from './pty-manager'
import { WindowManager } from './window-manager'

// Never surface Electron's "A JavaScript error occurred in the main process"
// dialog to the user — log and keep running instead.
process.on('uncaughtException', (err) => console.error('[main] uncaught exception:', err))
process.on('unhandledRejection', (err) => console.error('[main] unhandled rejection:', err))

if (process.platform === 'linux') {
  // Linux defaults to an opaque window visual; without this switch a
  // transparent BrowserWindow still renders over an opaque (gray/black)
  // backdrop instead of the desktop. Must be set before the app is ready.
  app.commandLine.appendSwitch('enable-transparent-visuals')
}

if (!app.requestSingleInstanceLock()) app.quit()

const realSpawn: SpawnFn = (exe, args, opts) =>
  nodePty.spawn(exe, args, {
    name: 'xterm-256color',
    useConpty: true,
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: opts.env as { [k: string]: string }
  })

const appDir = path.join(app.getPath('appData'), 'quake-term')
const store = new ConfigStore(appDir)
const sessionFile = path.join(appDir, 'session.json')
const ptys = new PtyManager(realSpawn)
let wm: WindowManager
let tray: Tray
let quitting = false
let registeredHotkey = ''

function applyMainConfig(): void {
  const cfg = store.config
  if (registeredHotkey !== cfg.hotkey) {
    if (registeredHotkey) globalShortcut.unregister(registeredHotkey)
    registeredHotkey = ''
    if (globalShortcut.register(cfg.hotkey, () => wm.toggle())) {
      registeredHotkey = cfg.hotkey
    } else {
      tray?.displayBalloon({
        title: 'quake-term',
        content: `Could not register hotkey "${cfg.hotkey}" (in use by another app). Change it in settings; the tray icon still toggles the window.`
      })
    }
  }
  wm.applyAppearance()
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: cfg.startWithWindows, args: ['--hidden'] })
  }
}

function setupAutoUpdate(): void {
  if (!app.isPackaged) return
  autoUpdater.on('error', () => { /* offline or no published release — ignore */ })
  autoUpdater.on('update-downloaded', () => {
    tray?.displayBalloon({
      title: 'quake-term',
      content: 'An update was downloaded and will install when you quit.'
    })
  })
  autoUpdater.checkForUpdatesAndNotify().catch(() => { /* no published release / offline */ })
}

function registerIpc(): void {
  ipcMain.handle('pty:spawn', (_e, paneId: string, profileId: string, cols: number, rows: number, cwd?: string) => {
    const profile = store.config.profiles.find((p) => p.id === profileId)
    if (!profile) return `unknown profile: ${profileId}`
    const safeCwd = typeof cwd === 'string' && fs.existsSync(cwd) ? cwd : undefined
    try {
      ptys.spawn(
        paneId, profile, cols, rows,
        (d) => wm.win.webContents.send('pty:data', paneId, d),
        (c) => wm.win.webContents.send('pty:exit', paneId, c),
        safeCwd
      )
      return null
    } catch (err) {
      return `${profile.exe}: ${String(err)}`
    }
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptys.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => ptys.kill(id))
  ipcMain.handle('config:get', () => store.config)
  ipcMain.handle('profiles:get', () => store.config.profiles)
  ipcMain.handle('config:set', (_e, patch) => {
    const c = store.set(patch as object)
    applyMainConfig()
    wm.win.webContents.send('config:changed', c)
    return c
  })
  ipcMain.on('window:hide', () => wm.hide())
  ipcMain.handle('session:load', () => {
    try {
      return JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
    } catch {
      return null
    }
  })
  ipcMain.on('session:save', (_e, data: unknown) => {
    try {
      const tmp = sessionFile + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(data))
      fs.renameSync(tmp, sessionFile)
    } catch {
      // ignore session write failures
    }
  })
  ipcMain.handle('image:load', (_e, p: string) => {
    try {
      const ext = (path.extname(p).slice(1) || 'png').toLowerCase()
      const mime = ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext
      return `data:image/${mime};base64,${fs.readFileSync(p).toString('base64')}`
    } catch {
      return null
    }
  })
}

app.whenReady().then(() => {
  store.load()
  if (store.config.profiles.length === 0) {
    const detected = detectProfiles()
    store.set({ profiles: detected, defaultProfileId: detected[0]?.id ?? '' })
  }

  wm = new WindowManager(() => store.config)
  registerIpc()
  if (process.env['ELECTRON_RENDERER_URL']) {
    wm.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    wm.win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  wm.win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      wm.hide()
    }
  })

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(app.getAppPath(), 'assets/icon.png')
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('quake-term')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Toggle terminal', click: () => wm.toggle() },
    {
      label: 'Settings',
      click: () => {
        wm.show()
        wm.win.webContents.send('ui:open-settings')
      }
    },
    {
      label: 'Check for updates',
      click: () => {
        if (app.isPackaged) void autoUpdater.checkForUpdates()
        else tray.displayBalloon({ title: 'quake-term', content: 'Updates are available only in the installed app.' })
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ]))
  tray.on('click', () => wm.toggle())

  applyMainConfig()
  setupAutoUpdate()
  if (store.corrupt) {
    tray.displayBalloon({
      title: 'quake-term',
      content: 'config.json was corrupt — backed up to config.json.bak and reset to defaults.'
    })
  }
  if (!process.argv.includes('--hidden')) wm.show()
})

app.on('second-instance', () => wm?.toggle())
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  ptys.killAll()
  store.flush()
})
app.on('window-all-closed', () => {
  // keep running in the tray
})

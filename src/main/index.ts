import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import * as nodePty from 'node-pty'
import { ConfigStore } from './config-store'
import { detectProfiles } from './profiles'
import { PtyManager, SpawnFn } from './pty-manager'

const realSpawn: SpawnFn = (exe, args, opts) =>
  nodePty.spawn(exe, args, {
    name: 'xterm-256color',
    useConpty: true,
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: opts.env as { [k: string]: string }
  })

const store = new ConfigStore(path.join(app.getPath('appData'), 'quake-term'))
const ptys = new PtyManager(realSpawn)
let win: BrowserWindow

function registerIpc(): void {
  ipcMain.handle('pty:spawn', (_e, paneId: string, profileId: string, cols: number, rows: number) => {
    const profile = store.config.profiles.find((p) => p.id === profileId)
    if (!profile) return `unknown profile: ${profileId}`
    try {
      ptys.spawn(
        paneId, profile, cols, rows,
        (d) => win.webContents.send('pty:data', paneId, d),
        (c) => win.webContents.send('pty:exit', paneId, c)
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
    win.webContents.send('config:changed', c)
    return c
  })
  ipcMain.on('window:hide', () => win.hide())
}

app.whenReady().then(() => {
  store.load()
  if (store.config.profiles.length === 0) {
    const detected = detectProfiles()
    store.set({ profiles: detected, defaultProfileId: detected[0]?.id ?? '' })
  }
  registerIpc()
  win = new BrowserWindow({
    width: 1200,
    height: 700,
    backgroundColor: '#282a36',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
})

app.on('will-quit', () => ptys.killAll())
app.on('window-all-closed', () => app.quit())

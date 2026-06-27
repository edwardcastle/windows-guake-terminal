import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  spawn: (paneId: string, profileId: string, cols: number, rows: number, cwd?: string) =>
    ipcRenderer.invoke('pty:spawn', paneId, profileId, cols, rows, cwd) as Promise<string | null>,
  write: (paneId: string, data: string) => ipcRenderer.send('pty:write', paneId, data),
  resize: (paneId: string, cols: number, rows: number) =>
    ipcRenderer.send('pty:resize', paneId, cols, rows),
  kill: (paneId: string) => ipcRenderer.send('pty:kill', paneId),
  onData: (cb: (paneId: string, data: string) => void) =>
    ipcRenderer.on('pty:data', (_e, id: string, d: string) => cb(id, d)),
  onExit: (cb: (paneId: string, code: number) => void) =>
    ipcRenderer.on('pty:exit', (_e, id: string, c: number) => cb(id, c)),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch: unknown) => ipcRenderer.invoke('config:set', patch),
  onConfigChanged: (cb: (config: unknown) => void) =>
    ipcRenderer.on('config:changed', (_e, c) => cb(c)),
  getProfiles: () => ipcRenderer.invoke('profiles:get'),
  onOpenSettings: (cb: () => void) => ipcRenderer.on('ui:open-settings', () => cb()),
  hideWindow: () => ipcRenderer.send('window:hide'),
  platform: process.platform,
  version: ipcRenderer.sendSync('app:version') as string,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  loadImage: (path: string) => ipcRenderer.invoke('image:load', path) as Promise<string | null>,
  pickImage: () => ipcRenderer.invoke('dialog:pickImage') as Promise<string | null>,
  loadSession: () => ipcRenderer.invoke('session:load') as Promise<unknown>,
  saveSession: (data: unknown) => ipcRenderer.send('session:save', data)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

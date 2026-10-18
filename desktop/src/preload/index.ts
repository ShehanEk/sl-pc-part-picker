import { contextBridge, ipcRenderer } from 'electron'

/**
 * The entire surface the renderer can reach.
 *
 * Everything here is a named, argument-validated call into main. The renderer
 * gets no Node primitives, no database handle, and above all no credentials —
 * `settings()` returns a description of the connection (host, database name)
 * and never the connection string itself.
 */
contextBridge.exposeInMainWorld('pcmaker', {
  status: () => ipcRenderer.invoke('status'),
  settings: () => ipcRenderer.invoke('settings'),
  setSecret: (key: string, value: string) => ipcRenderer.invoke('setSecret', key, value),
  importEnv: () => ipcRenderer.invoke('importEnv'),
  runNow: (shop: string) => ipcRenderer.invoke('runNow', shop),
  normalizeNow: () => ipcRenderer.invoke('normalizeNow'),
  checkNow: () => ipcRenderer.invoke('checkNow'),
  cancel: () => ipcRenderer.invoke('cancel'),
  setPaused: (value: boolean) => ipcRenderer.invoke('setPaused', value),
  setDelay: (ms: number) => ipcRenderer.invoke('setDelay', ms),
  setLoginItem: (value: boolean) => ipcRenderer.invoke('setLoginItem', value),
  setSkipOnBattery: (value: boolean) => ipcRenderer.invoke('setSkipOnBattery', value),
  openExternal: (url: string) => ipcRenderer.invoke('openExternal', url),

  // Push channels. The callback only ever receives the payload — never the
  // IpcRendererEvent, which would hand the renderer a `sender` to poke at.
  onLog: (cb: (line: string) => void) =>
    ipcRenderer.on('log', (_e, line: string) => cb(line)),
  onJob: (cb: (job: unknown) => void) =>
    ipcRenderer.on('job', (_e, job: unknown) => cb(job)),
  onStatus: (cb: (status: unknown) => void) =>
    ipcRenderer.on('status', (_e, status: unknown) => cb(status)),
})

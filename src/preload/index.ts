import { contextBridge, ipcRenderer } from 'electron'
import { IConfig } from '../../server/db'

// Custom APIs for renderer
const api = {
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  checkHealth: () => ipcRenderer.invoke('check-health'),
  createDbConfigFile: (config: IConfig) => ipcRenderer.invoke('create-db-config-file', config),
  connectToDB: () => ipcRenderer.invoke('connect-to-db')
}

contextBridge.exposeInMainWorld('api', api)
// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.

import { contextBridge, ipcRenderer } from 'electron'
import { IConfig } from '../../server/db'

// Custom APIs for renderer
const api = {
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  checkHealth: () => ipcRenderer.invoke('check-health'),
  createDbConfigFile: (config: IConfig) => ipcRenderer.invoke('create-db-config-file', config),
  connectToDB: () => ipcRenderer.invoke('connect-to-db'),
  checkDbStatus: () => ipcRenderer.invoke('check-db-status'),
  initializeWhatsapp: () => ipcRenderer.invoke('initialize-whatsapp'),
  getWhatsappStatus: () => ipcRenderer.invoke('get-whatsapp-status'),
  disconnectWhatsapp: () => ipcRenderer.invoke('disconnect-whatsapp'),
  deleteWhatsappAuth: () => ipcRenderer.invoke('delete-whatsapp-auth'),
  onWhatsappStatus: (
    callback: (event: Electron.IpcRendererEvent, data: { status: string; data?: unknown }) => void
  ) => {
    ipcRenderer.on('whatsapp-status', callback)
    return () => ipcRenderer.removeAllListeners('whatsapp-status')
  }
}

contextBridge.exposeInMainWorld('api', api)

// Verify API is exposed (for debugging)
if (process.env.NODE_ENV === 'development') {
  console.log('Preload script loaded. API methods:', Object.keys(api))
}

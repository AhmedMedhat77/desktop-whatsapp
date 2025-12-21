import { ElectronAPI } from '@electron-toolkit/preload'
import { IDatabaseForm } from '@renderer/utils'
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  createConnection: async (config: IDatabaseForm) => {
    return await window.api.createConnection(config)
  }
})
declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      startServer: () => Promise<string>
      stopServer: () => Promise<string>
      checkHealth: () => Promise<boolean>
      createDbConfigFile: (config: IDatabaseForm) => Promise<boolean>
      connectToDB: () => Promise<{ success: boolean; error?: string }>
      checkDbStatus: () => Promise<boolean>
      initializeWhatsapp: () => Promise<{ success: boolean; status: string; error?: string }>
      getWhatsappStatus: () => Promise<string>
      disconnectWhatsapp: () => Promise<{ success: boolean; error?: string }>
      deleteWhatsappAuth: () => Promise<{ success: boolean; error?: string }>
      onWhatsappStatus: (
        callback: (
          event: Electron.IpcRendererEvent,
          data: { status: string; data?: { qr?: string } }
        ) => void
      ) => () => void
    }
  }
}

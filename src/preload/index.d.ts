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
      sendMessage: (
        phoneNumber: string,
        message: string,
        delay?: string,
        customDelayMs?: number
      ) => Promise<{ success: boolean; scheduled?: boolean; jobId?: string; error?: string }>
      getScheduledJobs: () => Promise<
        Array<{
          id: string
          delay: string
          customDelayMs?: number
          executeAt: string
        }>
      >
      cancelScheduledJob: (jobId: string) => Promise<{ success: boolean; error?: string }>
      onMessageSent: (
        callback: (
          event: Electron.IpcRendererEvent,
          data: {
            phoneNumber: string
            userName?: string
            message: string
            messageType?: 'appointment' | 'appointmentReminder' | 'newPatient' | 'manual'
            status: 'sent' | 'failed' | 'pending'
            sentAt: string
            error?: string
          }
        ) => void
      ) => () => void
      getAppointmentReminderSettings: () => Promise<{
        reminderType: '1day' | '2days' | 'custom'
        customHours: number
        enabled: boolean
      }>
      setAppointmentReminderSettings: (settings: {
        reminderType: '1day' | '2days' | 'custom'
        customHours: number
        enabled: boolean
      }) => Promise<{ success: boolean; error?: string }>
    }
  }
}

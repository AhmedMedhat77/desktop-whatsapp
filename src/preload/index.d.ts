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
        startFrom?: string // ISO date string (YYYY-MM-DD)
      }>
      setAppointmentReminderSettings: (settings: {
        reminderType: '1day' | '2days' | 'custom'
        customHours: number
        enabled: boolean
        startFrom?: string // ISO date string (YYYY-MM-DD)
      }) => Promise<{ success: boolean; error?: string }>
      getSentMessages: () => Promise<
        Array<{
          messageType: 'appointment' | 'appointmentReminder' | 'newPatient' | 'manual'
          status: 'pending' | 'processing' | 'sent' | 'failed' | 'unknown'
          statusCode: number // 0=PENDING, 1=PROCESSING, 2=SENT, 3=FAILED
          retryCount: number | null
          userName: string
          phoneNumber: string
          datePart: string // yyyyMMdd
          timePart: string // HHmm
          processedAt: string | null // ISO datetime string
          id: number | null
          // Legacy field for backward compatibility
          isSent?: number
        }>
      >
    }
  }
}

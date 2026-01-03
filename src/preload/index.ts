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
  },
  sendMessage: (phoneNumber: string, message: string, delay?: string, customDelayMs?: number) =>
    ipcRenderer.invoke('send-message', phoneNumber, message, delay, customDelayMs),
  getScheduledJobs: () => ipcRenderer.invoke('get-scheduled-jobs'),
  cancelScheduledJob: (jobId: string) => ipcRenderer.invoke('cancel-scheduled-job', jobId),
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
  ) => {
    ipcRenderer.on('message-sent', callback)
    return () => ipcRenderer.removeAllListeners('message-sent')
  },
  getAppointmentReminderSettings: () => ipcRenderer.invoke('get-appointment-reminder-settings'),
  setAppointmentReminderSettings: (settings: {
    reminderType: '1day' | '2days' | 'custom'
    customHours: number
    enabled: boolean
    startFrom?: string // ISO date string (YYYY-MM-DD)
  }) => ipcRenderer.invoke('set-appointment-reminder-settings', settings),
  getSentMessages: () => ipcRenderer.invoke('get-sent-messages')
}

contextBridge.exposeInMainWorld('api', api)

// Verify API is exposed (for debugging)
if (process.env.NODE_ENV === 'development') {
  console.log('Preload script loaded. API methods:', Object.keys(api))
}

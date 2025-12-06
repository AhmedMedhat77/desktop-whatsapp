import { Client, LocalAuth } from 'whatsapp-web.js'
import type { BrowserWindow } from 'electron'

let whatsappClient: Client | null = null
let mainWindow: BrowserWindow | null = null

export type WhatsAppStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'authenticated'
  | 'ready'
  | 'auth_failure'
  | 'disconnected_error'

let currentStatus: WhatsAppStatus = 'disconnected'

export const setMainWindow = (window: BrowserWindow | null): void => {
  mainWindow = window
}

const sendStatusToRenderer = (status: WhatsAppStatus, data?: unknown): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('whatsapp-status', { status, data })
  }
}

export const initializeWhatsapp = async (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (whatsappClient) {
      if (currentStatus === 'ready') {
        resolve(true)
        return
      }
      // If already initializing, reject
      reject(new Error('WhatsApp client is already initializing'))
      return
    }

    currentStatus = 'connecting'
    sendStatusToRenderer(currentStatus)

    whatsappClient = new Client({
      authStrategy: new LocalAuth({
        dataPath: './whatsapp-auth'
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    })

    // QR Code event
    whatsappClient.on('qr', (qr) => {
      console.log('QR Code received')
      currentStatus = 'qr_ready'
      sendStatusToRenderer(currentStatus, { qr })
    })

    // Authenticating event
    whatsappClient.on('authenticating', () => {
      console.log('Authenticating...')
      currentStatus = 'authenticated'
      sendStatusToRenderer(currentStatus)
    })

    // Ready event
    whatsappClient.on('ready', () => {
      console.log('WhatsApp client is ready!')
      currentStatus = 'ready'
      sendStatusToRenderer(currentStatus)
      resolve(true)
    })

    // Auth failure event
    whatsappClient.on('auth_failure', (error) => {
      console.error('WhatsApp auth failure:', error)
      currentStatus = 'auth_failure'
      sendStatusToRenderer(currentStatus, { error: String(error) })
      whatsappClient = null
      reject(error)
    })

    // Disconnected event
    whatsappClient.on('disconnected', (reason) => {
      console.log('WhatsApp disconnected:', reason)
      currentStatus = reason === 'LOGOUT' ? 'disconnected' : 'disconnected_error'
      sendStatusToRenderer(currentStatus, { reason })
      whatsappClient = null
    })

    // Loading screen event
    whatsappClient.on('loading_screen', (percent, message) => {
      console.log(`Loading: ${percent}% - ${message}`)
      sendStatusToRenderer('connecting', { percent, message })
    })

    // Initialize the client
    whatsappClient.initialize().catch((error) => {
      console.error('Error initializing WhatsApp client:', error)
      currentStatus = 'disconnected_error'
      sendStatusToRenderer(currentStatus, { error: error.message || String(error) })
      whatsappClient = null
      reject(error)
    })
  })
}

export const getWhatsAppStatus = (): WhatsAppStatus => {
  return currentStatus
}

export const getWhatsAppClient = (): Client | null => {
  return whatsappClient
}

export const disconnectWhatsApp = async (): Promise<void> => {
  if (whatsappClient) {
    try {
      await whatsappClient.destroy()
      whatsappClient = null
      currentStatus = 'disconnected'
      sendStatusToRenderer(currentStatus)
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error)
      whatsappClient = null
      currentStatus = 'disconnected'
      sendStatusToRenderer(currentStatus)
    }
  }
}

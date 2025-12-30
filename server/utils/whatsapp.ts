import { Client, LocalAuth } from 'whatsapp-web.js'
import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { formatPhoneNumber } from './phoneNumber'
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

// More robust platform detection
const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'

// Function to find Chrome executable path
function getChromeExecutablePath(): string {
  if (isWindows) {
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
      // Additional common Windows Chrome paths
      'C:\\Users\\' +
        process.env.USERNAME +
        '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\' +
        process.env.USERNAME +
        '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      // Edge as fallback
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ]

    console.log('🔍 Searching for Chrome/Edge on Windows...')

    for (const chromePath of possiblePaths) {
      if (chromePath && fs.existsSync(chromePath)) {
        console.log(`✅ Found browser: ${chromePath}`)
        return chromePath
      }
    }

    console.log('❌ Chrome/Edge not found in common locations')
    console.log('💡 Please install Google Chrome from: https://www.google.com/chrome/')
    console.log('💡 Or Microsoft Edge from: https://www.microsoft.com/edge/')

    // Return a default path that might work
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }

  if (isMac) {
    const possiblePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ]

    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath
      }
    }

    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  }

  if (isLinux) {
    const possiblePaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium'
    ]

    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath
      }
    }

    return '/usr/bin/google-chrome'
  }

  return isWindows ? 'chrome.exe' : 'google-chrome'
}
let isReady = false
const messageQueue: Array<{ number: string; message: string }> = []

// Process queued messages when WhatsApp is ready
async function processMessageQueue(): Promise<void> {
  while (messageQueue.length > 0) {
    const { number, message } = messageQueue.shift()!
    await sendMessageToPhone(number, message)
    // Add a small delay between messages to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

// Send message to phone number
export async function sendMessageToPhone(
  number: string,
  message: string,
  _checkDuplicate: boolean = true,
  messageType: 'appointment' | 'appointmentReminder' | 'newPatient' | 'manual' = 'manual',
  userName?: string
): Promise<{ success: boolean; error?: string; isDuplicate?: boolean }> {
  try {
    if (!number) {
      console.error('⚠️ Phone number missing')
      return { success: false, error: 'Phone number missing' }
    }

    // If WhatsApp client is not ready, queue the message
    if (!isReady || !whatsappClient || !whatsappClient.info) {
      console.log(`📝 Queuing message for ${number} (WhatsApp not ready)`)
      messageQueue.push({ number, message })
      // Notify renderer about queued message
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('message-sent', {
          phoneNumber: number,
          userName,
          message,
          messageType,
          status: 'pending',
          sentAt: new Date().toISOString()
        })
      }
      return { success: true }
    }

    const chatId = `${formatPhoneNumber(number)}@c.us`
    console.log(`📱 Attempting to send message to: ${chatId}`)

    // Notify renderer about pending message
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('message-sent', {
        phoneNumber: number,
        userName,
        message,
        messageType,
        status: 'pending',
        sentAt: new Date().toISOString()
      })
    }

    await whatsappClient.sendMessage(chatId, message)
    console.log(`✅ Message sent to ${number}`)

    // Notify renderer about successful message
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('message-sent', {
        phoneNumber: number,
        userName,
        message,
        messageType,
        status: 'sent',
        sentAt: new Date().toISOString()
      })
    }

    return { success: true }
  } catch (err: Error | unknown) {
    console.log(err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error(`❌ Failed to send to ${number}:`, errorMessage)

    // Notify renderer about failed message
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('message-sent', {
        phoneNumber: number,
        userName,
        message,
        messageType,
        status: 'failed',
        sentAt: new Date().toISOString(),
        error: errorMessage
      })
    }

    return { success: false, error: errorMessage }
  }
}

// Function to kill Chrome processes on Windows
function killChromeProcesses(): void {
  if (!isWindows) return

  try {
    // Kill Chrome processes
    execSync('taskkill /f /im chrome.exe /t', { stdio: 'ignore' })
    console.log('🧹 Killed Chrome processes')

    // Kill Edge processes too
    try {
      execSync('taskkill /f /im msedge.exe /t', { stdio: 'ignore' })
    } catch (error: unknown) {
      // Ignore if no processes found
      console.log('⚠️ Could not kill Edge processes:', error)
    }
  } catch (error) {
    console.log('⚠️ Could not kill Chrome processes:', error)
  }
}

// Function to clean up only lock files, not the entire session
function cleanupLockFiles(): void {
  try {
    // Kill Chrome processes first on Windows
    if (isWindows) {
      killChromeProcesses()
      // Wait a bit for processes to fully terminate
      setTimeout(() => {
        cleanupLockFilesInternal()
      }, 1000)
    } else {
      cleanupLockFilesInternal()
    }
  } catch (error) {
    console.log('⚠️ Could not clean up lock files:', error)
  }
}

function cleanupLockFilesInternal(): void {
  try {
    const authDir = path.join(process.cwd(), '.wwebjs_auth')
    if (fs.existsSync(authDir)) {
      const sessionDir = path.join(authDir, 'session-whatsapp-bot-session')
      if (fs.existsSync(sessionDir)) {
        // Remove lock files with retry logic
        const lockFiles = [
          path.join(sessionDir, 'SingletonLock'),
          path.join(sessionDir, 'CrashpadMetrics-active.pma'),
          path.join(sessionDir, 'CrashpadMetrics-previous.pma')
        ]

        lockFiles.forEach((lockFile) => {
          if (fs.existsSync(lockFile)) {
            try {
              // Try to remove with retry
              let retries = 3
              while (retries > 0) {
                try {
                  fs.unlinkSync(lockFile)
                  console.log(`🧹 Cleaned up lock file: ${path.basename(lockFile)}`)
                  break
                } catch (err: unknown) {
                  const error = err as NodeJS.ErrnoException
                  if (error.code === 'EBUSY' || error.code === 'ENOENT') {
                    retries--
                    if (retries > 0) {
                      // Wait before retry
                      const waitTime = 500 * (4 - retries)
                      setTimeout(() => {}, waitTime)
                    }
                  } else {
                    throw err
                  }
                }
              }
            } catch (error) {
              console.log(`⚠️ Could not remove ${path.basename(lockFile)}:`, error)
            }
          }
        })
      }
    }
  } catch (error) {
    console.log('⚠️ Could not clean up lock files:', error)
  }
}

// Clean up only lock files, preserve session data
cleanupLockFiles()

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
        processMessageQueue().catch((error) => {
          console.error('Error processing message queue:', error)
        })
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
        dataPath: path.join(process.cwd(), '.wwebjs_auth'),
        // Add client ID to make session more stable
        clientId: 'whatsapp-bot-session'
      }),
      puppeteer: {
        executablePath: getChromeExecutablePath(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--remote-debugging-port=0', // Use random port to avoid conflicts
          // Windows-specific arguments
          ...(isWindows
            ? [
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-sync',
                '--disable-translate',
                '--disable-windows10-custom-titlebar',
                '--disable-client-side-phishing-detection',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--disable-extensions',
                '--no-default-browser-check',
                '--no-pings',
                '--password-store=basic',
                '--use-mock-keychain',
                '--disable-component-update',
                '--disable-domain-reliability'
              ]
            : [])
          // Remove the unique user data dir to maintain session consistency
        ]
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
      isReady = true
      sendStatusToRenderer(currentStatus)
      // Process any queued messages
      processMessageQueue().catch((error) => {
        console.error('Error processing message queue:', error)
      })
      resolve(true)
    })

    // Auth failure event
    whatsappClient.on('auth_failure', (error) => {
      console.error('WhatsApp auth failure:', error)
      currentStatus = 'auth_failure'
      isReady = false
      sendStatusToRenderer(currentStatus, { error: String(error) })
      whatsappClient = null
      reject(error)
    })

    // Disconnected event
    whatsappClient.on('disconnected', (reason) => {
      console.log('WhatsApp disconnected:', reason)
      currentStatus = reason === 'LOGOUT' ? 'disconnected' : 'disconnected_error'
      isReady = false
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
      isReady = false
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
      isReady = false
      currentStatus = 'disconnected'
      sendStatusToRenderer(currentStatus)
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error)
      whatsappClient = null
      isReady = false
      currentStatus = 'disconnected'
      sendStatusToRenderer(currentStatus)
    }
  }
}

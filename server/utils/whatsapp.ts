import type { BrowserWindow } from 'electron'

import fs from 'node:fs'
import path from 'node:path'
import { Client, LocalAuth } from 'whatsapp-web.js'
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
    await sendMessageToPhone(number, message, 'manual')
    // Add a small delay between messages to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

// Send message to phone number
export async function sendMessageToPhone(
  number: string,
  message: string,
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

    // Send message with sendSeen: false to avoid markedUnread error
    // WhatsApp Web changed their API and the sendSeen feature causes errors
    await whatsappClient.sendMessage(chatId, message, { sendSeen: false })
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

// Function to clean up only lock files, not the entire session
function cleanupLockFiles(): void {
  try {
    cleanupLockFilesInternal()
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

// Function to clean up session data on critical errors
function cleanupSessionData(): void {
  try {
    const authDir = path.join(process.cwd(), '.wwebjs_auth')
    if (fs.existsSync(authDir)) {
      console.log('🧹 Cleaning up session data due to critical error...')
      fs.rmSync(authDir, { recursive: true, force: true })
      console.log('✅ Session data cleaned successfully')
    }
  } catch (error) {
    console.error('❌ Failed to clean up session data:', error)
  }
}

export const setMainWindow = (window: BrowserWindow | null): void => {
  mainWindow = window
}

const sendStatusToRenderer = (status: WhatsAppStatus, data?: unknown): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('whatsapp-status', { status, data })
  }
}

// Track initialization attempts
let initAttempts = 0
const MAX_INIT_ATTEMPTS = 3
let initTimeout: NodeJS.Timeout | null = null

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

    initAttempts++
    console.log(`🔄 WhatsApp initialization attempt ${initAttempts}/${MAX_INIT_ATTEMPTS}`)

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
      console.log('✅ WhatsApp client is ready!')

      // Clear timeout
      if (initTimeout) {
        clearTimeout(initTimeout)
        initTimeout = null
      }

      // Reset attempt counter on success
      initAttempts = 0

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
      console.error('❌ WhatsApp auth failure:', error)
      currentStatus = 'auth_failure'
      isReady = false

      // Clear timeout if exists
      if (initTimeout) {
        clearTimeout(initTimeout)
        initTimeout = null
      }

      sendStatusToRenderer(currentStatus, { error: String(error) })

      // Clean up client
      if (whatsappClient) {
        whatsappClient.destroy().catch(() => {})
        whatsappClient = null
      }

      // On auth failure, clean up session data to force fresh login
      console.log('🧹 Cleaning up session data after auth failure...')
      cleanupSessionData()

      reject(error)
    })

    // Disconnected event
    whatsappClient.on('disconnected', (reason) => {
      console.log('⚠️ WhatsApp disconnected:', reason)
      currentStatus = reason === 'LOGOUT' ? 'disconnected' : 'disconnected_error'
      isReady = false

      // Clear timeout if exists
      if (initTimeout) {
        clearTimeout(initTimeout)
        initTimeout = null
      }

      sendStatusToRenderer(currentStatus, { reason })

      // Clean up client
      if (whatsappClient) {
        whatsappClient.destroy().catch(() => {})
        whatsappClient = null
      }

      // If disconnected due to LOGOUT, clean session
      if (reason === 'LOGOUT') {
        console.log('🧹 Cleaning up session data after logout...')
        cleanupSessionData()
      }
    })

    // Loading screen event
    whatsappClient.on('loading_screen', (percent, message) => {
      console.log(`📥 Loading: ${percent}% - ${message}`)
      sendStatusToRenderer('connecting', { percent, message })
    })

    // Remote session saved event (good indicator of progress)
    whatsappClient.on('remote_session_saved', () => {
      console.log('💾 Remote session saved')
    })

    // Add initialization timeout (5 minutes)
    initTimeout = setTimeout(
      () => {
        console.error('⏱️ WhatsApp initialization timeout (5 minutes)')

        if (whatsappClient && currentStatus !== 'ready') {
          currentStatus = 'disconnected_error'
          isReady = false

          const timeoutError = new Error(
            'WhatsApp initialization timeout - taking too long to connect'
          )
          sendStatusToRenderer(currentStatus, { error: timeoutError.message })

          // Destroy client and clean up
          whatsappClient.destroy().catch(() => {})
          whatsappClient = null

          // On timeout, suggest cleaning session
          if (initAttempts >= MAX_INIT_ATTEMPTS) {
            console.log('🧹 Max attempts reached, cleaning up session data...')
            cleanupSessionData()
            initAttempts = 0 // Reset counter
          }

          reject(timeoutError)
        }
      },
      5 * 60 * 1000
    ) // 5 minutes

    // Initialize the client with enhanced error handling
    whatsappClient.initialize().catch((error) => {
      console.error('❌ Error initializing WhatsApp client:', error)

      // Clear timeout
      if (initTimeout) {
        clearTimeout(initTimeout)
        initTimeout = null
      }

      currentStatus = 'disconnected_error'
      isReady = false

      // Check if error is related to property access (like markedUnread)
      const errorMessage = error.message || String(error)
      const isPropertyError =
        errorMessage.includes('Cannot read propert') ||
        errorMessage.includes('undefined') ||
        errorMessage.includes('null')

      if (isPropertyError) {
        console.error('🔍 Detected property access error - likely WhatsApp Web API change')
        console.log('💡 Suggestion: Try clearing session data and re-authenticating')

        // If we've tried multiple times, auto-clean session
        if (initAttempts >= MAX_INIT_ATTEMPTS) {
          console.log('🧹 Auto-cleaning session data after repeated property errors...')
          cleanupSessionData()
          initAttempts = 0 // Reset counter
        }
      }

      sendStatusToRenderer(currentStatus, {
        error: errorMessage,
        suggestion: isPropertyError
          ? 'WhatsApp Web may have updated. Try clearing session data.'
          : undefined,
        attempts: initAttempts,
        maxAttempts: MAX_INIT_ATTEMPTS
      })

      // Clean up client
      if (whatsappClient) {
        whatsappClient.destroy().catch(() => {})
        whatsappClient = null
      }

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
      // Clear timeout if exists
      if (initTimeout) {
        clearTimeout(initTimeout)
        initTimeout = null
      }

      console.log('🔌 Disconnecting WhatsApp client...')
      await whatsappClient.destroy()
      whatsappClient = null
      isReady = false
      currentStatus = 'disconnected'
      sendStatusToRenderer(currentStatus)
      console.log('✅ WhatsApp client disconnected successfully')
    } catch (error) {
      console.error('❌ Error disconnecting WhatsApp:', error)
      whatsappClient = null
      isReady = false
      currentStatus = 'disconnected'
      sendStatusToRenderer(currentStatus)
    }
  }
}

// Export function to manually clean session (can be called from main process)
export const cleanupWhatsAppSession = (): void => {
  console.log('🧹 Manual session cleanup requested')
  cleanupSessionData()
  initAttempts = 0 // Reset attempt counter
}

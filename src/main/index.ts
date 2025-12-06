import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { Server } from 'http'
import { startServer, stopServer, checkHealth } from '../../server/utils'
import {
  connectToDB,
  createDbConfigFile,
  IConfig,
  closeConnection,
  isDatabaseConnected
} from '../../server/db'
import {
  initializeWhatsapp,
  getWhatsAppStatus,
  disconnectWhatsApp,
  setMainWindow
} from '../../server/utils/whatsapp'
import { deleteWhatsappAuth } from '../../server/utils/deleteWhatsappAuth'

let adminServer: Server | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Set main window for WhatsApp status updates
  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    setMainWindow(null)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Start admin server
  startServer(adminServer)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Cleanup admin server and database connection on app quit
app.on('before-quit', async () => {
  // Disconnect WhatsApp
  try {
    await disconnectWhatsApp()
  } catch (error) {
    console.error('Error disconnecting WhatsApp on app quit:', error)
  }

  // Close database connection
  try {
    await closeConnection()
  } catch (error) {
    console.error('Error closing database on app quit:', error)
  }

  // Stop server
  if (adminServer) {
    await stopServer(adminServer)
    adminServer = null
  }
})

// ----------- START SERVER ----------- //
ipcMain.handle('start-server', async () => {
  if (adminServer) {
    console.log('Start server: Server already running')
    return 'Server already running'
  }

  console.log('Starting admin server...')
  adminServer = await startServer(adminServer)
  console.log('Admin server started successfully')

  return 'Server started'
})

// ----------- STOP SERVER ----------- //
ipcMain.handle('stop-server', async () => {
  if (!adminServer) {
    console.log('Stop server: Server not running')
    return 'Server not running'
  }

  // Check if server is actually listening before trying to stop
  if (!adminServer.listening) {
    console.log('Stop server: Server is not listening')
    adminServer = null
    return 'Server not running'
  }

  console.log('Stopping admin server...')

  // Close database connection when server stops
  try {
    await closeConnection()
    console.log('Database connection closed')
  } catch (error) {
    console.error('Error closing database connection:', error)
  }

  await stopServer(adminServer)
  adminServer = null // Update the local variable
  console.log('Admin server stopped successfully')
  return 'Server stopped'
})

// ----------- CHECK HEALTH ----------- //
ipcMain.handle('check-health', async () => {
  return checkHealth(adminServer)
})

// ----------- CREATE DB CONFIG FILE ----------- //
ipcMain.handle('create-db-config-file', async (_, config: IConfig) => {
  try {
    const response = await createDbConfigFile(config)
    return response
  } catch (error) {
    console.error('Error creating database config file:', error)
    return false
  }
})

// ----------- CONNECT TO DATABASE ----------- //
ipcMain.handle('connect-to-db', async () => {
  try {
    const isConnected = await connectToDB()
    return isConnected
  } catch (error) {
    console.error('Error in connect-to-db handler:', error)
    return false
  }
})

// ----------- CHECK DATABASE STATUS ----------- //
ipcMain.handle('check-db-status', async () => {
  try {
    // If we have a pool, test if it's still connected
    if (isDatabaseConnected()) {
      const isConnected = await connectToDB()
      return isConnected
    }
    return false
  } catch (error) {
    console.error('Error checking database status:', error)
    return false
  }
})

// ----------- WHATSAPP HANDLERS ----------- //
ipcMain.handle('initialize-whatsapp', async () => {
  try {
    await initializeWhatsapp()
    return { success: true, status: getWhatsAppStatus() }
  } catch (error) {
    console.error('Error initializing WhatsApp:', error)
    return {
      success: false,
      status: getWhatsAppStatus(),
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle('get-whatsapp-status', async () => {
  return getWhatsAppStatus()
})

ipcMain.handle('disconnect-whatsapp', async () => {
  try {
    await disconnectWhatsApp()
    return { success: true }
  } catch (error) {
    console.error('Error disconnecting WhatsApp:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle('delete-whatsapp-auth', async () => {
  try {
    await deleteWhatsappAuth()
    return { success: true }
  } catch (error) {
    console.error('Error deleting WhatsApp auth:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

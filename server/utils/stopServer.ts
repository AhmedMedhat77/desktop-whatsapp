import { Server } from 'http'
import { disconnectWhatsApp } from './whatsapp'
import { deleteWhatsappAuth } from './deleteWhatsappAuth'

export const stopServer = async (server: Server | null): Promise<Server | null> => {
  return new Promise((resolve) => {
    if (!server) {
      console.log('Admin server: Already stopped')
      resolve(null)
      return
    }

    // Check if server is actually listening
    if (!server.listening) {
      console.log('Admin server: Server is not listening')
      resolve(null)
      return
    }

    console.log('Admin server: Closing server...')

    // Close all connections immediately (Node.js 18+)
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections()
    }

    // Set a timeout to prevent hanging
    const timeout = setTimeout(async () => {
      console.log('Admin server: Force closing due to timeout')
      await deleteWhatsappAuth()
      resolve(null)
    }, 5000) // 5 second timeout

    try {
      server.close((err) => {
        clearTimeout(timeout)

        if (err) {
          // If error code is ERR_SERVER_NOT_RUNNING, treat it as success
          const nodeError = err as NodeJS.ErrnoException
          if (nodeError.code === 'ERR_SERVER_NOT_RUNNING' || err.message?.includes('not running')) {
            console.log('Admin server: Server was already closed')
            resolve(null)
            return
          }
          console.error('Admin server: Error closing server', err)
          // Still resolve instead of reject to prevent unhandled promise rejection
          resolve(null)
          return
        }

        // Disconnect WhatsApp first, then delete auth
        disconnectWhatsApp()
          .then(() => {
            // Wait longer for WhatsApp to fully release files and processes
            console.log('Waiting for WhatsApp to release file handles...')
            return new Promise((resolve) => setTimeout(resolve, 2000))
          })
          .then(() => {
            console.log('Starting WhatsApp auth deletion...')
            return deleteWhatsappAuth()
          })
          .then(() => {
            console.log('Admin server stopped successfully')
            resolve(null)
          })
          .catch((error) => {
            console.error('Error during server shutdown:', error)
            console.log('Admin server stopped successfully')
            resolve(null)
          })
      })
    } catch (error: unknown) {
      // Handle synchronous errors
      clearTimeout(timeout)
      const nodeError = error as NodeJS.ErrnoException
      if (
        nodeError?.code === 'ERR_SERVER_NOT_RUNNING' ||
        nodeError?.message?.includes('not running')
      ) {
        console.log('Admin server: Server was already closed (sync error)')
        resolve(null)
        return
      }
      console.error('Admin server: Error closing server (sync)', error)
      resolve(null)
    }
  })
}

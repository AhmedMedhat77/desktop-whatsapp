import Button from '@renderer/components/Button'
import Status from '@renderer/components/Status'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

type WhatsAppStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'authenticated'
  | 'ready'
  | 'auth_failure'
  | 'disconnected_error'

export const Route = createFileRoute('/')({
  component: HomeScreen
})

function HomeScreen(): React.ReactNode {
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'pending'>('pending')
  const [isServerHealthy, setIsServerHealthy] = useState<boolean>(false)
  const [isDatabaseConnected, setIsDatabaseConnected] = useState<boolean>(false)
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>('disconnected')
  const [whatsappQrCode, setWhatsappQrCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState({
    server: false,
    database: false,
    whatsapp: false,
    deleteCache: false
  })
  const [deleteCacheMessage, setDeleteCacheMessage] = useState<string | null>(null)

  const checkHealth = useCallback(async (): Promise<void> => {
    try {
      const response = await window.api.checkHealth()
      setIsServerHealthy(response)
      // Update server status based on health check
      if (response && serverStatus === 'offline') {
        setServerStatus('online')
      } else if (!response && serverStatus === 'online') {
        setServerStatus('offline')
      }
    } catch (error) {
      console.error('Health check failed:', error)
      setIsServerHealthy(false)
      setServerStatus('offline')
    }
  }, [serverStatus])

  const checkDatabaseConnection = useCallback(async (): Promise<void> => {
    try {
      const response = await window.api.checkDbStatus()
      setIsDatabaseConnected(response)
    } catch (error) {
      console.error('Database connection check failed:', error)
      setIsDatabaseConnected(false)
    }
  }, [])

  const handleConnectToDatabase = async (): Promise<void> => {
    setIsLoading((prev) => ({ ...prev, database: true }))
    try {
      const response = await window.api.connectToDB()
      setIsDatabaseConnected(response)
    } catch (error) {
      console.error('Error connecting to database:', error)
      setIsDatabaseConnected(false)
    } finally {
      setIsLoading((prev) => ({ ...prev, database: false }))
    }
  }

  const handleStartServer = async (): Promise<void> => {
    setIsLoading((prev) => ({ ...prev, server: true }))
    try {
      const response = await window.api.startServer()
      if (response === 'Server already running' || response === 'Server started') {
        setServerStatus('online')
        await checkHealth()
      } else {
        setServerStatus('offline')
      }
    } catch (error) {
      console.error('Error starting server:', error)
      setServerStatus('offline')
    } finally {
      setIsLoading((prev) => ({ ...prev, server: false }))
    }
  }

  const handleStopServer = async (): Promise<void> => {
    setIsLoading((prev) => ({ ...prev, server: true }))
    try {
      const response = await window.api.stopServer()
      if (
        response === 'Server not running' ||
        response === 'Server stopped' ||
        response === 'Server stopped (was already closed)'
      ) {
        setServerStatus('offline')
        setIsServerHealthy(false)
        // Database connection is closed when server stops
        setIsDatabaseConnected(false)
      }
    } catch (error) {
      console.error('Error stopping server:', error)
      setServerStatus('offline')
      setIsServerHealthy(false)
      setIsDatabaseConnected(false)
    } finally {
      setIsLoading((prev) => ({ ...prev, server: false }))
    }
  }

  const handleInitializeWhatsapp = async (): Promise<void> => {
    setIsLoading((prev) => ({ ...prev, whatsapp: true }))
    try {
      const response = await window.api.initializeWhatsapp()
      if (response.success) {
        setWhatsappStatus(response.status as WhatsAppStatus)
      } else {
        setWhatsappStatus('auth_failure')
      }
    } catch (error) {
      console.error('Error initializing WhatsApp:', error)
      setWhatsappStatus('disconnected_error')
    } finally {
      setIsLoading((prev) => ({ ...prev, whatsapp: false }))
    }
  }

  const handleDisconnectWhatsapp = async (): Promise<void> => {
    setIsLoading((prev) => ({ ...prev, whatsapp: true }))
    try {
      await window.api.disconnectWhatsapp()
      setWhatsappStatus('disconnected')
      setWhatsappQrCode(null)
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error)
    } finally {
      setIsLoading((prev) => ({ ...prev, whatsapp: false }))
    }
  }

  const handleDeleteCache = async (): Promise<void> => {
    if (!confirm('Are you sure you want to delete WhatsApp auth and cache? This will require re-authentication.')) {
      return
    }

    if (!window.api || typeof window.api.deleteWhatsappAuth !== 'function') {
      setDeleteCacheMessage('Delete cache function not available. Please restart the app.')
      setTimeout(() => setDeleteCacheMessage(null), 5000)
      return
    }

    setIsLoading((prev) => ({ ...prev, deleteCache: true }))
    setDeleteCacheMessage(null)
    try {
      const response = await window.api.deleteWhatsappAuth()
      if (response.success) {
        setDeleteCacheMessage('Cache deleted successfully!')
        setWhatsappStatus('disconnected')
        setWhatsappQrCode(null)
        setTimeout(() => setDeleteCacheMessage(null), 5000)
      } else {
        setDeleteCacheMessage(response.error || 'Failed to delete cache')
        setTimeout(() => setDeleteCacheMessage(null), 5000)
      }
    } catch (error) {
      console.error('Error deleting cache:', error)
      setDeleteCacheMessage('Error deleting cache. Please restart the app and try again.')
      setTimeout(() => setDeleteCacheMessage(null), 5000)
    } finally {
      setIsLoading((prev) => ({ ...prev, deleteCache: false }))
    }
  }

  const checkWhatsappStatus = useCallback(async (): Promise<void> => {
    try {
      const status = await window.api.getWhatsappStatus()
      setWhatsappStatus(status as WhatsAppStatus)
    } catch (error) {
      console.error('Error checking WhatsApp status:', error)
    }
  }, [])

  // Initial checks and periodic health monitoring
  useEffect(() => {
    checkHealth()
    checkDatabaseConnection()
    checkWhatsappStatus()

    const healthInterval = setInterval(checkHealth, 5000)
    const dbInterval = setInterval(checkDatabaseConnection, 10000) // Check DB every 10 seconds
    const whatsappInterval = setInterval(checkWhatsappStatus, 3000) // Check WhatsApp every 3 seconds

    return () => {
      clearInterval(healthInterval)
      clearInterval(dbInterval)
      clearInterval(whatsappInterval)
    }
  }, [checkHealth, checkDatabaseConnection, checkWhatsappStatus])

  // Listen for WhatsApp status updates
  useEffect(() => {
    if (!window.api || typeof window.api.onWhatsappStatus !== 'function') {
      console.error('window.api.onWhatsappStatus is not available')
      return
    }

    const cleanup = window.api.onWhatsappStatus((_event, data) => {
      setWhatsappStatus(data.status as WhatsAppStatus)
      if (data.data?.qr) {
        setWhatsappQrCode(data.data.qr)
      } else if (data.status === 'ready' || data.status === 'disconnected') {
        setWhatsappQrCode(null)
      }
    })

    return cleanup
  }, [])

  const statusTextColor = {
    online: 'text-green-600',
    offline: 'text-red-600',
    pending: 'text-yellow-600'
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold text-center text-primary-color">Server Control Panel</h1>

        <div className="bg-white shadow-2xl rounded-xl p-6 space-y-4">
          {/* Server Controls */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              disabled={serverStatus === 'online' || isLoading.server}
              type="button"
              onClick={handleStartServer}
              isLoading={isLoading.server}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300"
            >
              Start Server
            </Button>
            <Button
              disabled={serverStatus === 'offline' || isLoading.server}
              type="button"
              onClick={handleStopServer}
              isLoading={isLoading.server}
              className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300"
            >
              Stop Server
            </Button>
          </div>

          {/* Database Connection */}
          <Button
            type="button"
            onClick={handleConnectToDatabase}
            isLoading={isLoading.database}
            className="w-full bg-blue-500 hover:bg-blue-600"
          >
            Connect to Database
          </Button>

          {/* WhatsApp Connection */}
          <div className="space-y-3">
            {whatsappStatus === 'disconnected' || whatsappStatus === 'disconnected_error' ? (
              <Button
                type="button"
                onClick={handleInitializeWhatsapp}
                isLoading={isLoading.whatsapp}
                className="w-full bg-green-500 hover:bg-green-600"
              >
                Connect WhatsApp
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleDisconnectWhatsapp}
                isLoading={isLoading.whatsapp}
                disabled={whatsappStatus === 'ready'}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-300"
              >
                Disconnect WhatsApp
              </Button>
            )}

            {/* QR Code Display */}
            {whatsappQrCode && (
              <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Scan this QR code with WhatsApp
                </p>
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <QRCodeSVG value={whatsappQrCode} size={256} level="H" />
                </div>
              </div>
            )}

            {/* Delete Cache Button */}
            <Button
              type="button"
              onClick={handleDeleteCache}
              isLoading={isLoading.deleteCache}
              className="w-full bg-orange-500 hover:bg-orange-600"
            >
              Delete WhatsApp Auth & Cache
            </Button>

            {/* Delete Cache Message */}
            {deleteCacheMessage && (
              <div
                className={`p-3 rounded-md text-sm ${
                  deleteCacheMessage.includes('successfully')
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : 'bg-red-100 text-red-700 border border-red-300'
                }`}
              >
                {deleteCacheMessage}
              </div>
            )}
          </div>

          {/* Status Indicators */}
          <div className="space-y-3 pt-4 border-t border-gray-200">
            {/* Server Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Status status={serverStatus} size={16} />
                <span className="font-medium">Server Status:</span>
              </div>
              <span className={`font-semibold ${statusTextColor[serverStatus]}`}>
                {serverStatus.charAt(0).toUpperCase() + serverStatus.slice(1)}
              </span>
            </div>

            {/* Server Health */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Status status={isServerHealthy ? 'online' : 'offline'} size={16} />
                <span className="font-medium">Server Health:</span>
              </div>
              <span
                className={`font-semibold ${isServerHealthy ? 'text-green-600' : 'text-red-600'}`}
              >
                {isServerHealthy ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>

            {/* Database Connection */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Status status={isDatabaseConnected ? 'online' : 'offline'} size={16} />
                <span className="font-medium">Database:</span>
              </div>
              <span
                className={`font-semibold ${isDatabaseConnected ? 'text-green-600' : 'text-red-600'}`}
              >
                {isDatabaseConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* WhatsApp Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Status
                  status={
                    whatsappStatus === 'ready'
                      ? 'online'
                      : whatsappStatus === 'qr_ready' || whatsappStatus === 'authenticated'
                        ? 'connecting'
                        : whatsappStatus === 'auth_failure' ||
                            whatsappStatus === 'disconnected_error'
                          ? 'error'
                          : 'offline'
                  }
                  size={16}
                />
                <span className="font-medium">WhatsApp:</span>
              </div>
              <span
                className={`font-semibold ${
                  whatsappStatus === 'ready'
                    ? 'text-green-600'
                    : whatsappStatus === 'qr_ready' || whatsappStatus === 'authenticated'
                      ? 'text-yellow-600'
                      : whatsappStatus === 'auth_failure' || whatsappStatus === 'disconnected_error'
                        ? 'text-red-600'
                        : 'text-gray-600'
                }`}
              >
                {whatsappStatus === 'ready'
                  ? 'Connected'
                  : whatsappStatus === 'qr_ready'
                    ? 'QR Ready'
                    : whatsappStatus === 'authenticated'
                      ? 'Authenticating'
                      : whatsappStatus === 'connecting'
                        ? 'Connecting'
                        : whatsappStatus === 'auth_failure'
                          ? 'Auth Failed'
                          : whatsappStatus === 'disconnected_error'
                            ? 'Error'
                            : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

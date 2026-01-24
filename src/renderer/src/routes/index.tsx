import Button from '@renderer/components/Button'
import Status from '@renderer/components/Status'
import Toast from '@renderer/components/Toast'
import { useToast } from '@renderer/hooks/useToast'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Server,
  Database,
  MessageCircle,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react'

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
  const [databaseError, setDatabaseError] = useState<string | null>(null)
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>('disconnected')
  const [whatsappQrCode, setWhatsappQrCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState({
    server: false,
    database: false,
    whatsapp: false,
    deleteCache: false
  })
  const [deleteCacheMessage, setDeleteCacheMessage] = useState<string | null>(null)
  const [whatsappError, setWhatsappError] = useState<string | null>(null)
  const [whatsappSuggestion, setWhatsappSuggestion] = useState<string | null>(null)
  const { toasts, removeToast, success, error: showError } = useToast()

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
      if (response) {
        setDatabaseError(null)
      }
    } catch (error) {
      console.error('Database connection check failed:', error)
      setIsDatabaseConnected(false)
    }
  }, [])

  const handleConnectToDatabase = async (): Promise<void> => {
    setIsLoading((prev) => ({ ...prev, database: true }))
    setDatabaseError(null)
    try {
      const response = await window.api.connectToDB()
      if (response && typeof response === 'object' && 'success' in response) {
        setIsDatabaseConnected(response.success)
        if (!response.success && response.error) {
          setDatabaseError(response.error)
          showError(response.error)
        } else if (response.success) {
          setDatabaseError(null)
          success('Database connected successfully!')
        }
      } else {
        // Fallback for boolean response (backward compatibility)
        setIsDatabaseConnected(Boolean(response))
        if (!response) {
          setDatabaseError('Failed to connect to database')
          showError('Failed to connect to database')
        } else {
          success('Database connected successfully!')
        }
      }
    } catch (error) {
      console.error('Error connecting to database:', error)
      setIsDatabaseConnected(false)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setDatabaseError(errorMessage)
      showError(errorMessage)
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
        success('Server started successfully!')
      } else {
        setServerStatus('offline')
        showError('Failed to start server')
      }
    } catch (error) {
      console.error('Error starting server:', error)
      setServerStatus('offline')
      showError('Error starting server')
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
        success('Server stopped successfully')
      }
    } catch (error) {
      console.error('Error stopping server:', error)
      setServerStatus('offline')
      setIsServerHealthy(false)
      setIsDatabaseConnected(false)
      showError('Error stopping server')
    } finally {
      setIsLoading((prev) => ({ ...prev, server: false }))
    }
  }

  const handleInitializeWhatsapp = async (): Promise<void> => {
    setIsLoading((prev) => ({ ...prev, whatsapp: true }))
    setWhatsappError(null)
    setWhatsappSuggestion(null)
    try {
      const response = await window.api.initializeWhatsapp()
      if (response.success) {
        setWhatsappStatus(response.status as WhatsAppStatus)
      } else {
        setWhatsappStatus('auth_failure')
        if (response.error) {
          setWhatsappError(response.error)
          showError(response.error)
        }
      }
    } catch (error) {
      console.error('Error initializing WhatsApp:', error)
      setWhatsappStatus('disconnected_error')
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setWhatsappError(errorMsg)
      showError(errorMsg)
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
    if (
      !confirm(
        'Are you sure you want to delete WhatsApp auth and cache? This will require re-authentication.'
      )
    ) {
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
        setWhatsappError(null)
        setWhatsappSuggestion(null)
        success('WhatsApp cache deleted successfully!')
        setTimeout(() => setDeleteCacheMessage(null), 5000)
      } else {
        const errorMsg = response.error || 'Failed to delete cache'
        setDeleteCacheMessage(errorMsg)
        showError(errorMsg)
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

  const handleCleanupSession = async (): Promise<void> => {
    if (
      !confirm(
        'Are you sure you want to clean up the WhatsApp session? This will delete all session data and require re-authentication.'
      )
    ) {
      return
    }

    if (!window.api || typeof window.api.cleanupWhatsappSession !== 'function') {
      showError('Cleanup session function not available. Please restart the app.')
      return
    }

    setIsLoading((prev) => ({ ...prev, deleteCache: true }))
    try {
      const response = await window.api.cleanupWhatsappSession()
      if (response.success) {
        setWhatsappStatus('disconnected')
        setWhatsappQrCode(null)
        setWhatsappError(null)
        setWhatsappSuggestion(null)
        success('WhatsApp session cleaned successfully! You can now reconnect.')
      } else {
        const errorMsg = response.error || 'Failed to cleanup session'
        showError(errorMsg)
      }
    } catch (error) {
      console.error('Error cleaning up session:', error)
      showError('Error cleaning up session. Please restart the app and try again.')
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

      // Handle error data with suggestions
      if (data.data && typeof data.data === 'object') {
        if ('qr' in data.data && data.data.qr) {
          setWhatsappQrCode(data.data.qr as string)
        } else if (data.status === 'ready' || data.status === 'disconnected') {
          setWhatsappQrCode(null)
        }

        // Check for error and suggestion
        if ('error' in data.data && data.data.error) {
          setWhatsappError(data.data.error as string)
        }
        if ('suggestion' in data.data && data.data.suggestion) {
          setWhatsappSuggestion(data.data.suggestion as string)
        }
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
    <div className="flex flex-col min-h-screen bg-gray-50 p-4 pt-20">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>

      <div className="w-full max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
            <Server className="w-10 h-10 text-blue-600" />
            ClinicMessenger Control Panel
          </h1>
          <p className="text-gray-600">Manage your automated WhatsApp messaging system</p>
        </div>

        {/* Server Controls Card */}
        <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Server className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Server Controls</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              disabled={serverStatus === 'online' || isLoading.server}
              type="button"
              onClick={handleStartServer}
              isLoading={isLoading.server}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 flex items-center justify-center gap-2"
            >
              <Power className="w-4 h-4" />
              Start Server
            </Button>
            <Button
              disabled={serverStatus === 'offline' || isLoading.server}
              type="button"
              onClick={handleStopServer}
              isLoading={isLoading.server}
              className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 flex items-center justify-center gap-2"
            >
              <PowerOff className="w-4 h-4" />
              Stop Server
            </Button>
          </div>
        </div>

        {/* Database Connection Card */}
        <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Database className="w-6 h-6 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Database Connection</h2>
          </div>
          <Button
            type="button"
            onClick={handleConnectToDatabase}
            isLoading={isLoading.database}
            className="w-full bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center gap-2"
          >
            <Database className="w-4 h-4" />
            {isDatabaseConnected ? 'Reconnect Database' : 'Connect to Database'}
          </Button>
        </div>

        {/* WhatsApp Connection Card */}
        <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <MessageCircle className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">WhatsApp Connection</h2>
          </div>
          <div className="space-y-4">
            {whatsappStatus === 'disconnected' || whatsappStatus === 'disconnected_error' ? (
              <Button
                type="button"
                onClick={handleInitializeWhatsapp}
                isLoading={isLoading.whatsapp}
                className="w-full bg-green-500 hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Connect WhatsApp
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleDisconnectWhatsapp}
                isLoading={isLoading.whatsapp}
                disabled={whatsappStatus === 'ready'}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-300 flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                Disconnect WhatsApp
              </Button>
            )}

            {/* QR Code Display */}
            {whatsappQrCode && (
              <div className="flex flex-col items-center p-6 bg-green-50 rounded-xl border-2 border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-green-600" />
                  <p className="text-sm font-semibold text-green-900">Scan QR Code with WhatsApp</p>
                </div>
                <p className="text-xs text-green-700 mb-4">
                  Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                </p>
                <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-green-300">
                  <QRCodeSVG value={whatsappQrCode} size={280} level="H" />
                </div>
              </div>
            )}

            {/* Delete Cache Button */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                onClick={handleDeleteCache}
                isLoading={isLoading.deleteCache}
                className="bg-orange-500 hover:bg-orange-600 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Auth Cache
              </Button>

              <Button
                type="button"
                onClick={handleCleanupSession}
                isLoading={isLoading.deleteCache}
                className="bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Clean Session
              </Button>
            </div>

            {/* Delete Cache Message */}
            {deleteCacheMessage && (
              <div
                className={`p-4 rounded-lg border-2 ${
                  deleteCacheMessage.includes('successfully')
                    ? 'bg-green-50 text-green-800 border-green-300'
                    : 'bg-red-50 text-red-800 border-red-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {deleteCacheMessage.includes('successfully') ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <p className="text-sm font-medium">{deleteCacheMessage}</p>
                </div>
              </div>
            )}

            {/* WhatsApp Error Display */}
            {whatsappError && (
              <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900">Connection Error</p>
                    <p className="text-sm text-red-700 mt-1">{whatsappError}</p>
                    {whatsappSuggestion && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-xs font-medium text-yellow-900">💡 Suggestion:</p>
                        <p className="text-xs text-yellow-800 mt-1">{whatsappSuggestion}</p>
                      </div>
                    )}
                    <Button
                      type="button"
                      onClick={handleCleanupSession}
                      className="mt-3 bg-yellow-500 hover:bg-yellow-600 text-sm flex items-center gap-2"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Clean Session & Retry
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* System Status Card */}
        <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <RefreshCw className="w-6 h-6 text-purple-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">System Status</h2>
            </div>
            <button
              onClick={() => {
                checkHealth()
                checkDatabaseConnection()
                checkWhatsappStatus()
              }}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh Status"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Server Status */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Server</span>
                </div>
                <Status status={serverStatus} size={14} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Status</span>
                <span className={`text-sm font-semibold ${statusTextColor[serverStatus]}`}>
                  {serverStatus.charAt(0).toUpperCase() + serverStatus.slice(1)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">Health</span>
                <div className="flex items-center gap-2">
                  <Status status={isServerHealthy ? 'online' : 'offline'} size={12} />
                  <span
                    className={`text-sm font-semibold ${isServerHealthy ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {isServerHealthy ? 'Healthy' : 'Unhealthy'}
                  </span>
                </div>
              </div>
            </div>

            {/* Database Status */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Database</span>
                </div>
                <Status
                  status={isDatabaseConnected ? 'online' : databaseError ? 'error' : 'offline'}
                  size={14}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Connection</span>
                <span
                  className={`text-sm font-semibold ${isDatabaseConnected ? 'text-green-600' : 'text-red-600'}`}
                >
                  {isDatabaseConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {databaseError && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {databaseError}
                </div>
              )}
            </div>

            {/* WhatsApp Status */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">WhatsApp</span>
                </div>
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
                  size={14}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Status</span>
                <span
                  className={`text-sm font-semibold ${
                    whatsappStatus === 'ready'
                      ? 'text-green-600'
                      : whatsappStatus === 'qr_ready' || whatsappStatus === 'authenticated'
                        ? 'text-yellow-600'
                        : whatsappStatus === 'auth_failure' ||
                            whatsappStatus === 'disconnected_error'
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
    </div>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import Button from '@renderer/components/Button'
import Input from '@renderer/components/Input'
import Toast from '@renderer/components/Toast'
import { useToast } from '@renderer/hooks/useToast'
import { dbConfigSchema, type IDatabaseForm } from '@renderer/utils'
import type { ReminderType } from '@renderer/utils/appointmentSettings'
import { createFileRoute } from '@tanstack/react-router'
import {
  Bell,
  CheckCircle,
  Database,
  Key,
  RefreshCw,
  Save,
  Server,
  Settings as SettingsIcon,
  User,
  XCircle
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

export const Route = createFileRoute('/settings/')({
  component: SettingsScreen
})

function SettingsScreen(): React.ReactNode {
  // Appointment Reminder Settings
  const [reminderType, setReminderType] = useState<ReminderType>('1day')
  const [customHours, setCustomHours] = useState<number>(24)
  const [enabled, setEnabled] = useState<boolean>(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Database Configuration
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<IDatabaseForm>({
    resolver: zodResolver(dbConfigSchema)
  })

  const [isDbSaving, setIsDbSaving] = useState(false)
  const [isDbConnecting, setIsDbConnecting] = useState(false)
  const [dbConnectionStatus, setDbConnectionStatus] = useState<
    'connected' | 'disconnected' | 'unknown'
  >('unknown')
  const [dbError, setDbError] = useState<string | null>(null)

  const { toasts, removeToast, success, error: showError } = useToast()

  const checkDbConnection = async (): Promise<void> => {
    try {
      const isConnected = await window.api.checkDbStatus()
      setDbConnectionStatus(isConnected ? 'connected' : 'disconnected')
      if (!isConnected) {
        setDbError(null)
      }
    } catch (error) {
      console.error('Error checking database connection:', error)
      setDbConnectionStatus('disconnected')
    }
  }

  const handleDbConnect = async (): Promise<void> => {
    setIsDbConnecting(true)
    setDbError(null)
    try {
      const result = await window.api.connectToDB()
      if (result && typeof result === 'object' && 'success' in result) {
        if (result.success) {
          setDbConnectionStatus('connected')
          success('Database connected successfully!')
        } else {
          setDbConnectionStatus('disconnected')
          setDbError(result.error || 'Failed to connect')
          showError(result.error || 'Failed to connect to database')
        }
      } else {
        const isConnected = Boolean(result)
        setDbConnectionStatus(isConnected ? 'connected' : 'disconnected')
        if (isConnected) {
          success('Database connected successfully!')
        } else {
          showError('Failed to connect to database')
        }
      }
    } catch (error) {
      console.error('Error connecting to database:', error)
      setDbConnectionStatus('disconnected')
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setDbError(errorMessage)
      showError(errorMessage)
    } finally {
      setIsDbConnecting(false)
    }
  }

  const onDbSubmit = handleSubmit(async (data) => {
    setIsDbSaving(true)
    setDbError(null)
    try {
      const response = await window.api.createDbConfigFile(data)
      if (response) {
        success('Database configuration saved successfully!')
        // Optionally try to connect after saving
        setTimeout(() => {
          handleDbConnect()
        }, 500)
      } else {
        showError('Failed to save database configuration')
      }
    } catch (error) {
      console.error('Error saving database config:', error)
      showError('An error occurred while saving the database configuration')
    } finally {
      setIsDbSaving(false)
    }
  })

  const loadSettings = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      const settings = await window.api.getAppointmentReminderSettings()
      setReminderType(settings.reminderType)
      setCustomHours(settings.customHours)
      setEnabled(settings.enabled)
    } catch (error) {
      console.error('Error loading settings:', error)
      showError('Error loading reminder settings')
    } finally {
      setIsLoading(false)
    }
  }, [showError])

  const handleSave = useCallback(async (): Promise<void> => {
    setIsSaving(true)
    try {
      const result = await window.api.setAppointmentReminderSettings({
        reminderType,
        customHours,
        enabled
      })

      if (result.success) {
        success('Reminder settings saved successfully!')
      } else {
        showError(result.error || 'Failed to save reminder settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      showError('Error saving reminder settings')
    } finally {
      setIsSaving(false)
    }
  }, [reminderType, customHours, enabled, success, showError])

  const reminderOptions: Array<{ value: ReminderType; label: string }> = [
    { value: '1day', label: '1 Day Before' },
    { value: '2days', label: '2 Days Before' },
    { value: 'custom', label: 'Custom Hours' }
  ]

  useEffect(() => {
    loadSettings()
    checkDbConnection()
    // Check DB connection status periodically
    const interval = setInterval(checkDbConnection, 5000)
    return () => clearInterval(interval)
  }, [loadSettings])

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
        <div>
          <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-blue-600" />
            Settings
          </h1>
          <p className="text-gray-600 mt-2">Configure your application settings</p>
        </div>

        {/* Database Configuration */}
        <div className="bg-white shadow-lg rounded-xl p-6 space-y-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Database className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Database Configuration</h2>
                <p className="text-sm text-gray-500">
                  Configure your SQL Server database connection
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dbConnectionStatus === 'connected' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Connected
                </div>
              ) : dbConnectionStatus === 'disconnected' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                  <XCircle className="w-4 h-4" />
                  Disconnected
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                  Unknown
                </div>
              )}
            </div>
          </div>

          <form onSubmit={onDbSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="db-server"
                  className=" text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"
                >
                  <Server className="w-4 h-4 text-gray-500" />
                  Server / Host
                </label>
                <input
                  {...register('server')}
                  id="db-server"
                  type="text"
                  placeholder="localhost or 192.168.1.100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.server && (
                  <p className="text-red-500 text-sm mt-1">{errors.server.message}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="db-database"
                  className=" text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"
                >
                  <Database className="w-4 h-4 text-gray-500" />
                  Database Name
                </label>
                <input
                  {...register('database')}
                  id="db-database"
                  type="text"
                  placeholder="YourDatabaseName"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.database && (
                  <p className="text-red-500 text-sm mt-1">{errors.database.message}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="db-user"
                  className=" text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"
                >
                  <User className="w-4 h-4 text-gray-500" />
                  Username
                </label>
                <input
                  {...register('user')}
                  id="db-user"
                  type="text"
                  placeholder="sa or your_username"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.user && <p className="text-red-500 text-sm mt-1">{errors.user.message}</p>}
              </div>

              <div>
                <label
                  htmlFor="db-password"
                  className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"
                >
                  <Key className="w-4 h-4 text-gray-500" />
                  Password
                </label>
                <input
                  {...register('password')}
                  id="db-password"
                  type="password"
                  placeholder="Your password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {errors.password && (
                  <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
                )}
              </div>
            </div>

            {dbError && (
              <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-700">
                    <strong className="font-semibold">Connection Error:</strong> {dbError}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <Button
                type="button"
                onClick={handleDbConnect}
                isLoading={isDbConnecting}
                disabled={isDbConnecting || isDbSaving}
                className="bg-green-500 hover:bg-green-600 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Test Connection
              </Button>
              <Button
                type="button"
                onClick={() => reset()}
                disabled={isDbSaving || isDbConnecting}
                className="bg-gray-500 hover:bg-gray-600 flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </Button>
              <Button
                type="submit"
                isLoading={isDbSaving}
                disabled={isDbSaving || isDbConnecting}
                className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Configuration
              </Button>
            </div>
          </form>
        </div>

        {/* Appointment Reminder Settings */}
        <div className="bg-white shadow-lg rounded-xl p-6 space-y-6 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Bell className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Appointment Reminder Settings</h2>
              <p className="text-sm text-gray-500">Configure when to send appointment reminders</p>
            </div>
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-700">Enable Reminders</label>
              <p className="text-xs text-gray-500 mt-1">
                Automatically send reminder messages before appointments
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={isLoading || isSaving}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Reminder Type Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Reminder Timing</label>
            <select
              value={reminderType}
              onChange={(e) => setReminderType(e.target.value as ReminderType)}
              disabled={isLoading || isSaving || !enabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              {reminderOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Hours Input */}
          {reminderType === 'custom' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Custom Hours Before Appointment
              </label>
              <Input
                type="number"
                min="1"
                max="168"
                value={customHours.toString()}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1
                  setCustomHours(Math.max(1, Math.min(168, value))) // Limit between 1 and 168 hours (7 days)
                }}
                disabled={isLoading || isSaving || !enabled}
                placeholder="Enter hours (1-168)"
              />
              <p className="text-xs text-gray-500">
                Enter the number of hours before the appointment to send the reminder (1-168 hours)
              </p>
            </div>
          )}

          {/* Preview */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900">Current Setting:</p>
            <p className="text-sm text-blue-700 mt-1">
              {enabled
                ? reminderType === '1day'
                  ? 'Reminders will be sent 1 day (24 hours) before appointments'
                  : reminderType === '2days'
                    ? 'Reminders will be sent 2 days (48 hours) before appointments'
                    : `Reminders will be sent ${customHours} hour${customHours !== 1 ? 's' : ''} before appointments`
                : 'Reminders are currently disabled'}
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              onClick={loadSettings}
              disabled={isLoading || isSaving}
              isLoading={isLoading}
              className="bg-gray-500 hover:bg-gray-600 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isLoading || isSaving}
              isLoading={isSaving}
              className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

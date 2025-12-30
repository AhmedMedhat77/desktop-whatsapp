import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useMemo } from 'react'
import {
  getMessagesFromStorage,
  clearMessagesFromStorage,
  isDuplicateMessage,
  saveMessageToStorage,
  type StoredMessage,
  type MessageType
} from '@renderer/utils/localStorage'
import Button from '@renderer/components/Button'
import Status from '@renderer/components/Status'
import ScheduleControls, { type ScheduleDelay } from '@renderer/components/ScheduleControls'
import Input from '@renderer/components/Input'
import Toast from '@renderer/components/Toast'
import { useToast } from '@renderer/hooks/useToast'
import { Search, Filter, X, Send, RefreshCw, Trash2, MessageSquare, AlertCircle } from 'lucide-react'

export const Route = createFileRoute('/messages/')({
  component: MessagesScreen
})

function MessagesScreen(): React.ReactNode {
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<MessageType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'failed' | 'pending'>('all')
  const { toasts, removeToast, success, error: showError } = useToast()

  const loadMessages = (): void => {
    // Prevent multiple simultaneous loads
    if (isLoading) return
    
    setIsLoading(true)
    try {
      const storedMessages = getMessagesFromStorage()
      console.log('Loaded messages from storage:', storedMessages.length)
      // Sort by date (most recent first)
      const sortedMessages = storedMessages.sort((a, b) => {
        try {
          const dateA = new Date(a.sentAt || a.createdAt).getTime()
          const dateB = new Date(b.sentAt || b.createdAt).getTime()
          return dateB - dateA
        } catch {
          return 0
        }
      })
      setMessages(sortedMessages)
    } catch (error) {
      console.error('Error loading messages:', error)
      // Set empty array on error to prevent crashes
      setMessages([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Debug: Check if API is available
    if (process.env.NODE_ENV === 'development') {
      console.log('Available API methods:', window.api ? Object.keys(window.api) : 'window.api is undefined')
      console.log('sendMessage available:', typeof window.api?.sendMessage)
    }

    loadMessages()
    // Refresh messages every 2 seconds
    const interval = setInterval(loadMessages, 2000)

    // Listen for new messages from the main process
    if (window.api && typeof window.api.onMessageSent === 'function') {
      const cleanup = window.api.onMessageSent((_event, data) => {
        console.log('Message received from main process:', data)
        // For pending messages, always save (they will be updated when status changes)
        // For sent/failed messages, check for duplicates (but still allow updating pending)
        // Always save if it's a new message type or if we need to update a pending one
        const shouldSave =
          data.status === 'pending' ||
          !isDuplicateMessage(data.phoneNumber, data.message, data.messageType)

        if (shouldSave) {
          console.log('Saving message to storage:', {
            phoneNumber: data.phoneNumber,
            status: data.status,
            messageType: data.messageType
          })
          saveMessageToStorage({
            phoneNumber: data.phoneNumber,
            userName: data.userName,
            message: data.message,
            messageType: data.messageType || 'manual',
            status: data.status,
            sentAt: data.sentAt,
            error: data.error
          })
          loadMessages() // Refresh the list
        } else {
          console.log('Message skipped (duplicate):', data.phoneNumber)
        }
      })

      return () => {
        clearInterval(interval)
        cleanup()
      }
    }

    return () => clearInterval(interval)
  }, [])

  const handleClearMessages = (): void => {
    if (confirm('Are you sure you want to clear all messages? This action cannot be undone.')) {
      clearMessagesFromStorage()
      loadMessages()
      success('All messages cleared successfully')
    }
  }

  // Filter and search messages
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Search filter
      const matchesSearch =
        !searchQuery ||
        msg.phoneNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.message.toLowerCase().includes(searchQuery.toLowerCase())

      // Type filter
      const matchesType = filterType === 'all' || msg.messageType === filterType

      // Status filter
      const matchesStatus = filterStatus === 'all' || msg.status === filterStatus

      return matchesSearch && matchesType && matchesStatus
    })
  }, [messages, searchQuery, filterType, filterStatus])

  // Calculate statistics
  const stats = useMemo(() => {
    return {
      total: messages.length,
      sent: messages.filter((m) => m.status === 'sent').length,
      failed: messages.filter((m) => m.status === 'failed').length,
      pending: messages.filter((m) => m.status === 'pending').length,
      appointment: messages.filter((m) => m.messageType === 'appointment').length,
      reminder: messages.filter((m) => m.messageType === 'appointmentReminder').length,
      newPatient: messages.filter((m) => m.messageType === 'newPatient').length,
      manual: messages.filter((m) => m.messageType === 'manual').length
    }
  }, [messages])

  const handleSchedule = async (delay: ScheduleDelay, customDelayMs?: number): Promise<void> => {
    if (!phoneNumber.trim() || !message.trim()) {
      setSendError('Please enter both phone number and message')
      return
    }

    // Check for duplicates
    if (isDuplicateMessage(phoneNumber, message, 'manual')) {
      setSendError('This message was already sent to this number in the last 24 hours')
      return
    }

    // Check if API is available
    if (!window.api || typeof window.api.sendMessage !== 'function') {
      setSendError('Send message function is not available. Please restart the app.')
      return
    }

    setIsSending(true)
    setSendError(null)

    try {
      const result = await window.api.sendMessage(phoneNumber, message, delay, customDelayMs)
      if (result.success) {
        if (result.scheduled) {
          success(`Message scheduled successfully!`)
        } else {
          success('Message sent successfully!')
        }
        setPhoneNumber('')
        setMessage('')
        setShowSchedule(false)
        loadMessages()
      } else {
        const errorMsg = result.error || 'Failed to send message'
        setSendError(errorMsg)
        showError(errorMsg)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setSendError(error instanceof Error ? error.message : 'Unknown error occurred')
    } finally {
      setIsSending(false)
    }
  }

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString)
      return date.toLocaleString()
    } catch {
      return dateString
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'sent':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'pending':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (status: string): 'online' | 'offline' | 'error' | 'pending' => {
    switch (status) {
      case 'sent':
        return 'online'
      case 'failed':
        return 'error'
      case 'pending':
        return 'pending'
      default:
        return 'offline'
    }
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

      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-8 h-8 text-blue-600" />
              Messages
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage and track all sent messages
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => setShowSchedule(!showSchedule)}
              className="bg-green-500 hover:bg-green-600 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {showSchedule ? 'Hide Send' : 'Send Message'}
            </Button>
            <Button
              type="button"
              onClick={loadMessages}
              isLoading={isLoading}
              className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            <Button
              type="button"
              onClick={handleClearMessages}
              className="bg-red-500 hover:bg-red-600 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
            <div className="text-xs text-gray-500">Total</div>
            <div className="text-xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 shadow-sm border border-green-200">
            <div className="text-xs text-green-600">Sent</div>
            <div className="text-xl font-bold text-green-700">{stats.sent}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3 shadow-sm border border-red-200">
            <div className="text-xs text-red-600">Failed</div>
            <div className="text-xl font-bold text-red-700">{stats.failed}</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3 shadow-sm border border-yellow-200">
            <div className="text-xs text-yellow-600">Pending</div>
            <div className="text-xl font-bold text-yellow-700">{stats.pending}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 shadow-sm border border-blue-200">
            <div className="text-xs text-blue-600">Appointment</div>
            <div className="text-xl font-bold text-blue-700">{stats.appointment}</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 shadow-sm border border-purple-200">
            <div className="text-xs text-purple-600">Reminder</div>
            <div className="text-xl font-bold text-purple-700">{stats.reminder}</div>
          </div>
          <div className="bg-indigo-50 rounded-lg p-3 shadow-sm border border-indigo-200">
            <div className="text-xs text-indigo-600">New Patient</div>
            <div className="text-xl font-bold text-indigo-700">{stats.newPatient}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 shadow-sm border border-gray-200">
            <div className="text-xs text-gray-600">Manual</div>
            <div className="text-xl font-bold text-gray-700">{stats.manual}</div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name, phone, or message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as MessageType | 'all')}
                  className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  <option value="all">All Types</option>
                  <option value="appointment">Appointment</option>
                  <option value="appointmentReminder">Reminder</option>
                  <option value="newPatient">New Patient</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <select
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(e.target.value as 'all' | 'sent' | 'failed' | 'pending')
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              >
                <option value="all">All Status</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </div>

        {/* Send Message Form */}
        {showSchedule && (
          <div className="bg-white shadow-lg rounded-xl p-6 space-y-4 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Send className="w-5 h-5" />
              Send Message
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <Input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Enter phone number"
                  disabled={isSending}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter message"
                  disabled={isSending}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
              {sendError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  {sendError}
                </div>
              )}
              <ScheduleControls
                onSchedule={handleSchedule}
                disabled={isSending}
                isLoading={isSending}
              />
            </div>
          </div>
        )}

        <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
          {filteredMessages.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">
                {messages.length === 0 ? 'No messages yet' : 'No messages match your filters'}
              </p>
              <p className="text-gray-400 text-sm mt-2">
                {messages.length === 0
                  ? 'Messages will appear here once they are sent'
                  : 'Try adjusting your search or filter criteria'}
              </p>
              {(searchQuery || filterType !== 'all' || filterStatus !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setFilterType('all')
                    setFilterStatus('all')
                  }}
                  className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-600">
                  Showing <span className="font-semibold">{filteredMessages.length}</span> of{' '}
                  <span className="font-semibold">{messages.length}</span> messages
                </div>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
                {filteredMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`border-2 rounded-xl p-5 transition-all hover:shadow-md ${getStatusColor(message.status)}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-1">
                          <Status status={getStatusIcon(message.status)} size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="font-semibold text-lg text-gray-900 truncate">
                              {message.userName || 'Unknown User'}
                            </div>
                          </div>
                          <div className="text-sm text-gray-600 font-mono">{message.phoneNumber}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(message.sentAt || message.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-4">
                        <span
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                            message.status === 'sent'
                              ? 'bg-green-100 text-green-800 border border-green-300'
                              : message.status === 'failed'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                          }`}
                        >
                          {message.status.toUpperCase()}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                            message.messageType === 'appointment'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : message.messageType === 'appointmentReminder'
                                ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                : message.messageType === 'newPatient'
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                  : 'bg-gray-100 text-gray-800 border border-gray-300'
                          }`}
                        >
                          {message.messageType === 'appointment'
                            ? 'Appointment'
                            : message.messageType === 'appointmentReminder'
                              ? 'Reminder'
                              : message.messageType === 'newPatient'
                                ? 'New Patient'
                                : 'Manual'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 p-4 bg-white/80 rounded-lg border border-gray-200 shadow-sm">
                      <p className="text-sm whitespace-pre-wrap break-words text-gray-800 leading-relaxed">
                        {message.message}
                      </p>
                    </div>
                    {message.error && (
                      <div className="mt-3 p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="text-xs text-red-700">
                            <strong className="font-semibold">Error:</strong> {message.error}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


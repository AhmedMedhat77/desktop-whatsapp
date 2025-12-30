export type MessageType = 'appointment' | 'appointmentReminder' | 'newPatient' | 'manual'

export interface StoredMessage {
  id: string
  phoneNumber: string
  userName?: string
  message: string
  messageType: MessageType
  status: 'sent' | 'failed' | 'pending'
  sentAt: string
  createdAt: string
  error?: string
}

const STORAGE_KEY = 'whatsapp_messages'
const MAX_STORED_MESSAGES = 1000 // Limit to prevent localStorage from getting too large

/**
 * Find a pending message by phone number and message content
 */
const findPendingMessage = (
  messages: StoredMessage[],
  phoneNumber: string,
  message: string
): StoredMessage | undefined => {
  try {
    const normalizedPhone = phoneNumber.replace(/\D/g, '')
    const normalizedMessage = message.trim().toLowerCase()

    // Find the most recent pending message with matching phone and message
    // Look within the last 5 minutes to match pending messages
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

    return messages.find((msg) => {
      try {
        const msgPhone = (msg.phoneNumber || '').replace(/\D/g, '')
        const msgText = (msg.message || '').trim().toLowerCase()

        // Safely parse date
        let msgTime = 0
        try {
          const dateStr = msg.createdAt || msg.sentAt
          if (dateStr) {
            const parsedDate = new Date(dateStr)
            if (!isNaN(parsedDate.getTime())) {
              msgTime = parsedDate.getTime()
            }
          }
        } catch {
          // If date parsing fails, skip this message
          return false
        }

        return (
          msg.status === 'pending' &&
          msgPhone === normalizedPhone &&
          msgText === normalizedMessage &&
          msgTime > fiveMinutesAgo
        )
      } catch {
        // Skip messages with invalid data
        return false
      }
    })
  } catch (error) {
    console.error('Error finding pending message:', error)
    return undefined
  }
}

/**
 * Save a message to localStorage
 * If a pending message exists with the same phone and message, it will be updated instead of creating a duplicate
 */
export const saveMessageToStorage = (message: Omit<StoredMessage, 'id' | 'createdAt'>): void => {
  try {
    console.log('Saving message to storage:', {
      phoneNumber: message.phoneNumber,
      status: message.status,
      messageType: message.messageType,
      userName: message.userName
    })

    const messages = getMessagesFromStorage()

    // If status is 'sent' or 'failed', try to find and update existing pending message
    if (message.status === 'sent' || message.status === 'failed') {
      const pendingMessage = findPendingMessage(messages, message.phoneNumber, message.message)

      if (pendingMessage) {
        console.log('Found pending message to update:', pendingMessage.id)
        // Update the existing pending message
        const index = messages.findIndex((msg) => msg.id === pendingMessage.id)
        if (index !== -1) {
          messages[index].status = message.status
          messages[index].sentAt = message.sentAt
          if (message.error) {
            messages[index].error = message.error
          }
          // Also update userName and messageType if provided
          if (message.userName) {
            messages[index].userName = message.userName
          }
          if (message.messageType) {
            messages[index].messageType = message.messageType
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
          console.log('Updated pending message to:', message.status)
          return
        }
      } else {
        console.log('No pending message found, will create new entry for:', message.status)
      }
      // If no pending message found, continue to create a new entry (don't return here)
      // This handles cases where messages are sent directly without going through pending state
    }

    // If status is 'pending', check if there's already a pending message to avoid duplicates
    if (message.status === 'pending') {
      const existingPending = findPendingMessage(messages, message.phoneNumber, message.message)
      if (existingPending) {
        // Don't create duplicate pending messages
        return
      }
    }

    // If no pending message found or status is 'pending' (and no duplicate), create a new entry
    const newMessage: StoredMessage = {
      ...message,
      messageType: message.messageType || 'manual',
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString()
    }
    messages.unshift(newMessage) // Add to beginning

    // Keep only the most recent messages
    const trimmedMessages = messages.slice(0, MAX_STORED_MESSAGES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedMessages))
    console.log('Created new message entry:', {
      id: newMessage.id,
      status: newMessage.status,
      messageType: newMessage.messageType,
      totalMessages: trimmedMessages.length
    })
  } catch (error) {
    console.error('Error saving message to localStorage:', error)
  }
}

/**
 * Get all messages from localStorage
 */
export const getMessagesFromStorage = (): StoredMessage[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const messages = JSON.parse(stored) as StoredMessage[]

    // Validate and clean messages to prevent crashes
    return messages
      .filter((msg) => {
        // Filter out invalid messages
        if (!msg || typeof msg !== 'object') return false
        if (!msg.phoneNumber || !msg.message) return false
        if (!msg.status || !['sent', 'failed', 'pending'].includes(msg.status)) return false
        if (
          !msg.messageType ||
          !['appointment', 'appointmentReminder', 'newPatient', 'manual'].includes(msg.messageType)
        )
          return false
        return true
      })
      .map((msg) => {
        // Ensure all required fields exist
        return {
          id: msg.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          phoneNumber: String(msg.phoneNumber || ''),
          userName: msg.userName,
          message: String(msg.message || ''),
          messageType: (msg.messageType || 'manual') as MessageType,
          status: msg.status as 'sent' | 'failed' | 'pending',
          sentAt: msg.sentAt || new Date().toISOString(),
          createdAt: msg.createdAt || msg.sentAt || new Date().toISOString(),
          error: msg.error
        }
      })
  } catch (error) {
    console.error('Error reading messages from localStorage:', error)
    // If there's corrupted data, try to clear it
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore errors when clearing
    }
    return []
  }
}

/**
 * Check if a message to a phone number already exists (duplicate check)
 * Considers message type to allow different message types to the same user
 */
export const isDuplicateMessage = (
  phoneNumber: string,
  message: string,
  messageType?: MessageType
): boolean => {
  try {
    const messages = getMessagesFromStorage()
    const normalizedPhone = phoneNumber.replace(/\D/g, '') // Remove non-digits
    const normalizedMessage = message.trim().toLowerCase()

    // Check if same message was sent to same number in the last 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000

    return messages.some((msg) => {
      try {
        const msgPhone = (msg.phoneNumber || '').replace(/\D/g, '')
        const msgText = (msg.message || '').trim().toLowerCase()

        // Safely parse date
        let msgTime = 0
        try {
          if (msg.sentAt) {
            const parsedDate = new Date(msg.sentAt)
            if (!isNaN(parsedDate.getTime())) {
              msgTime = parsedDate.getTime()
            }
          }
        } catch {
          // If date parsing fails, skip this message
          return false
        }

        // Check if same message type was sent to same number with same message
        // Allow different message types to be sent to the same user
        const msgType = (msg.messageType || 'manual') as MessageType
        const isSameType = !messageType || msgType === messageType

        return (
          msgPhone === normalizedPhone &&
          msgText === normalizedMessage &&
          msgTime > oneDayAgo &&
          msg.status === 'sent' &&
          isSameType
        )
      } catch {
        // Skip messages with invalid data
        return false
      }
    })
  } catch (error) {
    console.error('Error checking duplicate message:', error)
    return false
  }
}

/**
 * Update message status in localStorage
 */
export const updateMessageStatusInStorage = (
  id: string,
  status: 'sent' | 'failed',
  error?: string
): void => {
  try {
    const messages = getMessagesFromStorage()
    const messageIndex = messages.findIndex((msg) => msg.id === id)
    if (messageIndex !== -1) {
      messages[messageIndex].status = status
      messages[messageIndex].sentAt = new Date().toISOString()
      if (error) {
        messages[messageIndex].error = error
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    }
  } catch (error) {
    console.error('Error updating message status in localStorage:', error)
  }
}

/**
 * Clear all messages from localStorage
 */
export const clearMessagesFromStorage = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Error clearing messages from localStorage:', error)
  }
}

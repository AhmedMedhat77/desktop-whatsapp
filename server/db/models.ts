export interface Message {
  id?: number
  phoneNumber: string
  message: string
  status?: 'pending' | 'sent' | 'failed'
  createdAt?: Date
  sentAt?: Date | null
  error?: string | null
}

export interface ScheduledTask {
  id?: number
  name: string
  phoneNumber: string
  message: string
  cronExpression: string
  isActive: boolean
  lastRun?: Date | null
  nextRun?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export interface MessageLog {
  id?: number
  taskId?: number | null
  phoneNumber: string
  message: string
  status: 'sent' | 'failed'
  sentAt: Date
  error?: string | null
}

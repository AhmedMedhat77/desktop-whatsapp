import { getConnection } from '../db/connection'
import type { Message, MessageLog } from '../db/models'

export const createMessage = async (message: Message): Promise<number> => {
  const pool = await getConnection()
  const result = await pool
    .request()
    .input('phoneNumber', message.phoneNumber)
    .input('message', message.message)
    .input('status', message.status || 'pending').query(`
      INSERT INTO Messages (phoneNumber, message, status, createdAt)
      OUTPUT INSERTED.id
      VALUES (@phoneNumber, @message, @status, GETDATE())
    `)
  return result.recordset[0].id
}

export const getMessages = async (limit: number = 100): Promise<Message[]> => {
  const pool = await getConnection()
  const result = await pool.request().input('limit', limit).query(`
      SELECT TOP (@limit) 
        id, phoneNumber, message, status, createdAt, sentAt, error
      FROM Messages
      ORDER BY createdAt DESC
    `)
  return result.recordset
}

export const updateMessageStatus = async (
  id: number,
  status: 'sent' | 'failed',
  error?: string
): Promise<void> => {
  const pool = await getConnection()
  await pool
    .request()
    .input('id', id)
    .input('status', status)
    .input('sentAt', status === 'sent' ? new Date() : null)
    .input('error', error || null).query(`
      UPDATE Messages
      SET status = @status,
          sentAt = @sentAt,
          error = @error
      WHERE id = @id
    `)
}

export const createMessageLog = async (log: MessageLog): Promise<void> => {
  const pool = await getConnection()
  await pool
    .request()
    .input('taskId', log.taskId || null)
    .input('phoneNumber', log.phoneNumber)
    .input('message', log.message)
    .input('status', log.status)
    .input('sentAt', log.sentAt)
    .input('error', log.error || null).query(`
      INSERT INTO MessageLogs (taskId, phoneNumber, message, status, sentAt, error)
      VALUES (@taskId, @phoneNumber, @message, @status, @sentAt, @error)
    `)
}

export const getMessageLogs = async (limit: number = 100): Promise<MessageLog[]> => {
  const pool = await getConnection()
  const result = await pool.request().input('limit', limit).query(`
      SELECT TOP (@limit)
        id, taskId, phoneNumber, message, status, sentAt, error
      FROM MessageLogs
      ORDER BY sentAt DESC
    `)
  return result.recordset
}

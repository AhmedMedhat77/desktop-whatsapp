import { getConnection } from '../db/connection'
import type { ScheduledTask } from '../db/models'

export const createScheduledTask = async (task: ScheduledTask): Promise<number> => {
  const pool = await getConnection()
  const result = await pool
    .request()
    .input('name', task.name)
    .input('phoneNumber', task.phoneNumber)
    .input('message', task.message)
    .input('cronExpression', task.cronExpression)
    .input('isActive', task.isActive).query(`
      INSERT INTO ScheduledTasks (name, phoneNumber, message, cronExpression, isActive, createdAt, updatedAt)
      OUTPUT INSERTED.id
      VALUES (@name, @phoneNumber, @message, @cronExpression, @isActive, GETDATE(), GETDATE())
    `)
  return result.recordset[0].id
}

export const getScheduledTasks = async (activeOnly: boolean = false): Promise<ScheduledTask[]> => {
  const pool = await getConnection()
  let query = `
    SELECT id, name, phoneNumber, message, cronExpression, isActive, lastRun, nextRun, createdAt, updatedAt
    FROM ScheduledTasks
  `

  if (activeOnly) {
    query += ' WHERE isActive = 1'
  }

  query += ' ORDER BY createdAt DESC'

  const result = await pool.request().query(query)
  return result.recordset
}

export const getScheduledTaskById = async (id: number): Promise<ScheduledTask | null> => {
  const pool = await getConnection()
  const result = await pool.request().input('id', id).query(`
      SELECT id, name, phoneNumber, message, cronExpression, isActive, lastRun, nextRun, createdAt, updatedAt
      FROM ScheduledTasks
      WHERE id = @id
    `)
  return result.recordset[0] || null
}

export const updateScheduledTask = async (
  id: number,
  task: Partial<ScheduledTask>
): Promise<void> => {
  const pool = await getConnection()
  const updates: string[] = []
  const request = pool.request().input('id', id)

  if (task.name !== undefined) {
    updates.push('name = @name')
    request.input('name', task.name)
  }
  if (task.phoneNumber !== undefined) {
    updates.push('phoneNumber = @phoneNumber')
    request.input('phoneNumber', task.phoneNumber)
  }
  if (task.message !== undefined) {
    updates.push('message = @message')
    request.input('message', task.message)
  }
  if (task.cronExpression !== undefined) {
    updates.push('cronExpression = @cronExpression')
    request.input('cronExpression', task.cronExpression)
  }
  if (task.isActive !== undefined) {
    updates.push('isActive = @isActive')
    request.input('isActive', task.isActive)
  }
  if (task.lastRun !== undefined) {
    updates.push('lastRun = @lastRun')
    request.input('lastRun', task.lastRun)
  }
  if (task.nextRun !== undefined) {
    updates.push('nextRun = @nextRun')
    request.input('nextRun', task.nextRun)
  }

  updates.push('updatedAt = GETDATE()')

  await request.query(`
    UPDATE ScheduledTasks
    SET ${updates.join(', ')}
    WHERE id = @id
  `)
}

export const deleteScheduledTask = async (id: number): Promise<void> => {
  const pool = await getConnection()
  await pool.request().input('id', id).query('DELETE FROM ScheduledTasks WHERE id = @id')
}

export const getActiveScheduledTasks = async (): Promise<ScheduledTask[]> => {
  return getScheduledTasks(true)
}

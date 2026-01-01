import { getConnection, isDatabaseConnected } from '../db'
import { WhatsAppStatus } from '../constants/Types'

/**
 * Cleanup Stale Processing Records
 * 
 * This utility resets PROCESSING records that have been stuck for more than
 * the specified timeout. This handles cases where a worker crashed while processing
 * a record, leaving it in PROCESSING state indefinitely.
 * 
 * Run this periodically (e.g., every 10 minutes) via a scheduled job or cron.
 * 
 * @param staleTimeoutMinutes - Minutes after which a PROCESSING record is considered stale (default: 5)
 * @returns Number of records reset
 */
export async function cleanupStaleRecords(
  staleTimeoutMinutes: number = 5
): Promise<{ appointments: number; reminders: number; patients: number }> {
  if (!isDatabaseConnected()) {
    console.warn('Database not connected, skipping stale record cleanup')
    return { appointments: 0, reminders: 0, patients: 0 }
  }

  try {
    const pool = await getConnection()
    const request = pool.request()
    const staleTimeout = new Date(Date.now() - staleTimeoutMinutes * 60 * 1000)

    // Reset stale appointment messages
    request.input('statusPending', WhatsAppStatus.PENDING)
    request.input('statusProcessing', WhatsAppStatus.PROCESSING)
    request.input('staleTimeout', staleTimeout)

    const appointmentResult = await request.query(`
      UPDATE Clinic_PatientsAppointments
      SET 
        WhatsAppStatus = @statusPending,
        WhatsAppWorkerID = NULL,
        WhatsAppProcessedAt = NULL
      WHERE WhatsAppStatus = @statusProcessing
        AND WhatsAppProcessedAt < @staleTimeout
      
      SELECT @@ROWCOUNT as rowsAffected
    `)
    const appointmentsReset = appointmentResult.recordset[0]?.rowsAffected || 0

    // Reset stale appointment reminders
    const reminderResult = await request.query(`
      UPDATE Clinic_PatientsAppointments
      SET 
        ScheduleWhatsAppStatus = @statusPending,
        ScheduleWhatsAppWorkerID = NULL,
        ScheduleWhatsAppProcessedAt = NULL
      WHERE ScheduleWhatsAppStatus = @statusProcessing
        AND ScheduleWhatsAppProcessedAt < @staleTimeout
      
      SELECT @@ROWCOUNT as rowsAffected
    `)
    const remindersReset = reminderResult.recordset[0]?.rowsAffected || 0

    // Reset stale patient messages
    const patientResult = await request.query(`
      UPDATE Clinic_PatientsTelNumbers
      SET 
        WhatsAppStatus = @statusPending,
        WhatsAppWorkerID = NULL,
        WhatsAppProcessedAt = NULL
      WHERE WhatsAppStatus = @statusProcessing
        AND WhatsAppProcessedAt < @staleTimeout
      
      SELECT @@ROWCOUNT as rowsAffected
    `)
    const patientsReset = patientResult.recordset[0]?.rowsAffected || 0

    if (appointmentsReset > 0 || remindersReset > 0 || patientsReset > 0) {
      console.log(
        `🧹 Cleaned up stale records: ${appointmentsReset} appointments, ${remindersReset} reminders, ${patientsReset} patients`
      )
    }

    return {
      appointments: appointmentsReset,
      reminders: remindersReset,
      patients: patientsReset
    }
  } catch (error) {
    console.error('Error cleaning up stale records:', error)
    return { appointments: 0, reminders: 0, patients: 0 }
  }
}

/**
 * Schedule periodic cleanup of stale records
 * Run every 10 minutes
 */
export function scheduleStaleRecordCleanup(): void {
  const { scheduleJob } = require('node-schedule')
  
  scheduleJob('*/10 * * * *', async () => {
    await cleanupStaleRecords(5) // 5 minute timeout
  })
  
  console.log('✅ Stale record cleanup scheduled (runs every 10 minutes)')
}



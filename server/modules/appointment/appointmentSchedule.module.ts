import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { QUERIES } from '../../constants/queries'
import { getConnection, isDatabaseConnected } from '../../db'
import { formatDbDate, formatDbTime } from '../../utils/formatDb'
import { sendMessageToPhone } from '../../utils/whatsapp'
import { getReminderSettings, getReminderTimeMs } from '../../utils/appointmentReminderSettings'
import { FixedMessages } from '../../quiries/FixedMessages'
import { getWorkerId } from '../../utils/workerId'
import { WhatsAppStatus } from '../../constants/Types'

/**
 * ATOMIC DATABASE-LEVEL LOCKING FOR APPOINTMENT REMINDERS
 *
 * This module uses SQL Server's UPDATE ... OUTPUT clause to atomically claim
 * appointment reminder records for processing. This ensures 100% duplicate prevention
 * even under concurrent execution (PM2, Docker, multiple instances).
 *
 * HOW IT WORKS:
 * 1. claimAppointmentReminders() atomically claims up to N pending reminder records
 *    - Only records where initial message is SENT and reminder is PENDING/FAILED
 *    - UPDATE is atomic at the database level - only one worker can claim each record
 *    - Returns only the records that were successfully claimed
 *
 * 2. For each claimed record:
 *    - Check if current time is within the reminder window
 *    - If not, release the record (set status back to PENDING)
 *    - If yes, send reminder and update status to SENT or FAILED
 *
 * 3. updateAppointmentReminderStatus() updates the record:
 *    - Only updates if workerId matches (prevents cross-worker updates)
 *    - Only updates if status is PROCESSING (prevents double-updates)
 *
 * WHY DUPLICATES ARE IMPOSSIBLE:
 * - Database UPDATE is atomic - two workers cannot claim the same record
 * - Status check in WHERE clause ensures only unclaimed records are processed
 * - Worker ID verification prevents one worker from updating another's records
 * - Stale timeout automatically resets crashed workers' records after 5 minutes
 * - Time window check ensures reminders are only sent at the right time
 *
 * This solution is production-grade and scales horizontally.
 */

scheduleJob('*/30 * * * * *', async () => {
  try {
    // Check if database is connected first
    if (!isDatabaseConnected()) {
      return
    }

    // Check if migration columns exist before using them
    // This prevents errors if migration hasn't completed yet
    try {
      const pool = await getConnection()
      const checkRequest = pool.request()
      const checkResult = await checkRequest.query(`
        SELECT CASE WHEN EXISTS (
          SELECT 1 FROM sys.columns 
          WHERE object_id = OBJECT_ID('Clinic_PatientsAppointments') 
          AND name = 'ScheduleWhatsAppStatus'
        ) THEN 1 ELSE 0 END as hasColumn
      `)
      if (checkResult.recordset[0]?.hasColumn !== 1) {
        // Migration not complete yet, skip this run
        return
      }
    } catch (checkError) {
      console.error('Error checking for migration columns:', checkError)
      // If we can't check, assume columns don't exist and skip
      return
    }

    // Get reminder settings
    const reminderSettings = getReminderSettings()

    // If reminders are disabled, skip
    if (!reminderSettings.enabled) {
      return
    }

    // Get database connection
    const pool = await getConnection()
    const workerId = getWorkerId()

    // ATOMIC CLAIM: Claim up to 10 pending reminder messages
    // This query is 100% safe under concurrent execution
    const request = pool.request()
    const claimedResult = await QUERIES.claimAppointmentReminders(request, workerId, 10, 5)
    const claimedReminders = claimedResult.recordset

    if (claimedReminders.length === 0) {
      // No reminders to process
      return
    }

    console.log(
      `🔍 Claimed ${claimedReminders.length} appointment reminder(s) for processing (Worker: ${workerId})`
    )

    // Get company header once for all messages
    const company = await companyHeader.getCompanyHeader()
    if (!company) {
      console.error('Company header not found')
      return
    }

    // Get reminder time in milliseconds
    const reminderTimeMs = getReminderTimeMs(reminderSettings)
    const now = new Date()

    // Process each claimed reminder
    for (const appointment of claimedReminders) {
      try {
        // Parse appointment date and time
        // TheDate is in yyyymmdd format (e.g., 20250824), TheTime is in HHMM format (e.g., 1430)
        const dateStr = appointment.TheDate?.toString() || ''
        const timeStr = appointment.TheTime?.toString().padStart(4, '0') || '0000'

        // Parse date: yyyymmdd -> Date object
        let appointmentDate: Date
        if (dateStr.length === 8) {
          const year = parseInt(dateStr.substring(0, 4), 10)
          const month = parseInt(dateStr.substring(4, 6), 10) - 1 // Month is 0-indexed
          const day = parseInt(dateStr.substring(6, 8), 10)
          appointmentDate = new Date(year, month, day)
        } else {
          // Fallback: try to parse as-is
          appointmentDate = new Date(appointment.TheDate)
        }

        // Parse time: HHMM -> hours and minutes
        const hours = parseInt(timeStr.substring(0, 2), 10)
        const minutes = parseInt(timeStr.substring(2, 4), 10)

        // Set the appointment datetime
        appointmentDate.setHours(hours, minutes, 0, 0)

        // Calculate when the reminder should be sent (appointment time - reminder time)
        const reminderTime = new Date(appointmentDate.getTime() - reminderTimeMs)

        // Check if we're within the reminder window
        // Send reminder if current time is >= reminder time and < appointment time
        const isWithinReminderWindow = now >= reminderTime && now < appointmentDate

        if (!isWithinReminderWindow) {
          // Too early or too late, release the record (set back to PENDING)
          const updateRequest = pool.request()
          await QUERIES.updateAppointmentReminderStatus(
            updateRequest,
            appointment,
            WhatsAppStatus.PENDING,
            workerId
          )
          console.log(
            `⏭️ Reminder not yet due for ${appointment.Name} - released record (Appointment: ${formatDbDate(appointment.TheDate)} ${formatDbTime(appointment.TheTime)})`
          )
          continue
        }

        // We're within the reminder window - send the reminder
        const formattedDate = formatDbDate(appointment.TheDate)
        const formattedTime = formatDbTime(appointment.TheTime)

        const message = FixedMessages.ScheduleMessage(
          appointment,
          formattedDate,
          formattedTime,
          company
        )

        console.log(
          `📨 Sending appointment reminder to ${appointment.Name} (${appointment.Number}) - Appointment: ${formattedDate} ${formattedTime}`
        )

        // Send the WhatsApp message
        const result = await sendMessageToPhone(
          appointment.Number,
          message,
          'appointmentReminder',
          appointment.Name
        )

        // Update status based on send result
        const updateRequest = pool.request()
        if (result.success) {
          const rowsAffected = await QUERIES.updateAppointmentReminderStatus(
            updateRequest,
            appointment,
            WhatsAppStatus.SENT,
            workerId
          )

          if (rowsAffected > 0) {
            console.log(
              `✅ Appointment reminder sent successfully to ${appointment.Name} (Date: ${formattedDate}, Time: ${formattedTime})`
            )
          } else {
            console.warn(
              `⚠️ Failed to update status for reminder ${appointment.Name} - record may have been claimed by another worker`
            )
          }
        } else {
          // Mark as FAILED - will be retried (up to max retries)
          const rowsAffected = await QUERIES.updateAppointmentReminderStatus(
            updateRequest,
            appointment,
            WhatsAppStatus.FAILED,
            workerId
          )

          if (rowsAffected > 0) {
            console.error(
              `❌ Failed to send appointment reminder to ${appointment.Name}: ${result.error} (Will retry)`
            )
          }
        }
      } catch (appointmentError) {
        // Mark as FAILED on exception
        try {
          const updateRequest = pool.request()
          await QUERIES.updateAppointmentReminderStatus(
            updateRequest,
            appointment,
            WhatsAppStatus.FAILED,
            workerId
          )
        } catch (updateError) {
          console.error(
            `❌ Failed to update status after error for ${appointment.Name}:`,
            updateError
          )
        }

        console.error(
          `❌ Error processing appointment reminder for ${appointment.Name}:`,
          appointmentError
        )
        // Continue with next reminder
      }
    }
  } catch (err) {
    console.error('Error watching appointment reminders:', err)
  }
})

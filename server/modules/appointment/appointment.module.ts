import { scheduleJob } from 'node-schedule'
import { QUERIES } from '../../constants/queries'
import { getConnection, isDatabaseConnected } from '../../db'
import { formatDbDate, formatDbTime, sendMessageToPhone } from '../../utils'
import { FixedMessages } from '../../quiries/FixedMessages'

/**
 * Appointment Message Processing Module
 *
 * This module handles:
 * 1. Adding new appointments to the reminder queue (only once per appointment)
 * 2. Sending initial appointment confirmation messages
 * 3. Sending reminder messages 24 hours before appointment
 *
 * Duplicate Prevention:
 * - Uses INSERT ... WHERE NOT EXISTS to prevent duplicate queue entries
 * - Uses atomic UPDATE to mark messages as sent before sending
 * - Checks InitialMessage and ReminderMessage flags before processing
 */

// Schedule job to watch for new appointments and process messages
scheduleJob('*/30 * * * * *', async () => {
  try {
    // Check if database is connected first
    if (!isDatabaseConnected()) {
      return
    }

    // Get database connection
    const pool = await getConnection()
    const request = pool.request()

    // Get company header once
    const companyHeader = await QUERIES.companyHeader(request)
    if (!companyHeader.recordset.length) {
      console.error('Company header not found')
      return
    }
    const company = companyHeader.recordset[0]

    // ============================================
    // STEP 1: Add new appointments to reminder queue
    // ============================================
    try {
      const appointments = await QUERIES.getAppointments(request)

      if (appointments.recordset.length > 0) {
        const installationDate = '2026-01-03' // Only process appointments after this date
        let addedCount = 0

        for (const appointment of appointments.recordset) {
          try {
            // Check if appointment date is on or after installation date
            const appointmentDateStr = formatDbDate(appointment.AppointmentDate)
            if (appointmentDateStr < installationDate) {
              // Skip old appointments before installation
              continue
            }

            // Add to queue (query handles duplicate prevention)
            const insertResult = await QUERIES.AddAppointmentToReminderQueue(request, appointment)
            if (insertResult.rowsAffected && insertResult.rowsAffected[0] > 0) {
              addedCount++
            }
          } catch (addError) {
            // Log but continue with other appointments
            console.error('Error adding appointment to queue:', addError)
          }
        }

        if (addedCount > 0) {
          console.log(`✅ Added ${addedCount} new appointment(s) to reminder queue`)
        }
      }
    } catch (addQueueError) {
      console.error('Error processing appointments for queue:', addQueueError)
      // Continue to message processing even if queue addition fails
    }

    // ============================================
    // STEP 2: Process initial messages (send confirmation)
    // ============================================
    try {
      // Get appointments that need initial message (InitialMessage = 0)
      const reminderQueue = await QUERIES.GetAppointmentFromReminderQueue(request)

      if (reminderQueue.recordset.length > 0) {
        for (const reminder of reminderQueue.recordset) {
          try {
            // Skip if initial message already sent
            if (reminder.InitialMessage === 1) {
              continue
            }

            // Check if phone number exists
            if (!reminder.Number || reminder.Number.trim() === '') {
              console.warn(`⚠️  Skipping appointment ${reminder.ID}: No phone number`)
              continue
            }

            // ATOMIC UPDATE: Mark as processing before sending (prevents duplicates)
            const updateResult = await QUERIES.updateAppointmentInitialMessage(request, reminder)
            if (!updateResult.rowsAffected || updateResult.rowsAffected[0] === 0) {
              // Another worker may have already processed this
              console.log(`⏭️  Appointment ${reminder.ID} already processed by another worker`)
              continue
            }

            // Send initial appointment confirmation message
            const message = FixedMessages.AppointmentMessage(reminder, company)
            const sendResult = await sendMessageToPhone(
              reminder.Number,
              message,
              'appointment',
              reminder.PatientArbName
            )

            if (sendResult.success) {
              console.log(
                `✅ Initial message sent to ${reminder.PatientArbName} (${reminder.Number}) - Appointment: ${formatDbDate(reminder.AppointmentDate)} ${formatDbTime(reminder.AppointmentTime)}`
              )
            } else {
              console.error(
                `❌ Failed to send initial message to ${reminder.PatientArbName}: ${sendResult.error}`
              )
              // Reset InitialMessage flag on failure so it can be retried
              await QUERIES.resetAppointmentInitialMessage(request, reminder)
            }
          } catch (initialMessageError) {
            console.error(
              `Error sending initial message for appointment ${reminder.ID}:`,
              initialMessageError
            )
            // Reset flag on error so it can be retried
            try {
              await QUERIES.resetAppointmentInitialMessage(request, reminder)
            } catch (resetError) {
              console.error('Error resetting initial message flag:', resetError)
            }
          }
        }
      }
    } catch (initialMessageError) {
      console.error('Error processing initial messages:', initialMessageError)
    }

    // ============================================
    // STEP 3: Process reminder messages (24 hours before appointment)
    // ============================================
    try {
      // Get appointments that need reminder message
      // Must have InitialMessage = 1 (initial sent) AND ReminderMessage = 0 (reminder not sent)
      const reminderQueue = await QUERIES.GetAppointmentsForReminder(request)

      if (reminderQueue.recordset.length > 0) {
        const now = new Date()

        for (const reminder of reminderQueue.recordset) {
          try {
            // Skip if reminder already sent
            if (reminder.ReminderMessage === 1) {
              continue
            }

            // Skip if initial message not sent yet
            if (reminder.InitialMessage !== 1) {
              continue
            }

            // Check if phone number exists
            if (!reminder.Number || reminder.Number.trim() === '') {
              console.warn(`⚠️  Skipping reminder for appointment ${reminder.ID}: No phone number`)
              continue
            }

            // Calculate appointment datetime
            const appointmentDateStr = formatDbDate(reminder.AppointmentDate)
            const appointmentTimeStr = formatDbTime(reminder.AppointmentTime)
            const appointmentDateTime = new Date(`${appointmentDateStr} ${appointmentTimeStr}`)

            // Calculate time difference
            const diffTime = appointmentDateTime.getTime() - now.getTime()
            const diffHours = diffTime / (1000 * 60 * 60) // Convert to hours

            // Send reminder if appointment is within next 24 hours (and in the future)
            if (diffHours > 0 && diffHours <= 24) {
              // ATOMIC UPDATE: Mark reminder as processing before sending (prevents duplicates)
              const updateResult = await QUERIES.updateAppointmentReminderMessage(request, reminder)
              if (!updateResult.rowsAffected || updateResult.rowsAffected[0] === 0) {
                // Another worker may have already processed this
                console.log(
                  `⏭️  Reminder for appointment ${reminder.ID} already processed by another worker`
                )
                continue
              }

              // Send reminder message
              const message = FixedMessages.ScheduleMessage(reminder, company)
              const sendResult = await sendMessageToPhone(
                reminder.Number,
                message,
                'appointmentReminder',
                reminder.PatientArbName
              )

              if (sendResult.success) {
                console.log(
                  `✅ Reminder sent to ${reminder.PatientArbName} (${reminder.Number}) - Appointment: ${formatDbDate(reminder.AppointmentDate)} ${formatDbTime(reminder.AppointmentTime)}`
                )
              } else {
                console.error(
                  `❌ Failed to send reminder to ${reminder.PatientArbName}: ${sendResult.error}`
                )
                // Reset ReminderMessage flag on failure so it can be retried
                await QUERIES.resetAppointmentReminderMessage(request, reminder)
              }
            }
          } catch (reminderError) {
            console.error(`Error sending reminder for appointment ${reminder.ID}:`, reminderError)
            // Reset flag on error so it can be retried
            try {
              await QUERIES.resetAppointmentReminderMessage(request, reminder)
            } catch (resetError) {
              console.error('Error resetting reminder message flag:', resetError)
            }
          }
        }
      }
    } catch (reminderError) {
      console.error('Error processing reminder messages:', reminderError)
    }
  } catch (err) {
    console.error('Error in appointment processing:', err)
  }
})

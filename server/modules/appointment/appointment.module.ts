import { scheduleJob } from 'node-schedule'
import { QUERIES } from '../../constants/queries'
import { getConnection, isDatabaseConnected } from '../../db'
import { FixedMessages } from '../../quiries/FixedMessages'
import { formatDbDate, formatDbTime, sendMessageToPhone } from '../../utils'
import { getReminderSettings, getReminderTimeMs } from '../../utils/appointmentReminderSettings'

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
console.log('📅 Appointment module loaded - scheduling job to run every 30 seconds')
scheduleJob('*/30 * * * * *', async () => {
  try {
    // Check if database is connected first
    if (!isDatabaseConnected()) {
      console.log('⏭️  Appointment module: Database not connected, skipping this run')
      return
    }

    console.log('🔄 Appointment module: Starting processing cycle...')

    // Get database connection
    const pool = await getConnection()
    const headerRequest = pool.request()

    // Get company header once
    const companyHeader = await QUERIES.companyHeader(headerRequest)
    if (!companyHeader.recordset.length) {
      console.error('Company header not found')
      return
    }
    const company = companyHeader.recordset[0]

    // ============================================
    // PHASE 1: Loop through ALL appointments and add them to Appointment_Message_Table
    // This phase completes BEFORE moving to message processing
    // ============================================
    try {
      const appointments = await QUERIES.getAppointments(headerRequest)

      if (appointments.recordset.length > 0) {
        // Get startFrom date from settings (defaults to today if not set)
        const settings = getReminderSettings()
        const installationDate = settings.startFrom || new Date().toISOString().split('T')[0]
        let addedCount = 0
        let skippedCount = 0

        console.log(
          `📋 Processing ${appointments.recordset.length} appointment(s) to add to queue...`
        )

        // Loop through ALL appointments and add them to the message table
        for (const appointment of appointments.recordset) {
          try {
            // Check if appointment date is on or after installation date
            const appointmentDateStr = formatDbDate(appointment.AppointmentDate)
            if (appointmentDateStr < installationDate) {
              // Skip old appointments before installation
              skippedCount++
              continue
            }

            // Skip if no phone number (convert to string first in case it's a number)
            const phoneNumber = String(appointment.Number || '').trim()
            if (!phoneNumber) {
              console.warn(
                `⚠️  Skipping appointment: No phone number for patient ${appointment.PatientArbName || appointment.PatientID}`
              )
              skippedCount++
              continue
            }

            // Skip if missing required fields
            if (!appointment.PatientID || !appointment.DoctorID) {
              console.warn(`⚠️  Skipping appointment: Missing PatientID or DoctorID`)
              skippedCount++
              continue
            }

            // Provide default values for NULL fields (query should handle this, but double-check)
            // The query now uses ISNULL to provide defaults, so these checks are less critical
            // But we'll still validate to ensure we have meaningful data
            const patientName = appointment.PatientArbName?.trim() || 'غير محدد'
            const doctorName = appointment.DoctorArbName?.trim() || 'غير محدد'
            const specialtyName = appointment.SpecialtyArbName?.trim() || 'غير محدد'

            // Update appointment object with defaults if needed
            if (!appointment.PatientArbName || appointment.PatientArbName.trim() === '') {
              appointment.PatientArbName = patientName
            }
            if (!appointment.DoctorArbName || appointment.DoctorArbName.trim() === '') {
              appointment.DoctorArbName = doctorName
            }
            if (!appointment.SpecialtyArbName || appointment.SpecialtyArbName.trim() === '') {
              appointment.SpecialtyArbName = specialtyName
            }

            // Create a new request for each appointment to avoid parameter conflicts
            const insertRequest = pool.request()

            // Add to queue (query handles duplicate prevention)
            const insertResult = await QUERIES.AddAppointmentToReminderQueue(
              insertRequest,
              appointment
            )
            if (insertResult.rowsAffected && insertResult.rowsAffected[0] > 0) {
              addedCount++
            } else {
              // Row not inserted - likely duplicate (already in queue)
              skippedCount++
            }
          } catch (addError) {
            // Log but continue with other appointments
            console.error(
              `❌ Error adding appointment to queue (PatientID: ${appointment.PatientID}, DoctorID: ${appointment.DoctorID}):`,
              addError
            )
            skippedCount++
          }
        }

        // Summary of queue addition phase
        if (addedCount > 0) {
          console.log(
            `✅ Phase 1 Complete: Added ${addedCount} new appointment(s) to reminder queue`
          )
        }
        if (skippedCount > 0) {
          console.log(
            `⏭️  Phase 1: Skipped ${skippedCount} appointment(s) (duplicates, missing data, or old dates)`
          )
        }
      }
    } catch (addQueueError) {
      console.error('Error processing appointments for queue:', addQueueError)
      // Continue to message processing even if queue addition fails
    }

    // ============================================
    // PHASE 2: Process initial messages (send confirmation)
    // Get appointments from message table that need initial message sent
    // ============================================
    try {
      // Get appointments that need initial message (InitialMessage = 0)
      const initialMessageRequest = pool.request()
      const reminderQueue = await QUERIES.GetAppointmentFromReminderQueue(initialMessageRequest)

      if (reminderQueue.recordset.length > 0) {
        console.log(
          `📨 Phase 2: Processing ${reminderQueue.recordset.length} appointment(s) for initial messages...`
        )
        let sentCount = 0
        let failedCount = 0

        for (const reminder of reminderQueue.recordset) {
          try {
            // Skip if initial message already sent
            if (reminder.InitialMessage === 1) {
              continue
            }

            // Use CleanNumber if available (removes commas and spaces), otherwise fallback to Number
            const rawNumber = reminder.CleanNumber || reminder.Number || ''
            const phoneNumber = String(rawNumber).trim()
            if (!phoneNumber) {
              console.warn(`⚠️  Skipping appointment ${reminder.ID}: No phone number`)
              continue
            }

            // ATOMIC UPDATE: Mark as processing before sending (prevents duplicates)
            const updateRequest = pool.request()
            const updateResult = await QUERIES.updateAppointmentInitialMessage(
              updateRequest,
              reminder
            )
            if (!updateResult.rowsAffected || updateResult.rowsAffected[0] === 0) {
              // Another worker may have already processed this
              console.log(`⏭️  Appointment ${reminder.ID} already processed by another worker`)
              continue
            }

            // Send initial appointment confirmation message
            const message = FixedMessages.AppointmentMessage(reminder, company)
            const sendResult = await sendMessageToPhone(
              phoneNumber,
              message,
              'appointment',
              reminder.PatientArbName
            )

            if (sendResult.success) {
              sentCount++
              console.log(
                `✅ Initial message sent to ${reminder.PatientArbName} (${phoneNumber}) - Appointment: ${formatDbDate(reminder.AppointmentDate)} ${formatDbTime(reminder.AppointmentTime)}`
              )
            } else {
              failedCount++
              console.error(
                `❌ Failed to send initial message to ${reminder.PatientArbName}: ${sendResult.error}`
              )
              // Reset InitialMessage flag on failure so it can be retried
              const resetRequest = pool.request()
              await QUERIES.resetAppointmentInitialMessage(resetRequest, reminder)
            }
          } catch (initialMessageError) {
            console.error(
              `Error sending initial message for appointment ${reminder.ID}:`,
              initialMessageError
            )
            // Reset flag on error so it can be retried
            try {
              const resetRequest = pool.request()
              await QUERIES.resetAppointmentInitialMessage(resetRequest, reminder)
            } catch (resetError) {
              console.error('Error resetting initial message flag:', resetError)
            }
          }
        }

        // Summary of initial message phase
        console.log(
          `✅ Phase 2 Complete: Sent ${sentCount} initial message(s), Failed ${failedCount}`
        )
      }
    } catch (initialMessageError) {
      console.error('Error in Phase 2 (processing initial messages):', initialMessageError)
    }

    // ============================================
    // PHASE 3: Process reminder messages (based on settings: 1day, 2days, or custom hours)
    // Get appointments from message table that need reminder sent
    // ============================================
    try {
      // Get reminder settings to determine timing
      const reminderSettings = getReminderSettings()

      // Skip reminder processing if reminders are disabled
      if (!reminderSettings.enabled) {
        console.log('⏭️  Phase 3: Reminders are disabled in settings, skipping reminder processing')
        return
      }

      // Calculate reminder time window in hours from settings
      const reminderTimeMs = getReminderTimeMs(reminderSettings)
      const reminderHours = reminderTimeMs / (1000 * 60 * 60) // Convert milliseconds to hours

      // Get appointments that need reminder message
      // Must have InitialMessage = 1 (initial sent) AND ReminderMessage = 0 (reminder not sent)
      const reminderRequest = pool.request()
      const reminderQueue = await QUERIES.GetAppointmentsForReminder(reminderRequest)

      if (reminderQueue.recordset.length > 0) {
        console.log(
          `📨 Phase 3: Processing ${reminderQueue.recordset.length} appointment(s) for reminder messages (${reminderHours} hours before appointment)...`
        )
        const now = new Date()
        let sentCount = 0
        let failedCount = 0
        let skippedCount = 0

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

            // Use CleanNumber if available (removes commas and spaces), otherwise fallback to Number
            const rawNumber = reminder.CleanNumber || reminder.Number || ''
            const phoneNumber = String(rawNumber).trim()
            if (!phoneNumber) {
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

            // Send reminder if appointment is within the configured reminder window (and in the future)
            if (diffHours > 0 && diffHours <= reminderHours) {
              // ATOMIC UPDATE: Mark reminder as processing before sending (prevents duplicates)
              const updateRequest = pool.request()
              const updateResult = await QUERIES.updateAppointmentReminderMessage(
                updateRequest,
                reminder
              )
              if (!updateResult.rowsAffected || updateResult.rowsAffected[0] === 0) {
                // Another worker may have already processed this
                skippedCount++
                continue
              }

              // Send reminder message
              const message = FixedMessages.ScheduleMessage(reminder, company)
              const sendResult = await sendMessageToPhone(
                phoneNumber,
                message,
                'appointmentReminder',
                reminder.PatientArbName
              )

              if (sendResult.success) {
                sentCount++
                console.log(
                  `✅ Reminder sent to ${reminder.PatientArbName} (${phoneNumber}) - Appointment: ${formatDbDate(reminder.AppointmentDate)} ${formatDbTime(reminder.AppointmentTime)}`
                )
              } else {
                failedCount++
                console.error(
                  `❌ Failed to send reminder to ${reminder.PatientArbName}: ${sendResult.error}`
                )
                // Reset ReminderMessage flag on failure so it can be retried
                const resetRequest = pool.request()
                await QUERIES.resetAppointmentReminderMessage(resetRequest, reminder)
              }
            } else {
              // Not within reminder window
              skippedCount++
            }
          } catch (reminderError) {
            console.error(`Error sending reminder for appointment ${reminder.ID}:`, reminderError)
            // Reset flag on error so it can be retried
            try {
              const resetRequest = pool.request()
              await QUERIES.resetAppointmentReminderMessage(resetRequest, reminder)
            } catch (resetError) {
              console.error('Error resetting reminder message flag:', resetError)
            }
          }
        }

        // Summary of reminder message phase
        console.log(
          `✅ Phase 3 Complete: Sent ${sentCount} reminder(s), Failed ${failedCount}, Skipped ${skippedCount} (not within ${reminderHours}h window)`
        )
      }
    } catch (reminderError) {
      console.error('Error in Phase 3 (processing reminder messages):', reminderError)
    }
  } catch (err) {
    console.error('❌ Error in appointment processing:', err)
  }
})

// Log that the job has been scheduled
console.log('✅ Appointment module: Scheduled job registered successfully')

import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { QUERIES } from '../../constants/queries'
import { getConnection, isDatabaseConnected } from '../../db'
import { sendMessageToPhone } from '../../utils'
import { formatDbDate, formatDbTime } from '../../utils/formatDb'
import { FixedMessages } from '../../quiries/FixedMessages'

// Track processed appointments in current execution to prevent duplicates
const processingAppointments = new Set<string>()

// Schedule job to watch for new appointments
scheduleJob('*/1 * * * * *', async () => {
  // Clear the processing set at the start of each run
  processingAppointments.clear()
  try {
    // Check if database is connected first
    if (!isDatabaseConnected()) {
      // Database not connected yet, skip this run
      return
    }

    // Get database connection (may throw if config is missing)
    let pool
    try {
      pool = await getConnection()
    } catch (dbError) {
      console.error('Error getting database connection:', dbError)
      return // skip on first run or after restart
    }
    const request = pool.request()
    // Get all appointments using the provided query
    const allAppointmentsResult = await QUERIES.appointments(request)
    const allAppointments = allAppointmentsResult.recordset

    if (allAppointments.length === 0) {
      // No appointments to process, skip silently
      return
    }

    console.log(`🔍 Found ${allAppointments.length} appointment(s) to process`)

    // Process new appointments
    const company = await companyHeader.getCompanyHeader()
    if (!company) {
      console.error('Company header not found')
      return
    }
    for (const appointment of allAppointments) {
      // Create unique key to prevent duplicate processing in the same run
      // Include PatientID to ensure each patient's appointment is tracked separately
      const uniqueKey = `${appointment.PatientID}_${appointment.DoctorID}_${appointment.BranchID}_${appointment.TheDate}_${appointment.TheTime}`

      // Skip if already being processed in this run
      if (processingAppointments.has(uniqueKey)) {
        console.log(`⏭️ Skipping duplicate appointment: ${appointment.Name} (Key: ${uniqueKey})`)
        continue
      }

      // Skip if already sent (double-check to avoid race conditions)
      if (appointment.IsWhatsAppSent === 1) {
        continue
      }

      // Mark as processing immediately
      processingAppointments.add(uniqueKey)

      const formattedDate = formatDbDate(appointment.TheDate)
      const formattedTime = formatDbTime(appointment.TheTime)

      const message = FixedMessages.AppointmentMessage(
        appointment,
        formattedDate,
        formattedTime,
        company
      )

      try {
        const updateRequest = pool.request()

        const rowsAffected = await QUERIES.updateAppointmentIsWhatsAppSent(
          updateRequest,
          appointment
        )

        if (rowsAffected > 0) {
          console.log(
            `✅ Updated IsWhatsAppSent for appointment: ${appointment.Name} (Date: ${formattedDate}, Time: ${formattedTime}) - Rows affected: ${rowsAffected}`
          )
        } else {
          console.warn(
            `⚠️ No rows updated for appointment: ${appointment.Name} (Date: ${formattedDate}, Time: ${formattedTime}) - DoctorID: ${appointment.DoctorID}, TheDate: ${appointment.TheDate}, TheTime: ${appointment.TheTime}, BranchID: ${appointment.BranchID}`
          )
          // Skip sending if update failed - might be a data mismatch
          continue
        }
      } catch (updateError) {
        console.error(
          `❌ Failed to update IsWhatsAppSent for appointment ${appointment.Name}:`,
          updateError
        )
        // Skip sending if update failed
        continue
      }

      // Send the message
      const result = await sendMessageToPhone(
        appointment.Number,
        message,
        'appointment',
        appointment.Name
      )

      if (result.success) {
        console.log(`✅ Message sent successfully to ${appointment.Name}`)
      } else {
        console.error(`❌ Failed to send message to ${appointment.Name}: ${result.error}`)
        // Note: We already marked it as sent to prevent spam, even if sending failed
      }
    }
  } catch (err) {
    console.error('Error watching Appointments:', err)
    return
  }
})

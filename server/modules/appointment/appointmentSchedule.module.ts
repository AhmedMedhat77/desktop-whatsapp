import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { QUERIES } from '../../constants/queries'
import { getConnection, isDatabaseConnected } from '../../db'
import { formatDbDate, formatDbTime } from '../../utils/formatDb'
import { sendMessageToPhone } from '../../utils/whatsapp'
import { getReminderSettings, getReminderTimeMs } from '../../utils/appointmentReminderSettings'

// Track processed reminders in current execution to prevent duplicates
const processingReminders = new Set<string>()

scheduleJob('*/1 * * * * *', async () => {
  // Clear the processing set at the start of each run
  processingReminders.clear()
  try {
    // Check if database is connected first
    if (!isDatabaseConnected()) {
      return
    }

    // Get reminder settings
    const reminderSettings = getReminderSettings()

    // If reminders are disabled, skip
    if (!reminderSettings.enabled) {
      return
    }

    const pool = await getConnection()
    const request = pool.request()
    // Get all appointments using the provided query
    const allAppointmentsResult = await QUERIES.getScheduleAppointments(request)
    const allAppointments = allAppointmentsResult.recordset
    const company = await companyHeader.getCompanyHeader()

    if (allAppointments.length === 0) {
      return
    }

    console.log(`🔍 Found ${allAppointments.length} appointment reminder(s) to process`)

    // Get reminder time in milliseconds
    const reminderTimeMs = getReminderTimeMs(reminderSettings)
    const now = new Date()

    for (const appointment of allAppointments) {
      try {
        // Create unique key to prevent duplicate processing in the same run
        const uniqueKey = `${appointment.DoctorID}_${appointment.BranchID}_${appointment.TheDate}_${appointment.TheTime}`

        // Skip if already being processed in this run
        if (processingReminders.has(uniqueKey)) {
          console.log(`⏭️ Skipping duplicate reminder: ${appointment.Name} (Key: ${uniqueKey})`)
          continue
        }

        // Mark as processing immediately
        processingReminders.add(uniqueKey)

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
          // Too early or too late, skip this appointment
          continue
        }

        // IMPORTANT: Mark as sent IMMEDIATELY to prevent duplicate sends
        // This prevents the same appointment from being processed multiple times
        // Update IsScheduleWhatsAppSent to 1 BEFORE sending the message
        const formattedDate = formatDbDate(appointment.TheDate)
        const formattedTime = formatDbTime(appointment.TheTime)

        try {
          const updateRequest = pool.request()
          console.log(
            `🔄 Updating reminder: DoctorID=${appointment.DoctorID}, TheDate=${appointment.TheDate}, TheTime=${appointment.TheTime}, BranchID=${appointment.BranchID}`
          )
          const rowsAffected = await QUERIES.updateAppointmentIsScheduleWhatsAppSent(
            updateRequest,
            appointment
          )
          if (rowsAffected > 0) {
            console.log(
              `✅ Updated IsScheduleWhatsAppSent for reminder: ${appointment.Name} (Date: ${formattedDate}, Time: ${formattedTime}) - Rows affected: ${rowsAffected}`
            )
          } else {
            console.warn(
              `⚠️ No rows updated for reminder: ${appointment.Name} (Date: ${formattedDate}, Time: ${formattedTime}) - DoctorID: ${appointment.DoctorID}, TheDate: ${appointment.TheDate}, TheTime: ${appointment.TheTime}, BranchID: ${appointment.BranchID}`
            )
            // Skip sending if update failed - might be a data mismatch
            continue
          }
        } catch (updateError) {
          console.error(
            `❌ Failed to update IsScheduleWhatsAppSent for reminder ${appointment.Name}:`,
            updateError
          )
          // Skip sending if update failed
          continue
        }

        // Appointment is within reminder window, send the message
        const message = `
مرحباً ${appointment.Name || 'مريض'}،

تذكير: لديك موعد قادم مع الدكتور/ة ${appointment.DoctorArbName || 'غير محدد'} في قسم ${appointment.SpecialtyArbName || 'غير محدد'}.
📅 التاريخ: ${formattedDate}
⏰ الوقت: ${formattedTime}
${company?.CompanyArbName ? `في *${company.CompanyArbName}*` : ''}
${company?.ArbAddress ? `📍 العنوان: ${company.ArbAddress}` : ''}
${company?.ArbTel ? `📞 الهاتف: ${company.ArbTel}` : ''}

نتمنى لك الصحة والعافية 🌹
        `.trim()

        console.log(
          `📨 Sending appointment reminder to ${appointment.Name} (${appointment.Number}) - Appointment: ${formattedDate} ${formattedTime}`
        )

        // Send the message
        const result = await sendMessageToPhone(
          appointment.Number,
          message,
          'appointmentReminder',
          appointment.Name
        )

        if (result.success) {
          console.log(`✅ Appointment reminder sent successfully to ${appointment.Name}`)
        } else {
          console.error(
            `❌ Failed to send appointment reminder to ${appointment.Name}: ${result.error}`
          )
        }
      } catch (appointmentError) {
        console.error(
          `Error processing appointment reminder for ${appointment.Name}:`,
          appointmentError
        )
        // Continue with next appointment
        continue
      }
    }
  } catch (err) {
    console.error('Error watching appointment reminders:', err)
  }
})

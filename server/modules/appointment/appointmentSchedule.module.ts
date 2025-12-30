import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { QUERIES } from '../../constants/queries'
import { getConnection } from '../../db'
import { getReminderSettings, getReminderTimeMs } from '../../utils/appointmentReminderSettings'
import { formatDbDate, formatDbTime } from '../../utils/formatDb'
import { sendMessageToPhone } from '../../utils/whatsapp'

let initialized = false
const sentReminders = new Set<string>() // Track sent reminders by unique key

scheduleJob('*/1 * * * * *', async () => {
  try {
    const pool = await getConnection()
    // Get all appointments using the provided query
    const allAppointmentsResult = await pool.request().query(QUERIES.appointments)
    const allAppointments = allAppointmentsResult.recordset
    const company = await companyHeader.getCompanyHeader()
    const now = new Date()

    // Get reminder settings
    const reminderSettings = getReminderSettings()
    const reminderTimeMs = getReminderTimeMs(reminderSettings)

    // If reminders are disabled, skip processing
    if (!reminderSettings.enabled || reminderTimeMs === 0) {
      return
    }

    if (!initialized) {
      // On first run, just mark all upcoming appointments as already reminded
      for (const appointment of allAppointments) {
        const dateStr = appointment.TheDate?.toString() || ''
        const timeStr = appointment.TheTime?.toString().padStart(4, '0') || ''
        const key = `${appointment.PatientID}_${appointment.BranchID}_${dateStr}_${timeStr}`
        sentReminders.add(key)
      }
      initialized = true
      return
    }

    for (const appointment of allAppointments) {
      // Parse date and time to a JS Date object
      const dateStr = appointment.TheDate?.toString() || ''
      const timeStr = appointment.TheTime?.toString().padStart(4, '0') || ''
      let appointmentDate: Date | null = null
      if (dateStr.length === 8 && timeStr.length === 4) {
        appointmentDate = new Date(
          Number(dateStr.slice(0, 4)),
          Number(dateStr.slice(4, 6)) - 1,
          Number(dateStr.slice(6, 8)),
          Number(timeStr.slice(0, 2)),
          Number(timeStr.slice(2, 4))
        )
      }

      // Check if appointment is within the reminder window
      let isWithinReminderWindow = false
      if (appointmentDate) {
        // Calculate when the reminder should be sent (appointment time - reminder time)
        const reminderTime = new Date(appointmentDate.getTime() - reminderTimeMs)
        // Create a 1-hour window for sending the reminder (to account for timing variations)
        const reminderWindowStart = new Date(reminderTime.getTime() - 30 * 60 * 1000) // 30 minutes before
        const reminderWindowEnd = new Date(reminderTime.getTime() + 30 * 60 * 1000) // 30 minutes after

        // Check if current time is within the reminder window
        // Also ensure the appointment is in the future
        isWithinReminderWindow =
          appointmentDate > now && now >= reminderWindowStart && now <= reminderWindowEnd
      }

      const key = `${appointment.PatientID}_${appointment.BranchID}_${dateStr}_${timeStr}`
      if (isWithinReminderWindow && !sentReminders.has(key)) {
        const formattedDate = formatDbDate(appointment.TheDate)
        const formattedTime = formatDbTime(appointment.TheTime)
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
        await sendMessageToPhone(
          appointment.Number,
          message,
          'appointmentReminder',
          appointment.Name
        )
        sentReminders.add(key)
      }
    }
  } catch (err) {
    console.error('Error watching Appointments:', err)
  }
})

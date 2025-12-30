import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { QUERIES } from '../../constants/queries'
import { getConnection, isDatabaseConnected } from '../../db'
import { sendMessageToPhone } from '../../utils'
import { formatDbDate, formatDbTime } from '../../utils/formatDb'

// Track processed appointments using a unique key: PatientID_BranchID_Date_Time
const processedAppointments = new Set<string>()
let initialized = false

// Export function to reset (for debugging/manual reset)
export const resetAppointmentWatcher = (): void => {
  processedAppointments.clear()
  initialized = false
  console.log('🔄 Appointment watcher reset - will reinitialize on next check')
}

console.log('📋 Appointment watcher module loaded and scheduled')

scheduleJob('*/1 * * * * *', async () => {
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

    if (!initialized) {
      // On first run, mark all existing appointments as processed
      for (const appointment of allAppointments) {
        const dateStr = appointment.TheDate?.toString() || ''
        const timeStr = appointment.TheTime?.toString().padStart(4, '0') || ''
        const key = `${appointment.PatientID}_${appointment.BranchID}_${dateStr}_${timeStr}`
        processedAppointments.add(key)
      }
      initialized = true
      console.log(
        `✅ Initialized appointment watcher. Found ${allAppointments.length} existing appointments.`
      )
      return
    }

    // Process new appointments
    const company = await companyHeader.getCompanyHeader()
    let newCount = 0
    let skippedCount = 0

    for (const appointment of allAppointments) {
      const dateStr = appointment.TheDate?.toString() || ''
      const timeStr = appointment.TheTime?.toString().padStart(4, '0') || ''
      const key = `${appointment.PatientID}_${appointment.BranchID}_${dateStr}_${timeStr}`

      // Skip if already processed
      if (processedAppointments.has(key)) {
        skippedCount++
        continue
      }

      // Mark as processed immediately to avoid duplicate processing
      processedAppointments.add(key)
      newCount++

      console.log(
        `🆕 NEW APPOINTMENT DETECTED: ${appointment.Name} (ID: ${appointment.PatientID}, Date: ${dateStr}, Time: ${timeStr})`
      )

      // Check if appointment date is today or in the future
      const appointmentDate = new Date(appointment.TheDate)
      const today = new Date()
      today.setHours(0, 0, 0, 0) // Reset time to start of day for accurate comparison
      appointmentDate.setHours(0, 0, 0, 0) // Reset time to start of day for accurate comparison

      // Skip appointments that are in the past
      if (appointmentDate < today) {
        console.log(
          `Skipping past appointment for ${appointment.Name} on ${formatDbDate(appointment.TheDate)}`
        )
        continue
      }

      const formattedDate = formatDbDate(appointment.TheDate)
      const formattedTime = formatDbTime(appointment.TheTime)
      const message = `
مرحباً ${appointment.Name || 'مريض'}،

تم حجز موعدك بنجاح مع الدكتور/ة ${appointment.DoctorArbName || 'غير محدد'} في قسم ${appointment.SpecialtyArbName || 'غير محدد'}.
📅 التاريخ: ${formattedDate}
⏰ الوقت: ${formattedTime}
${company?.CompanyArbName ? `في *${company.CompanyArbName}*` : ''}
${company?.ArbAddress ? `📍 العنوان: ${company.ArbAddress}` : ''}
${company?.ArbTel ? `📞 الهاتف: ${company.ArbTel}` : ''}

نتمنى لك الصحة والعافية 🌹
      `.trim()

      console.log(
        `📨 Sending appointment message to ${appointment.Name} (${appointment.Number}) for ${formattedDate}`
      )
      await sendMessageToPhone(appointment.Number, message, 'appointment', appointment.Name)
    }

    if (newCount > 0) {
      console.log(`✅ Processed ${newCount} new appointment(s)`)
    } else if (allAppointments.length > processedAppointments.size) {
      console.log(
        `⚠️ WARNING: Found ${allAppointments.length} appointments but only ${processedAppointments.size} processed. Skipped: ${skippedCount}. This might indicate a mismatch.`
      )
    }
  } catch (err) {
    console.error('Error watching Appointments:', err)
  }
})

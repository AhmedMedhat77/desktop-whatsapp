import { scheduleJob } from 'node-schedule'
import { getConnection } from '../../db'
import { companyHeader } from '../../constants/companyHeader'
import { formatDbDate, formatDbTime } from '../../utils/formatDb'
import { QUERIES } from '../../constants/queries'
import { sendMessageToPhone } from '../../utils'

let lastMaxId = 0
let initialized = false

scheduleJob('*/1 * * * * *', async () => {
  try {
    const pool = await getConnection()
    // Get all appointments using the provided query
    const allAppointmentsResult = await pool.request().query(QUERIES.appointments)
    const allAppointments = allAppointmentsResult.recordset
    // Find the max PatientID for tracking (or use another unique field if available)

    const allAppointmentsLength = allAppointments.length

    if (!initialized) {
      lastMaxId = allAppointmentsLength
      initialized = true
      return // skip on first run or after restart
    }

    if (allAppointmentsLength > lastMaxId) {
      const company = await companyHeader.getCompanyHeader()
      // Only process the new appointments
      const newAppointments = allAppointments.slice(lastMaxId)

      for (const appointment of newAppointments) {
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

        console.log(`Sending appointment message to ${appointment.Name} for ${formattedDate}`)
        await sendMessageToPhone(
          appointment.Number,
          message,
          true,
          'appointment',
          appointment.Name
        )
      }
      lastMaxId = allAppointmentsLength
    }
  } catch (err) {
    console.error('Error watching Appointments:', err)
  }
})

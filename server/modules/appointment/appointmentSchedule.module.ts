import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { QUERIES } from '../../constants/queries'
import { getConnection } from '../../db'
import { formatDbDate, formatDbTime } from '../../utils/formatDb'
import { sendMessageToPhone } from '../../utils/whatsapp'

let initialized = false
const sentReminders = new Set<string>() // Track sent reminders by unique key

scheduleJob('*/1 * * * * *', async () => {
  try {
    const pool = await getConnection()
    const request = pool.request()
    // Get all appointments using the provided query
    const allAppointmentsResult = await QUERIES.appointments(request)
    const allAppointments = allAppointmentsResult.recordset
    const company = await companyHeader.getCompanyHeader()

    // Get reminder settings

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
      await sendMessageToPhone(appointment.Number, message, 'appointmentReminder', appointment.Name)
      await QUERIES.updateAppointmentIsWhatsAppSent(pool.request(), appointment)
    }
  } catch (err) {
    console.error('Error watching Appointments:', err)
  }
})

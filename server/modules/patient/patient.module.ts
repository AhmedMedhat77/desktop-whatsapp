import sql from 'mssql'
import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { QUERIES } from '../../constants/queries'
import { getConnection, isDatabaseConnected } from '../../db'
import { sendMessageToPhone } from '../../utils'

// Track processed patients by PatientID
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

    /*
    1- Get all patients where IsWhatsAppSent = 0 (not sent yet)
    2- Get Company Header
    */

    const allPatientsResult = await QUERIES.getPatients(pool.request())
    const allPatients = allPatientsResult.recordset

    // Process new patients
    const company = await companyHeader.getCompanyHeader()

    for (const patient of allPatients) {
      const patientId = Number(patient.PatientID)

      // Validate PatientID
      if (isNaN(patientId)) {
        console.warn(
          `⚠️ Skipping patient with invalid PatientID: ${patient.PatientID} - ${patient.Name}`
        )
        continue
      }

      // Skip if already processed (double-check to avoid race conditions)
      if (patient.IsWhatsAppSent === 1) {
        continue
      }

      const message = `
مرحباً ${patient.Name || 'مريض'}،

يسعدنا انضمامكم إلى *${company?.CompanyArbName || 'العيادة'}*  
📍 العنوان: ${company?.ArbAddress || 'غير متوفر'}  
${company?.ArbTel ? `📞 الهاتف: ${company.ArbTel}` : ''}

✅ تم إنشاء حسابكم بنجاح.  
🔖 رقم الملف: ${patient.PatientID}

نشكر لكم ثقتكم ونتمنى لكم دوام الصحة والعافية 🌹
      `.trim()

      console.log(
        `📨 Sending new patient message to ${patient.Name} (${patient.Number}) - PatientID: ${patientId}`
      )

      // Send the message
      const result = await sendMessageToPhone(patient.Number, message, 'newPatient', patient.Name)

      // Only mark as sent if message was successfully sent
      if (result.success) {
        console.log(`✅ Message sent successfully to ${patient.Name} (${patient.Number})`)
        // Update IsWhatsAppSent to 1 to mark as sent (using parameterized query)
        await pool
          .request()
          .input('id', sql.Int, patient.ID)
          .query(`UPDATE Clinic_PatientsTelNumbers SET IsWhatsAppSent = 1 WHERE ID = @id`)
      } else {
        console.error(`❌ Failed to send message to ${patient.Name}: ${result.error}`)
        // Don't update IsWhatsAppSent if send failed, so it can be retried
      }
    }
  } catch (err) {
    console.error('Error watching Clinic_PatientsTelNumbers:', err)
  }
})

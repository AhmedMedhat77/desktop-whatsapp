import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { getConnection } from '../../db'
import { sendMessageToPhone } from '../../utils'

let lastMaxId = 0
let initialized = false

scheduleJob('*/1 * * * * *', async () => {
  try {
    const pool = await getConnection()
    // Get the max ID in the table
    const maxIdResult = await pool
      .request()
      .query('SELECT ISNULL(MAX(PatientID),0) as maxId FROM Clinic_PatientsTelNumbers')

    const maxId = maxIdResult.recordset[0].maxId

    if (!initialized) {
      lastMaxId = maxId
      initialized = true
      return // skip on first run or after restart
    }
    if (maxId > lastMaxId) {
      // Fetch new rows
      const newRows = await pool
        .request()
        .query(`SELECT * FROM Clinic_PatientsTelNumbers WHERE PatientID > ${lastMaxId}`)
      const company = await companyHeader.getCompanyHeader()
      for (const patient of newRows.recordset) {
        // const number = filterPhoneNumber(patient.Number);

        const message = `
مرحباً ${patient.Name || 'مريض'}،

يسعدنا انضمامكم إلى *${company?.CompanyArbName || 'العيادة'}*  
📍 العنوان: ${company?.ArbAddress || 'غير متوفر'}  
${company?.ArbTel ? `📞 الهاتف: ${company.ArbTel}` : ''}

✅ تم إنشاء حسابكم بنجاح.  
🔖 رقم الملف: ${patient.PatientID}

نشكر لكم ثقتكم ونتمنى لكم دوام الصحة والعافية 🌹
        `.trim()
        await sendMessageToPhone(patient.Number, message, 'newPatient', patient.Name)
      }
      lastMaxId = maxId
    }
  } catch (err) {
    console.error('Error watching Clinic_PatientsTelNumbers:', err)
  }
})

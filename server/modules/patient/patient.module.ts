import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { getConnection, isDatabaseConnected } from '../../db'
import { sendMessageToPhone } from '../../utils'

interface Patient {
  ID: number
  PatientID: number
  Name: string
  Number: string
  Transfer: number
}

// Track processed patients by PatientID
const processedPatients = new Set<number>()
let initialized = false

// Export function to reset (for debugging/manual reset)
export const resetPatientWatcher = (): void => {
  processedPatients.clear()
  initialized = false
  console.log('🔄 Patient watcher reset - will reinitialize on next check')
}

// console.log('📋 Patient watcher module loaded and scheduled')

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

    // Get all patients ordered by PatientID
    const allPatientsResult = await pool
      .request()
      .query('SELECT * FROM Clinic_PatientsTelNumbers ORDER BY ID ASC')

    const allPatients = allPatientsResult.recordset

    if (!initialized) {
      // On first run, mark all existing patients as processed
      // But DON'T send messages for them - only for NEW ones added after this
      for (const patient of allPatients) {
        const patientId = Number(patient.PatientID)
        if (isNaN(patientId)) {
          console.warn(
            `⚠️ Invalid PatientID found: ${patient.PatientID} for patient ${patient.Name}`
          )
          continue
        }
        processedPatients.add(patientId)
      }
      initialized = true
      // console.log(
      //   `✅ Initialized patient watcher. Found ${allPatients.length} existing patients. Tracking ${processedPatients.size} patient IDs.`
      // )
      // console.log(`📝 Note: Only NEW patients added AFTER this will receive messages.`)
      return
    }

    // Debug: Log current state
    if (allPatients.length > processedPatients.size) {
      console.log(
        `🔍 Checking for new patients. Total in DB: ${allPatients.length}, Processed: ${processedPatients.size}`
      )
    }

    // Process new patients
    const company = await companyHeader.getCompanyHeader()
    let newCount = 0
    let skippedCount = 0

    console.log(
      `🔍 Processing ${allPatients.length} patients. Already processed: ${processedPatients.size}`
    )

    for (const patient of allPatients) {
      const patientId = Number(patient.PatientID)

      // Validate PatientID
      if (isNaN(patientId)) {
        console.warn(
          `⚠️ Skipping patient with invalid PatientID: ${patient.PatientID} - ${patient.Name}`
        )
        continue
      }

      // Skip if already processed
      if (processedPatients.has(patientId)) {
        skippedCount++
        continue
      }

      // NEW PATIENT FOUND! Mark as processed immediately to avoid duplicate processing
      processedPatients.add(patientId)
      newCount++

      console.log(
        `🆕🆕🆕 NEW PATIENT DETECTED: ${patient.Name} (ID: ${patientId}, Phone: ${patient.Number})`
      )
      console.log(
        `📊 Current stats: Total in DB: ${allPatients.length}, Processed: ${processedPatients.size}, New: ${newCount}`
      )

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

      if (result.success) {
        console.log(`✅ Message sent successfully to ${patient.Name} (${patient.Number})`)
      } else {
        console.error(`❌ Failed to send message to ${patient.Name}: ${result.error}`)
      }
    }

    if (newCount > 0) {
      console.log(`✅ Processed ${newCount} new patient(s)`)
    } else if (allPatients.length > processedPatients.size) {
      console.log(
        `⚠️⚠️⚠️ WARNING: Found ${allPatients.length} patients but only ${processedPatients.size} processed. Skipped: ${skippedCount}.`
      )
      // Find which patient IDs are missing and process them
      const missingPatients: Array<{ id: number; patient: Patient }> = []
      for (const patient of allPatients) {
        const patientId = Number(patient.PatientID)
        if (!isNaN(patientId) && !processedPatients.has(patientId)) {
          missingPatients.push({ id: patientId, patient })
        }
      }

      if (missingPatients.length > 0) {
        console.log(`🔍 Found ${missingPatients.length} missing patient(s). Processing now...`)
        for (const { id, patient } of missingPatients) {
          // Mark as processed
          processedPatients.add(id)
          newCount++

          console.log(
            `🆕🆕🆕 MISSING PATIENT FOUND AND PROCESSING: ${patient.Name} (ID: ${id}, Phone: ${patient.Number})`
          )

          const message = `
مرحباً ${patient.Name || 'مريض'}،

يسعدنا انضمامكم إلى *${company?.CompanyArbName || 'العيادة'}*  
📍 العنوان: ${company?.ArbAddress || 'غير متوفر'}  
${company?.ArbTel ? `📞 الهاتف: ${company.ArbTel}` : ''}

✅ تم إنشاء حسابكم بنجاح.  
🔖 رقم الملف: ${patient.PatientID}

نشكر لكم ثقتكم ونتمنى لكم دوام الصحة والعافية 🌹
          `.trim()

          console.log(`📨 Sending message to missing patient: ${patient.Name} (${patient.Number})`)
          const result = await sendMessageToPhone(
            patient.Number,
            message,
            'newPatient',
            patient.Name
          )

          if (result.success) {
            console.log(`✅ Message sent successfully to ${patient.Name}`)
          } else {
            console.error(`❌ Failed to send message: ${result.error}`)
          }
        }

        if (newCount > 0) {
          console.log(`✅✅✅ Processed ${newCount} missing patient(s)!`)
        }
      } else {
        console.log(`⚠️ No valid missing patients found (might be NaN PatientIDs)`)
      }
    }
  } catch (err) {
    console.error('Error watching Clinic_PatientsTelNumbers:', err)
  }
})

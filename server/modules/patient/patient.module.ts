import { scheduleJob } from 'node-schedule'
import { companyHeader } from '../../constants/companyHeader'
import { QUERIES } from '../../constants/queries'
import { getConnection, isDatabaseConnected } from '../../db'
import { sendMessageToPhone } from '../../utils'
import { FixedMessages } from '../../quiries/FixedMessages'

// Track processed patients in current execution to prevent duplicates
const processingPatients = new Set<number>()

scheduleJob('*/1 * * * * *', async () => {
  // Clear the processing set at the start of each run
  processingPatients.clear()
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

    if (allPatients.length === 0) {
      // No patients to process, skip silently
      return
    }

    console.log(`🔍 Found ${allPatients.length} patient(s) to process`)

    // Process new patients
    const company = await companyHeader.getCompanyHeader()

    if (!company) {
      console.error('Company header not found')
      return
    }
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

      // Skip if already being processed in this run
      if (processingPatients.has(patientId)) {
        console.log(`⏭️ Skipping duplicate patient: ${patient.Name} (ID: ${patientId})`)
        continue
      }

      // Mark as processing immediately
      processingPatients.add(patientId)

      const message = FixedMessages.PatientMessage(patient, company)
      try {
        const updateRequest = pool.request()
        const rowsAffected = await QUERIES.updatePatientIsWhatsAppSent(updateRequest, patient)
        if (rowsAffected > 0) {
          console.log(
            `✅ Updated IsWhatsAppSent for patient: ${patient.Name} (ID: ${patientId}) - Rows affected: ${rowsAffected}`
          )
        } else {
          console.warn(
            `⚠️ No rows updated for patient: ${patient.Name} (ID: ${patientId}) - BranchID: ${patient.BranchID} - Check if record exists`
          )
          // Skip sending if update failed - might be a data mismatch
          continue
        }
      } catch (updateError) {
        console.error(
          `❌ Failed to update IsWhatsAppSent for patient ${patient.Name}:`,
          updateError
        )
        // Skip sending if update failed
        continue
      }

      // Send the message
      const result = await sendMessageToPhone(patient.Number, message, 'newPatient', patient.Name)

      if (result.success) {
        console.log(`✅ Message sent successfully to ${patient.Name} (${patient.Number})`)
      } else {
        console.error(`❌ Failed to send message to ${patient.Name}: ${result.error}`)
        // Note: We already marked it as sent to prevent spam, even if sending failed
      }
    }
  } catch (err) {
    console.error('Error watching Clinic_PatientsTelNumbers:', err)
  }
})

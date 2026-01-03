import { IResult, Request } from 'mssql'
import { sql } from '../db'
import { Appointment, AppointmentMessage, CompanyHeader, Patient, WhatsAppStatus } from './Types'

export const QUERIES = {
  companyHeader: async (request: Request): Promise<IResult<CompanyHeader>> => {
    return await request.query(
      `SELECT 
        pic,
        CompanyArbName,
        CompanyEngName,
        ArbAddress,
        EngAddress,
        ArbTel,
        EngTel
      FROM dbo.CompanyHeader`
    )
  },

  claimPatientMessages: async (
    request: Request,
    workerId: string,
    batchSize: number = 10,
    staleTimeoutMinutes: number = 5
  ): Promise<IResult<Patient>> => {
    request.input('workerId', sql.VarChar(255), workerId)
    request.input('statusProcessing', sql.Int, WhatsAppStatus.PROCESSING)
    request.input('statusPending', sql.Int, WhatsAppStatus.PENDING)
    request.input('statusFailed', sql.Int, WhatsAppStatus.FAILED)
    request.input('maxRetries', sql.Int, 3)
    request.input(
      'staleTimeout',
      sql.DateTime,
      new Date(Date.now() - staleTimeoutMinutes * 60 * 1000)
    )
    request.input('batchSize', sql.Int, batchSize)

    return await request.query(`
      -- Claim up to @batchSize pending patient messages atomically
      UPDATE TOP (@batchSize) Patient
      SET 
        Patient.WhatsAppStatus = @statusProcessing,
        Patient.WhatsAppWorkerID = @workerId,
        Patient.WhatsAppProcessedAt = GETDATE()
      OUTPUT 
        INSERTED.ID,
        INSERTED.PatientID,
        INSERTED.Name,
        INSERTED.Number,
        INSERTED.Transfer,
        INSERTED.BranchID,
        INSERTED.WhatsAppStatus,
        INSERTED.WhatsAppWorkerID,
        INSERTED.WhatsAppProcessedAt,
        INSERTED.WhatsAppRetryCount,
        INSERTED.IsWhatsAppSent
      FROM Clinic_PatientsTelNumbers AS Patient
      WHERE 
      (
        Patient.WhatsAppStatus IN (@statusPending, @statusFailed)
        AND (
          Patient.WhatsAppStatus = @statusPending 
          OR Patient.WhatsAppRetryCount < @maxRetries
        )
      )
      OR
      (
        -- Also claim stale PROCESSING records
        Patient.WhatsAppStatus = @statusProcessing 
        AND Patient.WhatsAppProcessedAt < @staleTimeout
      )
    `)
  },

  /**
   * Updates patient message status after sending attempt.
   */
  updatePatientMessageStatus: async (
    request: Request,
    patient: Patient,
    status: WhatsAppStatus,
    workerId: string
  ): Promise<number> => {
    request.input('PatientID', sql.Int, patient.PatientID)
    request.input('BranchID', sql.Int, patient.BranchID)
    request.input('status', sql.Int, status)
    request.input('workerId', sql.VarChar(255), workerId)
    request.input(
      'retryCount',
      sql.Int,
      status === WhatsAppStatus.FAILED
        ? (patient.WhatsAppRetryCount || 0) + 1
        : patient.WhatsAppRetryCount || 0
    )

    const result = await request.query(`
      UPDATE Clinic_PatientsTelNumbers 
      SET 
        WhatsAppStatus = @status,
        WhatsAppRetryCount = @retryCount,
        -- Update legacy field for backward compatibility
        IsWhatsAppSent = CASE WHEN @status = ${WhatsAppStatus.SENT} THEN 1 ELSE IsWhatsAppSent END
      WHERE PatientID = @PatientID 
        AND BranchID = @BranchID
        AND WhatsAppWorkerID = @workerId
        AND WhatsAppStatus = ${WhatsAppStatus.PROCESSING}
    `)
    return result.rowsAffected[0] || 0
  },

  patientTel: async (request: Request): Promise<IResult<Patient>> => {
    return await request.query(`SELECT * FROM Clinic_PatientsTelNumbers ORDER BY PatientID ASC`)
  },

  getPatients: async (request: Request): Promise<IResult<Patient>> => {
    request.input('isWhatsAppSent', sql.Int, 0)
    return await request.query(
      `SELECT * FROM Clinic_PatientsTelNumbers WHERE IsWhatsAppSent = @isWhatsAppSent  ORDER BY ID ASC`
    )
  },
  getAppointments: async (request: Request): Promise<IResult<Appointment>> => {
    return await request.query(`
   SELECT 
Appointments.PatientID,
Appointments.DoctorID,
Appointments.TheDate AS AppointmentDate,
Appointments.TheTime AS AppointmentTime,
Doctors.ArbName AS DoctorArbName, 
Doctors.EngName AS DoctorEngName,
p.ArbName AS PatientArbName,
p.EngName AS PatientEngName,
Doctors.DoctorSpecialtyID, 
sp.ArbName AS SpecialtyArbName,
sp.EngName AS SpecialtyEngName,
PatientNumber.Number
FROM Clinic_PatientsAppointments AS Appointments
INNER JOIN Clinic_Doctors  AS Doctors 
ON Appointments.DoctorID = Doctors.DoctorID 
AND Appointments.BranchID = Doctors.BranchID
INNER JOIN Clinic_DoctorSpecialty AS sp
ON Doctors.DoctorSpecialtyID = sp.ID
LEFT JOIN  Clinic_Patients AS p 
ON p.PatientID = Appointments.PatientID 
AND p.BranchID = Appointments.BranchID 
LEFT JOIN Clinic_PatientsTelNumbers as PatientNumber 
ON p.PatientID = PatientNumber.PatientID
    `)
  },

  /**
   * Add appointment to reminder queue (with duplicate prevention)
   * Only inserts if appointment doesn't already exist in queue
   */

  AddAppointmentToReminderQueue: async (
    request: Request,
    appointment: Appointment
  ): Promise<IResult<void>> => {
    // Use parameterized query to prevent SQL injection
    // Provide default values for fields that might be NULL
    request.input('PatientID', sql.Int, appointment.PatientID)
    request.input('DoctorID', sql.Int, appointment.DoctorID)
    request.input('AppointmentDate', sql.Int, appointment.AppointmentDate)
    request.input('AppointmentTime', sql.Int, appointment.AppointmentTime)
    request.input('DoctorArbName', sql.NVarChar(255), appointment.DoctorArbName || 'غير محدد')
    request.input('DoctorEngName', sql.NVarChar(255), appointment.DoctorEngName || 'غير محدد')
    request.input('PatientArbName', sql.NVarChar(255), appointment.PatientArbName || 'غير محدد')
    request.input('PatientEngName', sql.NVarChar(255), appointment.PatientEngName || 'غير محدد')
    request.input('DoctorSpecialtyID', sql.Int, appointment.DoctorSpecialtyID || 0)
    request.input('SpecialtyArbName', sql.NVarChar(255), appointment.SpecialtyArbName || 'غير محدد')
    request.input('SpecialtyEngName', sql.NVarChar(255), appointment.SpecialtyEngName || 'Unknown')
    request.input('Number', sql.NVarChar(255), appointment.Number || 'Unknown')

    return await request.query(`
      -- Only insert if appointment doesn't already exist (duplicate prevention)
      INSERT INTO Appointment_Message_Table (
        PatientID, DoctorID, AppointmentDate, AppointmentTime,
        DoctorArbName, DoctorEngName,
        PatientArbName, PatientEngName,
        DoctorSpecialtyID,
        SpecialtyArbName, SpecialtyEngName,
        InitialMessage, ReminderMessage
      )
      SELECT 
        @PatientID, @DoctorID, @AppointmentDate, @AppointmentTime,
        @DoctorArbName, @DoctorEngName,
        @PatientArbName, @PatientEngName,
        @DoctorSpecialtyID,
        @SpecialtyArbName, @SpecialtyEngName,
        0, 0
      WHERE NOT EXISTS (
        SELECT 1 FROM Appointment_Message_Table
        WHERE PatientID = @PatientID
          AND DoctorID = @DoctorID
          AND AppointmentDate = @AppointmentDate
          AND AppointmentTime = @AppointmentTime
      )
    `)
  },

  /**
   * Get appointments from reminder queue that need initial message
   * Returns appointments where InitialMessage = 0
   */
  GetAppointmentFromReminderQueue: async (
    request: Request
  ): Promise<IResult<AppointmentMessage>> => {
    return await request.query(`
      SELECT 
        msg.*,
        pt.Number
      FROM Appointment_Message_Table AS msg
      LEFT JOIN Clinic_PatientsTelNumbers AS pt
        ON msg.PatientID = pt.PatientID
      WHERE msg.InitialMessage = 0
        AND pt.Number IS NOT NULL AND pt.Number != ''
      ORDER BY msg.AppointmentDate ASC, msg.AppointmentTime ASC
    `)
  },

  /**
   * Get appointments that need reminder message
   * Returns appointments where InitialMessage = 1 AND ReminderMessage = 0
   */
  GetAppointmentsForReminder: async (request: Request): Promise<IResult<AppointmentMessage>> => {
    return await request.query(`
      SELECT 
        msg.*,
        pt.Number
      FROM Appointment_Message_Table AS msg
      LEFT JOIN Clinic_PatientsTelNumbers AS pt
        ON msg.PatientID = pt.PatientID
      WHERE msg.InitialMessage = 1 AND msg.ReminderMessage = 0
        AND pt.Number IS NOT NULL AND pt.Number != ''
      ORDER BY msg.AppointmentDate ASC, msg.AppointmentTime ASC
    `)
  },

  /**
   * Update appointment initial message flag (atomic operation)
   * Only updates if InitialMessage = 0 (prevents duplicates)
   */
  updateAppointmentInitialMessage: async (
    request: Request,
    appointment: AppointmentMessage
  ): Promise<IResult<void>> => {
    request.input('ID', sql.Int, appointment.ID)
    return await request.query(`
      UPDATE Appointment_Message_Table
      SET InitialMessage = 1
      WHERE ID = @ID AND InitialMessage = 0
    `)
  },

  /**
   * Reset appointment initial message flag (for retry on failure)
   */
  resetAppointmentInitialMessage: async (
    request: Request,
    appointment: AppointmentMessage
  ): Promise<IResult<void>> => {
    request.input('ID', sql.Int, appointment.ID)
    return await request.query(`
      UPDATE Appointment_Message_Table
      SET InitialMessage = 0
      WHERE ID = @ID
    `)
  },

  /**
   * Update appointment reminder message flag (atomic operation)
   * Only updates if ReminderMessage = 0 (prevents duplicates)
   */
  updateAppointmentReminderMessage: async (
    request: Request,
    appointment: AppointmentMessage
  ): Promise<IResult<void>> => {
    request.input('ID', sql.Int, appointment.ID)
    return await request.query(`
      UPDATE Appointment_Message_Table
      SET ReminderMessage = 1
      WHERE ID = @ID AND ReminderMessage = 0
    `)
  },

  /**
   * Reset appointment reminder message flag (for retry on failure)
   */
  resetAppointmentReminderMessage: async (
    request: Request,
    appointment: AppointmentMessage
  ): Promise<IResult<void>> => {
    request.input('ID', sql.Int, appointment.ID)
    return await request.query(`
      UPDATE Appointment_Message_Table
      SET ReminderMessage = 0
      WHERE ID = @ID
    `)
  },

  /**
   * Get all messages (sent, failed, pending) from the database for frontend display.
   * Returns messages from Appointment_Message_Table (appointments) and Clinic_PatientsTelNumbers (patients).
   */
  getSentMessages: async (
    request: Request
  ): Promise<
    IResult<{
      messageType: string
      status: string
      statusCode: number
      retryCount: number | null
      userName: string
      phoneNumber: string
      datePart: string
      timePart: string
      processedAt: Date | null
      id: number | null
    }>
  > => {
    return await request.query(`
      -- Appointment initial messages (confirmation)
      SELECT 
        'appointment' as messageType,
        CASE 
          WHEN msg.InitialMessage = 1 THEN 'sent'
          ELSE 'pending'
        END as status,
        CASE 
          WHEN msg.InitialMessage = 1 THEN 2  -- SENT
          ELSE 0  -- PENDING
        END as statusCode,
        NULL as retryCount,
        ISNULL(msg.PatientArbName, 'Unknown') as userName,
        ISNULL(pt.Number, '') as phoneNumber,
        CAST(msg.AppointmentDate AS VARCHAR(8)) as datePart,
        REPLACE(STR(msg.AppointmentTime, 4, 0), ' ', '0') as timePart,
        NULL as processedAt,  -- Could add CreatedAt or UpdatedAt if available
        msg.ID as id
      FROM Appointment_Message_Table AS msg
      LEFT JOIN Clinic_PatientsTelNumbers AS pt
        ON msg.PatientID = pt.PatientID
      WHERE pt.Number IS NOT NULL AND pt.Number != ''

      UNION ALL

      -- Appointment reminder messages
      SELECT 
        'appointmentReminder' as messageType,
        CASE 
          WHEN msg.ReminderMessage = 1 THEN 'sent'
          ELSE 'pending'
        END as status,
        CASE 
          WHEN msg.ReminderMessage = 1 THEN 2  -- SENT
          ELSE 0  -- PENDING
        END as statusCode,
        NULL as retryCount,
        ISNULL(msg.PatientArbName, 'Unknown') as userName,
        ISNULL(pt.Number, '') as phoneNumber,
        CAST(msg.AppointmentDate AS VARCHAR(8)) as datePart,
        REPLACE(STR(msg.AppointmentTime, 4, 0), ' ', '0') as timePart,
        NULL as processedAt,
        msg.ID as id
      FROM Appointment_Message_Table AS msg
      LEFT JOIN Clinic_PatientsTelNumbers AS pt
        ON msg.PatientID = pt.PatientID
      WHERE msg.InitialMessage = 1  -- Only show reminders for appointments where initial message was sent
        AND pt.Number IS NOT NULL AND pt.Number != ''

      UNION ALL

      -- New patient welcome messages
      SELECT 
        'newPatient' as messageType,
        CASE 
          WHEN Patient.WhatsAppStatus = 0 THEN 'pending'
          WHEN Patient.WhatsAppStatus = 1 THEN 'processing'
          WHEN Patient.WhatsAppStatus = 2 THEN 'sent'
          WHEN Patient.WhatsAppStatus = 3 THEN 'failed'
          ELSE 'unknown'
        END as status,
        Patient.WhatsAppStatus as statusCode,
        Patient.WhatsAppRetryCount as retryCount,
        Patient.Name as userName,
        Patient.Number as phoneNumber,
        -- Use processedAt if available, otherwise current date
        CASE 
          WHEN Patient.WhatsAppProcessedAt IS NOT NULL 
          THEN CONVERT(VARCHAR(8), Patient.WhatsAppProcessedAt, 112)
          ELSE CONVERT(VARCHAR(8), GETDATE(), 112)
        END as datePart,
        CASE 
          WHEN Patient.WhatsAppProcessedAt IS NOT NULL 
          THEN REPLACE(CONVERT(VARCHAR(5), Patient.WhatsAppProcessedAt, 108), ':', '')
          ELSE REPLACE(CONVERT(VARCHAR(5), GETDATE(), 108), ':', '')
        END as timePart,
        Patient.WhatsAppProcessedAt as processedAt,
        Patient.ID as id
      FROM Clinic_PatientsTelNumbers AS Patient
      WHERE Patient.WhatsAppStatus IS NOT NULL
        AND Patient.Number IS NOT NULL AND Patient.Number != ''
        -- Include all statuses: PENDING, PROCESSING, SENT, FAILED
        AND Patient.WhatsAppStatus IN (0, 1, 2, 3)
      
      ORDER BY processedAt DESC, datePart DESC, timePart DESC
    `)
  }
}

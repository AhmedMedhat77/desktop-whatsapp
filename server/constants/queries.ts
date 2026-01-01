import { IResult, Request } from 'mssql'
import { sql } from '../db'
import { Appointment, CompanyHeader, Patient, WhatsAppStatus } from './Types'

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

  /**
   * ATOMIC QUERY: Claims pending appointment messages for processing.
   * Uses UPDATE ... OUTPUT to atomically claim records, ensuring only one worker
   * can claim each appointment, even under concurrent execution.
   *
   * This query is 100% duplicate-safe because:
   * 1. UPDATE is atomic at the database level
   * 2. WHERE clause ensures only PENDING (0) or stale PROCESSING records are claimed
   * 3. OUTPUT clause returns only the records that were successfully updated
   * 4. Multiple workers can run this simultaneously - only one will succeed per record
   */
  claimAppointmentMessages: async (
    request: Request,
    workerId: string,
    batchSize: number = 10,
    staleTimeoutMinutes: number = 5
  ): Promise<IResult<Appointment>> => {
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
      -- Claim up to @batchSize pending appointment messages atomically
      -- This UPDATE ... OUTPUT ensures only one worker can claim each record
      UPDATE TOP (@batchSize) Appointment
      SET 
        Appointment.WhatsAppStatus = @statusProcessing,
        Appointment.WhatsAppWorkerID = @workerId,
        Appointment.WhatsAppProcessedAt = GETDATE()
      OUTPUT 
        INSERTED.PatientID,
        INSERTED.DoctorID,
        INSERTED.BranchID,
        INSERTED.TheDate,
        INSERTED.TheTime,
        INSERTED.WhatsAppStatus,
        INSERTED.WhatsAppWorkerID,
        INSERTED.WhatsAppProcessedAt,
        INSERTED.WhatsAppRetryCount,
        Doctor.ArbName AS DoctorArbName,
        Doctor.ClinicDepartmentID,
        sp.ArbName AS SpecialtyArbName,
        sp.EngName AS SpecialtyEngName,
        Patient.Number,
        Patient.Name
      FROM Clinic_PatientsAppointments AS Appointment
      INNER JOIN dbo.Clinic_Doctors AS Doctor 
        ON Appointment.DoctorID = Doctor.DoctorID AND Appointment.BranchID = Doctor.BranchID
      INNER JOIN Clinic_DoctorSpecialty AS sp
        ON Doctor.DoctorSpecialtyID = sp.ID
      INNER JOIN Clinic_PatientsTelNumbers AS Patient 
        ON Patient.PatientID = Appointment.PatientID AND Patient.BranchID = Appointment.BranchID
      WHERE Appointment.WhatsAppStatus IN (@statusPending, @statusFailed)
        -- Only retry failed messages if retry count is below max
        AND (Appointment.WhatsAppStatus = @statusPending OR Appointment.WhatsAppRetryCount < @maxRetries)
        -- Also claim stale PROCESSING records (worker crashed)
        OR (Appointment.WhatsAppStatus = @statusProcessing 
            AND Appointment.WhatsAppProcessedAt < @staleTimeout)
    `)
  },

  /**
   * Updates appointment message status after sending attempt.
   * Marks as SENT (2) on success, or FAILED (3) on error.
   */
  updateAppointmentMessageStatus: async (
    request: Request,
    appointment: Appointment,
    status: WhatsAppStatus,
    workerId: string
  ): Promise<number> => {
    request.input('PatientID', sql.Int, appointment.PatientID)
    request.input('DoctorID', sql.Int, appointment.DoctorID)
    request.input('TheDate', sql.Int, appointment.TheDate)
    request.input('TheTime', sql.Int, appointment.TheTime)
    request.input('BranchID', sql.Int, appointment.BranchID)
    request.input('status', sql.Int, status)
    request.input('workerId', sql.VarChar(255), workerId)
    request.input(
      'retryCount',
      sql.Int,
      status === WhatsAppStatus.FAILED
        ? (appointment.WhatsAppRetryCount || 0) + 1
        : appointment.WhatsAppRetryCount || 0
    )

    const result = await request.query(`
      UPDATE Clinic_PatientsAppointments 
      SET 
        WhatsAppStatus = @status,
        WhatsAppRetryCount = @retryCount,
        -- Update legacy field for backward compatibility
        IsWhatsAppSent = CASE WHEN @status = ${WhatsAppStatus.SENT} THEN 1 ELSE IsWhatsAppSent END
      WHERE PatientID = @PatientID 
        AND DoctorID = @DoctorID 
        AND TheDate = @TheDate 
        AND TheTime = @TheTime 
        AND BranchID = @BranchID
        -- Only update if this worker owns the record (prevents race conditions)
        AND WhatsAppWorkerID = @workerId
        AND WhatsAppStatus = ${WhatsAppStatus.PROCESSING}
    `)
    return result.rowsAffected[0] || 0
  },

  /**
   * ATOMIC QUERY: Claims pending appointment reminder messages for processing.
   * Similar to claimAppointmentMessages but for scheduled reminders.
   */
  claimAppointmentReminders: async (
    request: Request,
    workerId: string,
    batchSize: number = 10,
    staleTimeoutMinutes: number = 5
  ): Promise<IResult<Appointment>> => {
    request.input('workerId', sql.VarChar(255), workerId)
    request.input('statusProcessing', sql.Int, WhatsAppStatus.PROCESSING)
    request.input('statusPending', sql.Int, WhatsAppStatus.PENDING)
    request.input('statusFailed', sql.Int, WhatsAppStatus.FAILED)
    request.input('statusSent', sql.Int, WhatsAppStatus.SENT)
    request.input('maxRetries', sql.Int, 3)
    request.input(
      'staleTimeout',
      sql.DateTime,
      new Date(Date.now() - staleTimeoutMinutes * 60 * 1000)
    )
    request.input('batchSize', sql.Int, batchSize)

    return await request.query(`
      -- Claim up to @batchSize pending reminder messages atomically
      UPDATE TOP (@batchSize) Appointment
      SET 
        Appointment.ScheduleWhatsAppStatus = @statusProcessing,
        Appointment.ScheduleWhatsAppWorkerID = @workerId,
        Appointment.ScheduleWhatsAppProcessedAt = GETDATE()
      OUTPUT 
        INSERTED.PatientID,
        INSERTED.DoctorID,
        INSERTED.BranchID,
        INSERTED.TheDate,
        INSERTED.TheTime,
        INSERTED.ScheduleWhatsAppStatus,
        INSERTED.ScheduleWhatsAppWorkerID,
        INSERTED.ScheduleWhatsAppProcessedAt,
        INSERTED.ScheduleWhatsAppRetryCount,
        Doctor.ArbName AS DoctorArbName,
        Doctor.ClinicDepartmentID,
        sp.ArbName AS SpecialtyArbName,
        sp.EngName AS SpecialtyEngName,
        Patient.Number,
        Patient.Name
      FROM Clinic_PatientsAppointments AS Appointment
      INNER JOIN dbo.Clinic_Doctors AS Doctor 
        ON Appointment.DoctorID = Doctor.DoctorID AND Appointment.BranchID = Doctor.BranchID
      INNER JOIN Clinic_DoctorSpecialty AS sp
        ON Doctor.DoctorSpecialtyID = sp.ID
      INNER JOIN Clinic_PatientsTelNumbers AS Patient 
        ON Patient.PatientID = Appointment.PatientID AND Patient.BranchID = Appointment.BranchID
      WHERE Appointment.WhatsAppStatus = @statusSent  -- Initial message must be sent first
        AND Appointment.ScheduleWhatsAppStatus IN (@statusPending, @statusFailed)
        AND (Appointment.ScheduleWhatsAppStatus = @statusPending 
             OR Appointment.ScheduleWhatsAppRetryCount < @maxRetries)
        -- Also claim stale PROCESSING records
        OR (Appointment.ScheduleWhatsAppStatus = @statusProcessing 
            AND Appointment.ScheduleWhatsAppProcessedAt < @staleTimeout)
    `)
  },

  /**
   * Updates appointment reminder status after sending attempt.
   */
  updateAppointmentReminderStatus: async (
    request: Request,
    appointment: Appointment,
    status: WhatsAppStatus,
    workerId: string
  ): Promise<number> => {
    request.input('PatientID', sql.Int, appointment.PatientID)
    request.input('DoctorID', sql.Int, appointment.DoctorID)
    request.input('TheDate', sql.Int, appointment.TheDate)
    request.input('TheTime', sql.Int, appointment.TheTime)
    request.input('BranchID', sql.Int, appointment.BranchID)
    request.input('status', sql.Int, status)
    request.input('workerId', sql.VarChar(255), workerId)
    request.input(
      'retryCount',
      sql.Int,
      status === WhatsAppStatus.FAILED
        ? (appointment.ScheduleWhatsAppRetryCount || 0) + 1
        : appointment.ScheduleWhatsAppRetryCount || 0
    )

    const result = await request.query(`
      UPDATE Clinic_PatientsAppointments 
      SET 
        ScheduleWhatsAppStatus = @status,
        ScheduleWhatsAppRetryCount = @retryCount,
        -- Update legacy field for backward compatibility
        IsScheduleWhatsAppSent = CASE WHEN @status = ${WhatsAppStatus.SENT} THEN 1 ELSE IsScheduleWhatsAppSent END
      WHERE PatientID = @PatientID 
        AND DoctorID = @DoctorID 
        AND TheDate = @TheDate 
        AND TheTime = @TheTime 
        AND BranchID = @BranchID
        AND ScheduleWhatsAppWorkerID = @workerId
        AND ScheduleWhatsAppStatus = ${WhatsAppStatus.PROCESSING}
    `)
    return result.rowsAffected[0] || 0
  },

  /**
   * ATOMIC QUERY: Claims pending patient welcome messages for processing.
   */
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
      WHERE Patient.WhatsAppStatus IN (@statusPending, @statusFailed)
        AND (Patient.WhatsAppStatus = @statusPending OR Patient.WhatsAppRetryCount < @maxRetries)
        -- Also claim stale PROCESSING records
        OR (Patient.WhatsAppStatus = @statusProcessing 
            AND Patient.WhatsAppProcessedAt < @staleTimeout)
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

  // Legacy queries kept for backward compatibility (if needed)
  appointments: async (request: Request): Promise<IResult<Appointment>> => {
    request.input('IsWhatsAppSent', 0)
    return await request.query(
      `SELECT 
        Appointment.IsWhatsAppSent,
        Appointment.DoctorID,
        Appointment.PatientID,
        Appointment.BranchID,
        Appointment.TheTime,
        Appointment.TheDate,
        Doctor.ArbName AS DoctorArbName,
        Doctor.ClinicDepartmentID,
        sp.ArbName AS SpecialtyArbName,
        sp.EngName AS SpecialtyEngName,
        Patient.Number,
        Patient.Name
      FROM Clinic_PatientsAppointments AS Appointment
      INNER JOIN dbo.Clinic_Doctors AS Doctor 
        ON Appointment.DoctorID = Doctor.DoctorID AND Appointment.BranchID = Doctor.BranchID
      INNER JOIN Clinic_DoctorSpecialty AS sp
        ON Doctor.DoctorSpecialtyID = sp.ID
      INNER JOIN Clinic_PatientsTelNumbers AS Patient 
        ON Patient.PatientID = Appointment.PatientID AND Patient.BranchID = Appointment.BranchID
        WHERE Appointment.IsWhatsAppSent = @IsWhatsAppSent
        `
    )
  },

  getScheduleAppointments: async (request: Request): Promise<IResult<Appointment>> => {
    return await request.query(
      `SELECT 
      Appointment.IsWhatsAppSent,
      Appointment.DoctorID,
      Appointment.PatientID,
      Appointment.BranchID,
      Appointment.TheTime,
      Appointment.TheDate,
      Doctor.ArbName AS DoctorArbName,
      Doctor.ClinicDepartmentID,
      sp.ArbName AS SpecialtyArbName,
      sp.EngName AS SpecialtyEngName,
      Patient.Number,
      Patient.Name
    FROM Clinic_PatientsAppointments AS Appointment
    INNER JOIN dbo.Clinic_Doctors AS Doctor 
      ON Appointment.DoctorID = Doctor.DoctorID AND Appointment.BranchID = Doctor.BranchID
    INNER JOIN Clinic_DoctorSpecialty AS sp
      ON Doctor.DoctorSpecialtyID = sp.ID
    INNER JOIN Clinic_PatientsTelNumbers AS Patient 
      ON Patient.PatientID = Appointment.PatientID AND Patient.BranchID = Appointment.BranchID
      WHERE Appointment.IsWhatsAppSent = 1 
        AND Appointment.IsScheduleWhatsAppSent = 0`
    )
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

  /**
   * Get all messages (sent, failed, pending, processing) from the database.
   * Uses new status-based columns for accurate status tracking.
   * Returns messages with status mapping: 0=PENDING, 1=PROCESSING, 2=SENT, 3=FAILED
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
      -- Appointment messages (initial confirmation)
      SELECT 
        'appointment' as messageType,
        CASE 
          WHEN Appointment.WhatsAppStatus = 0 THEN 'pending'
          WHEN Appointment.WhatsAppStatus = 1 THEN 'processing'
          WHEN Appointment.WhatsAppStatus = 2 THEN 'sent'
          WHEN Appointment.WhatsAppStatus = 3 THEN 'failed'
          ELSE 'unknown'
        END as status,
        Appointment.WhatsAppStatus as statusCode,
        Appointment.WhatsAppRetryCount as retryCount,
        Patient.Name as userName,
        Patient.Number as phoneNumber,
        Appointment.TheDate as datePart,
        Appointment.TheTime as timePart,
        Appointment.WhatsAppProcessedAt as processedAt,
        NULL as id
      FROM Clinic_PatientsAppointments AS Appointment
      INNER JOIN Clinic_PatientsTelNumbers AS Patient 
        ON Patient.PatientID = Appointment.PatientID AND Patient.BranchID = Appointment.BranchID
      WHERE Appointment.WhatsAppStatus IS NOT NULL
        -- Include all statuses: PENDING, PROCESSING, SENT, FAILED
        AND Appointment.WhatsAppStatus IN (0, 1, 2, 3)

      UNION ALL

      -- Appointment reminder messages
      SELECT 
        'appointmentReminder' as messageType,
        CASE 
          WHEN Appointment.ScheduleWhatsAppStatus = 0 THEN 'pending'
          WHEN Appointment.ScheduleWhatsAppStatus = 1 THEN 'processing'
          WHEN Appointment.ScheduleWhatsAppStatus = 2 THEN 'sent'
          WHEN Appointment.ScheduleWhatsAppStatus = 3 THEN 'failed'
          ELSE 'unknown'
        END as status,
        Appointment.ScheduleWhatsAppStatus as statusCode,
        Appointment.ScheduleWhatsAppRetryCount as retryCount,
        Patient.Name as userName,
        Patient.Number as phoneNumber,
        Appointment.TheDate as datePart,
        Appointment.TheTime as timePart,
        Appointment.ScheduleWhatsAppProcessedAt as processedAt,
        NULL as id
      FROM Clinic_PatientsAppointments AS Appointment
      INNER JOIN Clinic_PatientsTelNumbers AS Patient 
        ON Patient.PatientID = Appointment.PatientID AND Patient.BranchID = Appointment.BranchID
      WHERE Appointment.ScheduleWhatsAppStatus IS NOT NULL
        -- Include all statuses: PENDING, PROCESSING, SENT, FAILED
        AND Appointment.ScheduleWhatsAppStatus IN (0, 1, 2, 3)

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
        -- Include all statuses: PENDING, PROCESSING, SENT, FAILED
        AND Patient.WhatsAppStatus IN (0, 1, 2, 3)
      
      ORDER BY processedAt DESC, datePart DESC, timePart DESC
    `)
  }
}

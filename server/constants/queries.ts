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
Appointments.DoctorID,
Appointments.TheDate AS AppointmentDate,
Appointments.TheTime AS AppointmentTime,
Doctors.ArbName AS DoctorArbName, 
Doctors.EngName AS DoctorEngName,
p.ArbName AS PatientArbNAme,
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
    request.input('DoctorID', sql.Int, appointment.DoctorID)
    request.input('AppointmentDate', sql.Int, appointment.AppointmentDate)
    request.input('AppointmentTime', sql.Int, appointment.AppointmentTime)
    request.input('DoctorArbName', sql.NVarChar(255), appointment.DoctorArbName)
    request.input('DoctorEngName', sql.NVarChar(255), appointment.DoctorEngName)
    request.input('PatientArbName', sql.NVarChar(255), appointment.PatientArbName)
    request.input('PatientEngName', sql.NVarChar(255), appointment.PatientEngName)
    request.input('SpecialtyArbName', sql.NVarChar(255), appointment.SpecialtyArbName)
    request.input('SpecialtyEngName', sql.NVarChar(255), appointment.SpecialtyEngName)
    request.input('Number', sql.NVarChar(50), appointment.Number)

    return await request.query(`
      -- Only insert if appointment doesn't already exist (duplicate prevention)
      INSERT INTO Appointment_Message_Table (
        DoctorID, AppointmentDate, AppointmentTime,
        DoctorArbName, DoctorEngName,
        PatientArbName, PatientEngName,
        SpecialtyArbName, SpecialtyEngName,
        Number, InitialMessage, ReminderMessage
      )
      SELECT 
        @DoctorID, @AppointmentDate, @AppointmentTime,
        @DoctorArbName, @DoctorEngName,
        @PatientArbName, @PatientEngName,
        @SpecialtyArbName, @SpecialtyEngName,
        @Number, 0, 0
      WHERE NOT EXISTS (
        SELECT 1 FROM Appointment_Message_Table
        WHERE DoctorID = @DoctorID
          AND AppointmentDate = @AppointmentDate
          AND AppointmentTime = @AppointmentTime
          AND Number = @Number
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
      SELECT * FROM Appointment_Message_Table
      WHERE InitialMessage = 0
      ORDER BY AppointmentDate ASC, AppointmentTime ASC
    `)
  },

  /**
   * Get appointments that need reminder message
   * Returns appointments where InitialMessage = 1 AND ReminderMessage = 0
   */
  GetAppointmentsForReminder: async (request: Request): Promise<IResult<AppointmentMessage>> => {
    return await request.query(`
      SELECT * FROM Appointment_Message_Table
      WHERE InitialMessage = 1 AND ReminderMessage = 0
      ORDER BY AppointmentDate ASC, AppointmentTime ASC
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
  }
}

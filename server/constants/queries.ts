import { IResult, Request } from 'mssql'
import { sql } from '../db'
import { Appointment, CompanyHeader, Patient } from './Types'

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

  appointments: async (request: Request): Promise<IResult<Appointment>> => {
    request.input('IsWhatsAppSent', sql.Int, 0)
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

  updateAppointmentIsWhatsAppSent: async (
    request: Request,
    params: Appointment
  ): Promise<number> => {
    request.input('DoctorID', sql.Int, params.DoctorID)
    request.input('TheDate', sql.Int, params.TheDate)
    request.input('TheTime', sql.Int, params.TheTime)
    request.input('BranchID', sql.Int, params.BranchID)
    request.input('IsWhatsAppSent', sql.Int, 1)
    const result = await request.query(
      `UPDATE Clinic_PatientsAppointments SET IsWhatsAppSent = @IsWhatsAppSent WHERE DoctorID = @DoctorID AND TheDate = @TheDate AND TheTime = @TheTime AND BranchID = @BranchID`
    )
    return result.rowsAffected[0] || 0
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
      WHERE Appointment.IsScheduleWhatsAppSent = 0`
    )
  },

  updateAppointmentIsScheduleWhatsAppSent: async (
    request: Request,
    params: Appointment
  ): Promise<number> => {
    request.input('DoctorID', sql.Int, params.DoctorID)
    request.input('TheDate', sql.Int, params.TheDate)
    request.input('TheTime', sql.Int, params.TheTime)
    request.input('BranchID', sql.Int, params.BranchID)
    request.input('IsScheduleWhatsAppSent', sql.Int, 1)
    const result = await request.query(
      `UPDATE Clinic_PatientsAppointments SET IsScheduleWhatsAppSent = @IsScheduleWhatsAppSent WHERE DoctorID = @DoctorID AND TheDate = @TheDate AND TheTime = @TheTime AND BranchID = @BranchID`
    )
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

  updatePatientIsWhatsAppSent: async (request: Request, params: Patient): Promise<number> => {
    request.input('PatientID', sql.Int, params.PatientID)
    request.input('IsWhatsAppSent', sql.Int, 1)
    request.input('BranchID', sql.Int, params.BranchID)
    const result = await request.query(
      `UPDATE Clinic_PatientsTelNumbers SET IsWhatsAppSent = @IsWhatsAppSent WHERE PatientID = @PatientID AND BranchID = @BranchID`
    )
    return result.rowsAffected[0] || 0
  }
}

-- Diagnostic query to check why appointment message wasn't sent
-- Run this after inserting an appointment to see what's missing

-- 1. Check if the appointment exists and its WhatsAppStatus
SELECT 
  Appointment.PatientID,
  Appointment.DoctorID,
  Appointment.BranchID,
  Appointment.TheDate,
  Appointment.TheTime,
  Appointment.WhatsAppStatus,  -- Should be 0 (PENDING) or NULL
  Appointment.WhatsAppWorkerID,
  Appointment.WhatsAppProcessedAt,
  Appointment.WhatsAppRetryCount,
  -- Check if legacy field exists
  CASE WHEN EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('Clinic_PatientsAppointments') 
    AND name = 'IsWhatsAppSent'
  ) THEN Appointment.IsWhatsAppSent ELSE NULL END as IsWhatsAppSent
FROM Clinic_PatientsAppointments AS Appointment
WHERE Appointment.PatientID = 2
  AND Appointment.DoctorID = 5
  AND Appointment.BranchID = 1
  AND Appointment.TheDate = 20260101
  AND Appointment.TheTime = 831

-- 2. Check if patient exists in Clinic_PatientsTelNumbers with phone number
SELECT 
  Patient.PatientID,
  Patient.BranchID,
  Patient.Number,  -- Phone number (REQUIRED)
  Patient.Name,
  Patient.WhatsAppStatus,
  CASE WHEN Patient.Number IS NULL OR Patient.Number = '' THEN 'MISSING PHONE NUMBER' ELSE 'OK' END as PhoneStatus
FROM Clinic_PatientsTelNumbers AS Patient
WHERE Patient.PatientID = 2
  AND Patient.BranchID = 1

-- 3. Check if doctor exists
SELECT 
  Doctor.DoctorID,
  Doctor.BranchID,
  Doctor.ArbName,
  CASE WHEN Doctor.DoctorID IS NULL THEN 'DOCTOR NOT FOUND' ELSE 'OK' END as DoctorStatus
FROM dbo.Clinic_Doctors AS Doctor
WHERE Doctor.DoctorID = 5
  AND Doctor.BranchID = 1

-- 4. Check if the full join works (this is what the query uses)
SELECT 
  Appointment.PatientID,
  Appointment.DoctorID,
  Appointment.BranchID,
  Appointment.TheDate,
  Appointment.TheTime,
  Appointment.WhatsAppStatus,
  Doctor.ArbName AS DoctorArbName,
  Patient.Number,
  Patient.Name,
  CASE 
    WHEN Appointment.WhatsAppStatus IS NULL THEN 'WhatsAppStatus column missing - run migration!'
    WHEN Appointment.WhatsAppStatus NOT IN (0, 3) THEN 'WhatsAppStatus is not PENDING (0) or FAILED (3)'
    WHEN Patient.Number IS NULL OR Patient.Number = '' THEN 'Patient phone number is missing'
    WHEN Doctor.DoctorID IS NULL THEN 'Doctor not found'
    ELSE 'Should be processable - check logs for errors'
  END as Issue
FROM Clinic_PatientsAppointments AS Appointment
LEFT JOIN dbo.Clinic_Doctors AS Doctor 
  ON Appointment.DoctorID = Doctor.DoctorID AND Appointment.BranchID = Doctor.BranchID
LEFT JOIN Clinic_DoctorSpecialty AS sp
  ON Doctor.DoctorSpecialtyID = sp.ID
LEFT JOIN Clinic_PatientsTelNumbers AS Patient 
  ON Patient.PatientID = Appointment.PatientID AND Patient.BranchID = Appointment.BranchID
WHERE Appointment.PatientID = 2
  AND Appointment.DoctorID = 5
  AND Appointment.BranchID = 1
  AND Appointment.TheDate = 20260101
  AND Appointment.TheTime = 831

-- 5. Fix: Set WhatsAppStatus to PENDING (0) if it's NULL
-- Uncomment and run this if WhatsAppStatus is NULL:
/*
UPDATE Clinic_PatientsAppointments
SET WhatsAppStatus = 0  -- PENDING
WHERE PatientID = 2
  AND DoctorID = 5
  AND BranchID = 1
  AND TheDate = 20260101
  AND TheTime = 831
  AND (WhatsAppStatus IS NULL OR WhatsAppStatus NOT IN (0, 2, 3))
*/



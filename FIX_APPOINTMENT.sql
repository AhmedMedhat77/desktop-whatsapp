-- Fix appointment to make it processable
-- Run this after inserting an appointment to set WhatsAppStatus to PENDING (0)

-- First, check if WhatsAppStatus column exists
IF EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('Clinic_PatientsAppointments') 
    AND name = 'WhatsAppStatus'
)
BEGIN
    -- Column exists - set status to PENDING (0)
    UPDATE Clinic_PatientsAppointments
    SET WhatsAppStatus = 0  -- PENDING
    WHERE PatientID = 2
      AND DoctorID = 5
      AND BranchID = 1
      AND TheDate = 20260101
      AND TheTime = 831
      AND (WhatsAppStatus IS NULL OR WhatsAppStatus NOT IN (0, 2, 3))
    
    PRINT 'WhatsAppStatus set to PENDING (0) for appointment'
END
ELSE
BEGIN
    PRINT 'ERROR: WhatsAppStatus column does not exist!'
    PRINT 'Please run the database migration first.'
END

-- Verify the update
SELECT 
  PatientID,
  DoctorID,
  BranchID,
  TheDate,
  TheTime,
  WhatsAppStatus,
  CASE 
    WHEN WhatsAppStatus = 0 THEN 'READY - Will be processed'
    WHEN WhatsAppStatus = 2 THEN 'ALREADY SENT'
    WHEN WhatsAppStatus = 3 THEN 'FAILED - Will retry'
    WHEN WhatsAppStatus IS NULL THEN 'ERROR - Column missing'
    ELSE 'UNKNOWN STATUS'
  END as StatusDescription
FROM Clinic_PatientsAppointments
WHERE PatientID = 2
  AND DoctorID = 5
  AND BranchID = 1
  AND TheDate = 20260101
  AND TheTime = 831



-- Correct way to insert an appointment that will trigger WhatsApp message
-- This includes the WhatsAppStatus column set to 0 (PENDING)

-- First, ensure the WhatsAppStatus column exists (run migration if needed)
-- Then insert with WhatsAppStatus = 0

INSERT INTO Clinic_PatientsAppointments 
  (BranchID, DoctorID, PatientID, TheDate, TheTime, [Status], Transfer, WhatsAppStatus) 
VALUES 
  (1, 5, 2, 20260101, 831, 0, 0, 0)  -- WhatsAppStatus = 0 means PENDING

-- Note: WhatsAppStatus defaults to 0 if the column has DEFAULT 0 constraint
-- But it's safer to explicitly set it to 0

-- After insertion, the appointment module will:
-- 1. Detect it within 30 seconds (runs every 30 seconds)
-- 2. Claim it atomically (set status to PROCESSING)
-- 3. Send WhatsApp message
-- 4. Update status to SENT (2) or FAILED (3)

-- Requirements for message to be sent:
-- 1. PatientID=2 must exist in Clinic_PatientsTelNumbers with BranchID=1
-- 2. Patient must have a phone number (Number column not NULL/empty)
-- 3. DoctorID=5 must exist in Clinic_Doctors with BranchID=1
-- 4. WhatsAppStatus must be 0 (PENDING) or 3 (FAILED with retries < 3)


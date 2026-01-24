-- Debug phone numbers in database
-- Run this query in SQL Server Management Studio to check your data

-- 1. Check all phone numbers for formatting issues
SELECT 
    PatientID,
    Number,
    LEN(Number) as Length,
    CASE 
        WHEN Number LIKE ',%' THEN 'Has leading comma'
        WHEN Number LIKE ' %' THEN 'Has leading space'
        WHEN Number LIKE '%,%' THEN 'Has comma inside'
        WHEN Number NOT LIKE '[0-9]%' THEN 'Starts with non-digit'
        ELSE 'OK'
    END as Issue
FROM Clinic_PatientsTelNumbers
WHERE Number IS NOT NULL AND Number != ''
ORDER BY Issue DESC;

-- 2. Check the specific problematic number
SELECT 
    PatientID,
    BranchID,
    Number,
    Name,
    LEN(Number) as Length,
    ASCII(SUBSTRING(Number, 1, 1)) as FirstCharASCII
FROM Clinic_PatientsTelNumbers
WHERE Number LIKE '%532717413%'
   OR Number LIKE '%,0532717413%';

-- 3. Check appointments with their phone numbers
SELECT TOP 10
    Appointments.PatientID,
    Appointments.DoctorID,
    p.ArbName AS PatientArbName,
    PatientNumber.Number,
    LEN(PatientNumber.Number) as NumberLength,
    CASE 
        WHEN PatientNumber.Number LIKE ',%' THEN 'Has leading comma'
        WHEN PatientNumber.Number LIKE ' %' THEN 'Has leading space'
        ELSE 'OK'
    END as Issue
FROM Clinic_PatientsAppointments AS Appointments
LEFT JOIN Clinic_Patients AS p 
    ON p.PatientID = Appointments.PatientID 
    AND p.BranchID = Appointments.BranchID 
LEFT JOIN Clinic_PatientsTelNumbers as PatientNumber 
    ON p.PatientID = PatientNumber.PatientID
WHERE PatientNumber.Number IS NOT NULL
ORDER BY Appointments.TheDate DESC, Appointments.TheTime DESC;

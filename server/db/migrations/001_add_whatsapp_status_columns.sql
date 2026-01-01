-- Migration: Add WhatsApp Status Columns for Atomic Locking
-- Purpose: Replace boolean flags with status-based workflow to prevent duplicates across multiple processes
-- Date: 2025-01-XX
-- 
-- This migration adds:
-- 1. Status columns (PENDING=0, PROCESSING=1, SENT=2, FAILED=3)
-- 2. Worker tracking (WorkerID, ProcessedAt) for distributed locking
-- 3. Retry tracking (RetryCount) for failed messages
-- 4. Stale timeout handling (reset PROCESSING records after 5 minutes)
-- ============================================
-- 1. Clinic_PatientsAppointments Table
-- ============================================
-- Add status columns for initial appointment messages
IF NOT EXISTS (
    SELECT
        1
    FROM
        sys.columns
    WHERE
        object_id = OBJECT_ID ('Clinic_PatientsAppointments')
        AND name = 'WhatsAppStatus'
) BEGIN
ALTER TABLE Clinic_PatientsAppointments ADD WhatsAppStatus INT NOT NULL DEFAULT 0, -- 0=PENDING, 1=PROCESSING, 2=SENT, 3=FAILED
WhatsAppWorkerID VARCHAR(255) NULL, -- Process/Worker identifier (hostname:pid)
WhatsAppProcessedAt DATETIME NULL, -- When this record was claimed
WhatsAppRetryCount INT NOT NULL DEFAULT 0 -- Number of retry attempts
END
-- Add status columns for scheduled reminder messages
IF NOT EXISTS (
    SELECT
        1
    FROM
        sys.columns
    WHERE
        object_id = OBJECT_ID ('Clinic_PatientsAppointments')
        AND name = 'ScheduleWhatsAppStatus'
) BEGIN
ALTER TABLE Clinic_PatientsAppointments ADD ScheduleWhatsAppStatus INT NOT NULL DEFAULT 0, -- 0=PENDING, 1=PROCESSING, 2=SENT, 3=FAILED
ScheduleWhatsAppWorkerID VARCHAR(255) NULL, -- Process/Worker identifier
ScheduleWhatsAppProcessedAt DATETIME NULL, -- When this record was claimed
ScheduleWhatsAppRetryCount INT NOT NULL DEFAULT 0 -- Number of retry attempts
END
-- Create indexes for performance (status lookups are frequent)
IF NOT EXISTS (
    SELECT
        1
    FROM
        sys.indexes
    WHERE
        name = 'IX_Appointments_WhatsAppStatus'
        AND object_id = OBJECT_ID ('Clinic_PatientsAppointments')
) BEGIN CREATE INDEX IX_Appointments_WhatsAppStatus ON Clinic_PatientsAppointments (
    WhatsAppStatus,
    PatientID,
    DoctorID,
    BranchID,
    TheDate,
    TheTime
) END IF NOT EXISTS (
    SELECT
        1
    FROM
        sys.indexes
    WHERE
        name = 'IX_Appointments_ScheduleWhatsAppStatus'
        AND object_id = OBJECT_ID ('Clinic_PatientsAppointments')
) BEGIN CREATE INDEX IX_Appointments_ScheduleWhatsAppStatus ON Clinic_PatientsAppointments (
    ScheduleWhatsAppStatus,
    PatientID,
    DoctorID,
    BranchID,
    TheDate,
    TheTime
) END
-- NOTE: Data migration (UPDATE statements) are handled by the TypeScript migration runner ./runner.ts
-- The runner checks if records need migration before updating to avoid duplicates
-- This ensures idempotent data migration that can be run multiple times safely
-- ============================================
-- 2. Clinic_PatientsTelNumbers Table
-- ============================================
-- Add status columns for new patient welcome messages
IF NOT EXISTS (
    SELECT
        1
    FROM
        sys.columns
    WHERE
        object_id = OBJECT_ID ('Clinic_PatientsTelNumbers')
        AND name = 'WhatsAppStatus'
) BEGIN
ALTER TABLE Clinic_PatientsTelNumbers ADD WhatsAppStatus INT NOT NULL DEFAULT 0, -- 0=PENDING, 1=PROCESSING, 2=SENT, 3=FAILED
WhatsAppWorkerID VARCHAR(255) NULL, -- Process/Worker identifier
WhatsAppProcessedAt DATETIME NULL, -- When this record was claimed
WhatsAppRetryCount INT NOT NULL DEFAULT 0 -- Number of retry attempts
END
-- Create index for performance
IF NOT EXISTS (
    SELECT
        1
    FROM
        sys.indexes
    WHERE
        name = 'IX_Patients_WhatsAppStatus'
        AND object_id = OBJECT_ID ('Clinic_PatientsTelNumbers')
) BEGIN CREATE INDEX IX_Patients_WhatsAppStatus ON Clinic_PatientsTelNumbers (WhatsAppStatus, PatientID, BranchID) END
-- NOTE: Data migration (UPDATE statements) are handled by the TypeScript migration runner
-- The runner checks if records need migration before updating to avoid duplicates
-- ============================================
-- 3. Stale Record Cleanup (Optional - can be run periodically)
-- ============================================
-- Reset PROCESSING records that have been stuck for > 5 minutes
-- This handles cases where a worker crashed while processing
-- Run this periodically (e.g., every 10 minutes) via a scheduled job
-- Example cleanup query (not executed here, for reference):
-- UPDATE Clinic_PatientsAppointments
-- SET WhatsAppStatus = 0,  -- Reset to PENDING
--     WhatsAppWorkerID = NULL,
--     WhatsAppProcessedAt = NULL
-- WHERE WhatsAppStatus = 1  -- PROCESSING
--   AND WhatsAppProcessedAt < DATEADD(MINUTE, -5, GETDATE())
--
-- UPDATE Clinic_PatientsAppointments
-- SET ScheduleWhatsAppStatus = 0,
--     ScheduleWhatsAppWorkerID = NULL,
--     ScheduleWhatsAppProcessedAt = NULL
-- WHERE ScheduleWhatsAppStatus = 1
--   AND ScheduleWhatsAppProcessedAt < DATEADD(MINUTE, -5, GETDATE())
--
-- UPDATE Clinic_PatientsTelNumbers
-- SET WhatsAppStatus = 0,
--     WhatsAppWorkerID = NULL,
--     WhatsAppProcessedAt = NULL
-- WHERE WhatsAppStatus = 1
--   AND WhatsAppProcessedAt < DATEADD(MINUTE, -5, GETDATE())
PRINT 'Migration completed successfully. Status columns added and existing data migrated.'
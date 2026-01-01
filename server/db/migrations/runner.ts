import { getConnection, isDatabaseConnected } from '../connection'

/**
 * Migration SQL embedded directly to avoid path resolution issues in Electron.
 * This ensures the migration is always available in both development and production.
 *
 * The SQL uses IF NOT EXISTS checks, making it idempotent (safe to run multiple times).
 */
const MIGRATION_SQL = `
-- Migration: Add WhatsApp Status Columns for Atomic Locking
-- Purpose: Replace boolean flags with status-based workflow to prevent duplicates across multiple processes

-- ============================================
-- 1. Clinic_PatientsAppointments Table
-- ============================================

-- Add status columns for initial appointment messages
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('Clinic_PatientsAppointments') 
    AND name = 'WhatsAppStatus'
)
BEGIN
    ALTER TABLE Clinic_PatientsAppointments
    ADD WhatsAppStatus INT NOT NULL DEFAULT 0,
        WhatsAppWorkerID VARCHAR(255) NULL,
        WhatsAppProcessedAt DATETIME NULL,
        WhatsAppRetryCount INT NOT NULL DEFAULT 0
END

-- Add status columns for scheduled reminder messages
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('Clinic_PatientsAppointments') 
    AND name = 'ScheduleWhatsAppStatus'
)
BEGIN
    ALTER TABLE Clinic_PatientsAppointments
    ADD ScheduleWhatsAppStatus INT NOT NULL DEFAULT 0,
        ScheduleWhatsAppWorkerID VARCHAR(255) NULL,
        ScheduleWhatsAppProcessedAt DATETIME NULL,
        ScheduleWhatsAppRetryCount INT NOT NULL DEFAULT 0
END

-- Create indexes for performance (status lookups are frequent)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_Appointments_WhatsAppStatus' 
    AND object_id = OBJECT_ID('Clinic_PatientsAppointments')
)
BEGIN
    CREATE INDEX IX_Appointments_WhatsAppStatus 
    ON Clinic_PatientsAppointments(WhatsAppStatus, PatientID, DoctorID, BranchID, TheDate, TheTime)
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_Appointments_ScheduleWhatsAppStatus' 
    AND object_id = OBJECT_ID('Clinic_PatientsAppointments')
)
BEGIN
    CREATE INDEX IX_Appointments_ScheduleWhatsAppStatus 
    ON Clinic_PatientsAppointments(ScheduleWhatsAppStatus, PatientID, DoctorID, BranchID, TheDate, TheTime)
END

-- ============================================
-- 2. Clinic_PatientsTelNumbers Table
-- ============================================

-- Add status columns for new patient welcome messages
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('Clinic_PatientsTelNumbers') 
    AND name = 'WhatsAppStatus'
)
BEGIN
    ALTER TABLE Clinic_PatientsTelNumbers
    ADD WhatsAppStatus INT NOT NULL DEFAULT 0,
        WhatsAppWorkerID VARCHAR(255) NULL,
        WhatsAppProcessedAt DATETIME NULL,
        WhatsAppRetryCount INT NOT NULL DEFAULT 0
END

-- Create index for performance
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_Patients_WhatsAppStatus' 
    AND object_id = OBJECT_ID('Clinic_PatientsTelNumbers')
)
BEGIN
    CREATE INDEX IX_Patients_WhatsAppStatus 
    ON Clinic_PatientsTelNumbers(WhatsAppStatus, PatientID, BranchID)
END
`

/**
 * Run database migrations automatically on server start.
 * Checks if columns exist before adding them (idempotent).
 */
export async function runMigrations(): Promise<{ success: boolean; message: string }> {
  try {
    // Check if database is connected
    if (!isDatabaseConnected()) {
      console.log('⏭️  Skipping migrations: Database not connected yet')
      return {
        success: false,
        message: 'Database not connected'
      }
    }

    // Get database connection
    let pool
    try {
      pool = await getConnection()
    } catch (error) {
      console.error('❌ Failed to get database connection for migrations:', error)
      return {
        success: false,
        message: `Database connection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }

    console.log('🔄 Running database migrations...')

    // Use embedded SQL migration (avoids path resolution issues in Electron)
    const migrationSQL = MIGRATION_SQL

    const request = pool.request()

    try {
      // Check migration status first
      const status = await checkMigrationStatus()

      if (!status.needsMigration) {
        console.log('✅ Database migrations already applied (columns exist)')
        // Run data migration check only if needed (idempotent - only updates records that need updating)
        // This ensures data stays in sync if legacy fields are updated
        try {
          // Only run data migration if all columns exist
          if (
            status.columnsExist.appointments &&
            status.columnsExist.reminders &&
            status.columnsExist.patients
          ) {
            // Check if any records need migration before running UPDATE
            const checkAppointments = await request.query(`
              SELECT COUNT(*) as count
              FROM Clinic_PatientsAppointments
              WHERE IsWhatsAppSent = 1 AND WhatsAppStatus = 0
            `)
            const checkReminders = await request.query(`
              SELECT COUNT(*) as count
              FROM Clinic_PatientsAppointments
              WHERE IsScheduleWhatsAppSent = 1 AND ScheduleWhatsAppStatus = 0
            `)
            const checkPatients = await request.query(`
              SELECT COUNT(*) as count
              FROM Clinic_PatientsTelNumbers
              WHERE IsWhatsAppSent = 1 AND WhatsAppStatus = 0
            `)

            const needsAppointmentMigration = checkAppointments.recordset[0]?.count > 0
            const needsReminderMigration = checkReminders.recordset[0]?.count > 0
            const needsPatientMigration = checkPatients.recordset[0]?.count > 0

            if (needsAppointmentMigration || needsReminderMigration || needsPatientMigration) {
              if (needsAppointmentMigration) {
                await request.query(`
                  UPDATE Clinic_PatientsAppointments
                  SET WhatsAppStatus = 2
                  WHERE IsWhatsAppSent = 1 AND WhatsAppStatus = 0
                `)
                console.log(
                  `✅ Migrated ${checkAppointments.recordset[0]?.count} appointment records`
                )
              }

              if (needsReminderMigration) {
                await request.query(`
                  UPDATE Clinic_PatientsAppointments
                  SET ScheduleWhatsAppStatus = 2
                  WHERE IsScheduleWhatsAppSent = 1 AND ScheduleWhatsAppStatus = 0
                `)
                console.log(`✅ Migrated ${checkReminders.recordset[0]?.count} reminder records`)
              }

              if (needsPatientMigration) {
                await request.query(`
                  UPDATE Clinic_PatientsTelNumbers
                  SET WhatsAppStatus = 2
                  WHERE IsWhatsAppSent = 1 AND WhatsAppStatus = 0
                `)
                console.log(`✅ Migrated ${checkPatients.recordset[0]?.count} patient records`)
              }
            } else {
              console.log('✅ Data migration check: All records already migrated')
            }
          }
        } catch (dataError) {
          // Ignore data migration errors (may already be migrated)
          console.warn('⚠️  Data migration warning:', dataError)
        }
        return {
          success: true,
          message: 'Migrations already applied'
        }
      }

      console.log('📋 Migration needed. Applying database schema changes...')
      console.log(`   - Appointments: ${status.columnsExist.appointments ? '✓' : '✗'}`)
      console.log(`   - Reminders: ${status.columnsExist.reminders ? '✓' : '✗'}`)
      console.log(`   - Patients: ${status.columnsExist.patients ? '✓' : '✗'}`)

      // Split SQL by GO statements (SQL Server batch separator)
      // If no GO statements, treat entire SQL as one batch
      // mssql library doesn't support GO, so we execute each batch separately
      let batches: string[] = []
      if (migrationSQL.includes('GO')) {
        batches = migrationSQL
          .split(/^\s*GO\s*$/gim)
          .map((b) => b.trim())
          .filter((b) => b.length > 0)
      } else {
        // No GO statements, treat as single batch
        batches = [migrationSQL.trim()]
      }

      // Filter out pure comment blocks (blocks that only contain comments)
      batches = batches.filter((batch) => {
        const withoutComments = batch
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('--'))
        return withoutComments.length > 0 // Keep if has non-comment content
      })

      let executedCount = 0
      let errorCount = 0

      for (const batch of batches) {
        if (batch.trim().length === 0) continue

        try {
          // Skip pure PRINT statements (but allow SQL with PRINT)
          if (
            batch.trim().match(/^PRINT\s+/i) &&
            !batch.includes('ALTER') &&
            !batch.includes('CREATE')
          ) {
            continue
          }

          await request.query(batch)
          executedCount++
        } catch (error) {
          // Some errors are expected (e.g., if column already exists)
          const errorMsg = error instanceof Error ? error.message : String(error)

          // Ignore errors about existing objects (columns, indexes)
          if (
            errorMsg.includes('already exists') ||
            errorMsg.includes('duplicate') ||
            errorMsg.includes('There is already an object') ||
            errorMsg.includes('Cannot create index') ||
            errorMsg.includes('already an index')
          ) {
            // This is expected - column/index already exists
            console.log(
              `ℹ️  Skipping (already exists): ${batch.substring(0, 60).replace(/\n/g, ' ')}...`
            )
            continue
          }

          // Log unexpected errors but continue
          console.warn(`⚠️  Migration batch warning: ${errorMsg.substring(0, 150)}`)
          errorCount++
        }
      }

      // Run data migration updates only if columns were successfully created
      // Check if records need migration before running UPDATE (avoid unnecessary updates)
      try {
        // Re-check status after schema migration
        const postMigrationStatus = await checkMigrationStatus()

        let migratedCount = 0

        if (postMigrationStatus.columnsExist.appointments) {
          // Check if any records need migration
          const checkResult = await request.query(`
            SELECT COUNT(*) as count
            FROM Clinic_PatientsAppointments
            WHERE IsWhatsAppSent = 1 AND WhatsAppStatus = 0
          `)
          const needsMigration = checkResult.recordset[0]?.count > 0

          if (needsMigration) {
            const updateResult = await request.query(`
              UPDATE Clinic_PatientsAppointments
              SET WhatsAppStatus = 2
              WHERE IsWhatsAppSent = 1 AND WhatsAppStatus = 0
            `)
            const rowsAffected = updateResult.rowsAffected[0] || 0
            if (rowsAffected > 0) {
              console.log(`✅ Migrated ${rowsAffected} appointment record(s)`)
              migratedCount += rowsAffected
            }
          }
        }

        if (postMigrationStatus.columnsExist.reminders) {
          // Check if any records need migration
          const checkResult = await request.query(`
            SELECT COUNT(*) as count
            FROM Clinic_PatientsAppointments
            WHERE IsScheduleWhatsAppSent = 1 AND ScheduleWhatsAppStatus = 0
          `)
          const needsMigration = checkResult.recordset[0]?.count > 0

          if (needsMigration) {
            const updateResult = await request.query(`
              UPDATE Clinic_PatientsAppointments
              SET ScheduleWhatsAppStatus = 2
              WHERE IsScheduleWhatsAppSent = 1 AND ScheduleWhatsAppStatus = 0
            `)
            const rowsAffected = updateResult.rowsAffected[0] || 0
            if (rowsAffected > 0) {
              console.log(`✅ Migrated ${rowsAffected} reminder record(s)`)
              migratedCount += rowsAffected
            }
          }
        }

        if (postMigrationStatus.columnsExist.patients) {
          // Check if any records need migration
          const checkResult = await request.query(`
            SELECT COUNT(*) as count
            FROM Clinic_PatientsTelNumbers
            WHERE IsWhatsAppSent = 1 AND WhatsAppStatus = 0
          `)
          const needsMigration = checkResult.recordset[0]?.count > 0

          if (needsMigration) {
            const updateResult = await request.query(`
              UPDATE Clinic_PatientsTelNumbers
              SET WhatsAppStatus = 2
              WHERE IsWhatsAppSent = 1 AND WhatsAppStatus = 0
            `)
            const rowsAffected = updateResult.rowsAffected[0] || 0
            if (rowsAffected > 0) {
              console.log(`✅ Migrated ${rowsAffected} patient record(s)`)
              migratedCount += rowsAffected
            }
          }
        }

        if (migratedCount > 0) {
          console.log(`✅ Data migration completed (${migratedCount} total records migrated)`)
        } else {
          console.log('✅ Data migration: No records needed migration')
        }
      } catch (dataError) {
        console.warn('⚠️  Data migration warning (may already be migrated):', dataError)
      }

      if (errorCount === 0) {
        console.log(
          `✅ Database migrations completed successfully (${executedCount} statements executed)`
        )
        return {
          success: true,
          message: `Migrations completed (${executedCount} statements)`
        }
      } else {
        console.log(
          `⚠️  Database migrations completed with ${errorCount} warnings (${executedCount} statements executed)`
        )
        return {
          success: true,
          message: `Migrations completed with warnings (${executedCount} statements, ${errorCount} warnings)`
        }
      }
    } catch (error) {
      console.error('❌ Migration execution error:', error)
      return {
        success: false,
        message: `Migration execution error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  } catch (error) {
    console.error('❌ Migration runner error:', error)
    return {
      success: false,
      message: `Migration runner error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Check if migration columns already exist (quick check)
 */
export async function checkMigrationStatus(): Promise<{
  needsMigration: boolean
  columnsExist: {
    appointments: boolean
    reminders: boolean
    patients: boolean
  }
}> {
  try {
    if (!isDatabaseConnected()) {
      return {
        needsMigration: true,
        columnsExist: {
          appointments: false,
          reminders: false,
          patients: false
        }
      }
    }

    const pool = await getConnection()
    const request = pool.request()

    // Check if columns exist
    const checkSQL = `
      SELECT 
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.columns 
          WHERE object_id = OBJECT_ID('Clinic_PatientsAppointments') 
          AND name = 'WhatsAppStatus'
        ) THEN 1 ELSE 0 END as hasAppointmentStatus,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.columns 
          WHERE object_id = OBJECT_ID('Clinic_PatientsAppointments') 
          AND name = 'ScheduleWhatsAppStatus'
        ) THEN 1 ELSE 0 END as hasReminderStatus,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.columns 
          WHERE object_id = OBJECT_ID('Clinic_PatientsTelNumbers') 
          AND name = 'WhatsAppStatus'
        ) THEN 1 ELSE 0 END as hasPatientStatus
    `

    const result = await request.query(checkSQL)
    const row = result.recordset[0]

    const columnsExist = {
      appointments: row?.hasAppointmentStatus === 1,
      reminders: row?.hasReminderStatus === 1,
      patients: row?.hasPatientStatus === 1
    }

    const needsMigration =
      !columnsExist.appointments || !columnsExist.reminders || !columnsExist.patients

    return {
      needsMigration,
      columnsExist
    }
  } catch (error) {
    console.error('Error checking migration status:', error)
    // If we can't check, assume migration is needed
    return {
      needsMigration: true,
      columnsExist: {
        appointments: false,
        reminders: false,
        patients: false
      }
    }
  }
}

# Database Migrations

## Migration: Add WhatsApp Status Columns for Atomic Locking

**File**: `001_add_whatsapp_status_columns.sql`

### Purpose

This migration refactors the WhatsApp messaging system from boolean flags to a status-based workflow with atomic database-level locking. This ensures 100% duplicate prevention even under concurrent execution (PM2, Docker, multiple instances).

### What It Does

1. **Adds Status Columns**:
   - `WhatsAppStatus` / `ScheduleWhatsAppStatus`: Status enum (0=PENDING, 1=PROCESSING, 2=SENT, 3=FAILED)
   - `WhatsAppWorkerID` / `ScheduleWhatsAppWorkerID`: Process identifier (hostname:pid)
   - `WhatsAppProcessedAt` / `ScheduleWhatsAppProcessedAt`: Timestamp when record was claimed
   - `WhatsAppRetryCount` / `ScheduleWhatsAppRetryCount`: Number of retry attempts

2. **Creates Indexes**: For performance on status lookups

3. **Migrates Existing Data**: Converts existing `IsWhatsAppSent = 1` records to `WhatsAppStatus = 2` (SENT)

### How to Run

#### Option 1: SQL Server Management Studio (SSMS)

1. Open SSMS and connect to your database
2. Open the migration file: `server/db/migrations/001_add_whatsapp_status_columns.sql`
3. Execute the script (F5)

#### Option 2: Command Line (sqlcmd)

```bash
sqlcmd -S your_server -d your_database -U your_username -P your_password -i server/db/migrations/001_add_whatsapp_status_columns.sql
```

#### Option 3: Node.js Script (if you have one)

```typescript
import { getConnection } from '../db'
import fs from 'fs'
import path from 'path'

async function runMigration() {
  const pool = await getConnection()
  const migrationSQL = fs.readFileSync(
    path.join(__dirname, 'migrations/001_add_whatsapp_status_columns.sql'),
    'utf8'
  )
  await pool.request().query(migrationSQL)
  console.log('Migration completed successfully')
}
```

### Verification

After running the migration, verify the columns were added:

```sql
-- Check appointment table
SELECT TOP 1 
  WhatsAppStatus, 
  WhatsAppWorkerID, 
  WhatsAppProcessedAt, 
  WhatsAppRetryCount,
  ScheduleWhatsAppStatus,
  ScheduleWhatsAppWorkerID,
  ScheduleWhatsAppProcessedAt,
  ScheduleWhatsAppRetryCount
FROM Clinic_PatientsAppointments

-- Check patient table
SELECT TOP 1 
  WhatsAppStatus, 
  WhatsAppWorkerID, 
  WhatsAppProcessedAt, 
  WhatsAppRetryCount
FROM Clinic_PatientsTelNumbers
```

### Rollback (if needed)

If you need to rollback, you can drop the new columns:

```sql
-- WARNING: This will lose status tracking data
ALTER TABLE Clinic_PatientsAppointments
DROP COLUMN 
  WhatsAppStatus,
  WhatsAppWorkerID,
  WhatsAppProcessedAt,
  WhatsAppRetryCount,
  ScheduleWhatsAppStatus,
  ScheduleWhatsAppWorkerID,
  ScheduleWhatsAppProcessedAt,
  ScheduleWhatsAppRetryCount

ALTER TABLE Clinic_PatientsTelNumbers
DROP COLUMN 
  WhatsAppStatus,
  WhatsAppWorkerID,
  WhatsAppProcessedAt,
  WhatsAppRetryCount

-- Drop indexes
DROP INDEX IF EXISTS IX_Appointments_WhatsAppStatus ON Clinic_PatientsAppointments
DROP INDEX IF EXISTS IX_Appointments_ScheduleWhatsAppStatus ON Clinic_PatientsAppointments
DROP INDEX IF EXISTS IX_Patients_WhatsAppStatus ON Clinic_PatientsTelNumbers
```

### Status Values

- **0 (PENDING)**: Initial state, ready to be processed
- **1 (PROCESSING)**: Claimed by a worker, currently being processed
- **2 (SENT)**: Successfully sent
- **3 (FAILED)**: Failed to send (can be retried, up to max retries)

### Notes

- The migration is **idempotent** - it checks if columns exist before adding them
- Existing data is automatically migrated (IsWhatsAppSent = 1 → WhatsAppStatus = 2)
- Legacy boolean fields (`IsWhatsAppSent`, `IsScheduleWhatsAppSent`) are kept for backward compatibility
- The system automatically handles stale PROCESSING records (reset after 5 minutes)



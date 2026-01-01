import cors from 'cors'
import { config } from 'dotenv'
import express from 'express'
import { Server } from 'http'
// Import stale record cleanup scheduler
import { scheduleStaleRecordCleanup } from './cleanupStaleRecords'
// Import database migration runner
import { runMigrations } from '../db/migrations/runner'
config()

// Lazy load modules to avoid path resolution issues in compiled output
// Modules will be imported after migration completes
async function initializeModules(): Promise<void> {
  try {
    // Dynamic imports to ensure paths resolve correctly in compiled output
    await import('../modules/appointment/appointment.module')
    await import('../modules/appointment/appointmentSchedule.module')
    await import('../modules/patient/patient.module')
    console.log('✅ All modules initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing modules:', error)
    // Don't fail server startup if modules fail to load
  }
}

const PORT = process.env.PORT || 3000

export const startServer = async (server: Server | null): Promise<Server> => {
  const app = express()

  if (server) {
    console.log('Server already running')
    return server
  }
  // connect to database
  // await connectToDB()
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    })
  )
  app.use(express.json())

  const s = app.listen(PORT, async () => {
    console.log(`Admin server is running on port ${PORT}`)
    
    // CRITICAL: Run database migrations FIRST before initializing modules
    // Modules use the new columns, so migration must complete first
    try {
      const migrationResult = await runMigrations()
      if (migrationResult.success) {
        console.log('✅ Migration completed, initializing modules...')
      } else {
        console.warn('⚠️  Migration did not complete, but continuing...')
      }
    } catch (migrationError) {
      console.error('⚠️  Migration error (non-fatal):', migrationError)
      // Don't fail server startup if migrations fail - they'll be retried on next start
    }
    
    // Initialize modules AFTER migration completes
    // This ensures new columns exist before modules try to use them
    // Using dynamic imports to avoid path resolution issues in compiled output
    await initializeModules()
    
    // Schedule periodic cleanup of stale processing records
    scheduleStaleRecordCleanup()
  })

  return s
}

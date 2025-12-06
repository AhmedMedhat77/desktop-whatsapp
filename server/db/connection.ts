import sql from 'mssql'
import { getDbConfigFile } from './utils'

export { sql }

// Global connection pool manager
let dbPool: sql.ConnectionPool | null = null

export const connectToDB = async (): Promise<boolean> => {
  try {
    // If already connected, test the existing connection
    if (dbPool) {
      try {
        const result = await dbPool.request().query('SELECT 1 as test')
        if (result && result.recordset) {
          console.log('Database connection verified (existing pool)')
          return true
        }
      } catch (error) {
        // Connection is dead, close it and create a new one
        console.log('Existing connection is dead, creating new connection...')
        console.error('Error connecting to database:', error)
        try {
          await dbPool.close()
        } catch {
          // Ignore close errors
        }
        dbPool = null
      }
    }

    // Create new connection if needed
    if (!dbPool) {
      const connectionConfig = await getDbConfigFile()

      const mssqlConfig: sql.config = {
        user: connectionConfig.user,
        password: connectionConfig.password,
        server: connectionConfig.server,
        database: connectionConfig.database,
        options: {
          encrypt: true,
          trustServerCertificate: true
        },
        connectionTimeout: 5000,
        requestTimeout: 5000
      }

      dbPool = await sql.connect(mssqlConfig)

      // Test the connection with a simple query
      const result = await dbPool.request().query('SELECT 1 as test')

      if (result && result.recordset) {
        console.log('Database connection successful')
        return true
      }

      return false
    }

    return true
  } catch (error) {
    console.error('Error connecting to database:', error)
    // Clean up on error
    if (dbPool) {
      try {
        await dbPool.close()
      } catch {
        // Ignore close errors
      }
      dbPool = null
    }
    return false
  }
}

export const isDatabaseConnected = (): boolean => {
  return dbPool !== null
}

export const getConnection = async (): Promise<sql.ConnectionPool> => {
  // Return existing pool if available and connected
  if (dbPool) {
    try {
      // Test if connection is still alive
      await dbPool.request().query('SELECT 1')
      return dbPool
    } catch (error) {
      console.error('Error getting database connection:', error)
      // Connection is dead, create new one
      console.log('Existing connection is dead, creating new connection...')
      try {
        await dbPool.close()
      } catch {
        // Ignore close errors
      }
      dbPool = null
    }
  }

  // Create new connection
  const connectionConfig = await getDbConfigFile()

  const mssqlConfig: sql.config = {
    user: connectionConfig.user,
    password: connectionConfig.password,
    server: connectionConfig.server,
    database: connectionConfig.database,
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  }

  dbPool = await sql.connect(mssqlConfig)
  return dbPool
}

export const closeConnection = async (): Promise<void> => {
  if (dbPool) {
    try {
      await dbPool.close()
      console.log('Database connection closed')
    } catch (error) {
      console.error('Error closing database connection:', error)
    } finally {
      dbPool = null
    }
  }
}

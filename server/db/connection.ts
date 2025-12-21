import sql from 'mssql'
import { getDbConfigFile } from './utils'

export { sql }

// Global connection pool manager
let dbPool: sql.ConnectionPool | null = null

export interface ConnectionResult {
  success: boolean
  error?: string
}

export const connectToDB = async (): Promise<ConnectionResult> => {
  try {
    // If already connected, test the existing connection
    if (dbPool) {
      try {
        const result = await dbPool.request().query('SELECT 1 as test')
        if (result && result.recordset) {
          console.log('Database connection verified (existing pool)')
          return { success: true }
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
      let connectionConfig
      try {
        connectionConfig = await getDbConfigFile()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Error reading database config:', errorMessage)
        return {
          success: false,
          error: `Configuration error: ${errorMessage}. Please configure the database connection first.`
        }
      }

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

      try {
        dbPool = await sql.connect(mssqlConfig)

        // Test the connection with a simple query
        const result = await dbPool.request().query('SELECT 1 as test')

        if (result && result.recordset) {
          console.log('Database connection successful')
          return { success: true }
        }

        return {
          success: false,
          error: 'Connection test failed: No data returned from test query'
        }
      } catch (connectError) {
        // Clean up on connection error
        if (dbPool) {
          try {
            await dbPool.close()
          } catch {
            // Ignore close errors
          }
          dbPool = null
        }

        // Extract user-friendly error message
        let errorMessage = 'Unknown error'
        if (connectError instanceof Error) {
          errorMessage = connectError.message
          // Provide more user-friendly messages for common errors
          if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('timeout')) {
            errorMessage = `Cannot connect to server "${connectionConfig.server}". Please check if the server is running and accessible.`
          } else if (errorMessage.includes('Login failed')) {
            errorMessage = 'Authentication failed. Please check your username and password.'
          } else if (errorMessage.includes('Cannot open database')) {
            errorMessage = `Database "${connectionConfig.database}" not found or access denied.`
          } else if (errorMessage.includes('ENOTFOUND')) {
            errorMessage = `Server "${connectionConfig.server}" not found. Please check the server address.`
          }
        }

        console.error('Error connecting to database:', connectError)
        return {
          success: false,
          error: errorMessage
        }
      }
    }

    return { success: true }
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

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return {
      success: false,
      error: errorMessage
    }
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

import sql from 'mssql'
import { getDbConfigFile } from './utils'

export { sql }

// Global connection pool manager
let dbPool: sql.ConnectionPool | null = null

// Platform detection
const isWindows = process.platform === 'win32'

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

      // Check if connecting to localhost - may need different SSL handling
      const isLocalhost =
        connectionConfig.server === 'localhost' ||
        connectionConfig.server === '127.0.0.1' ||
        connectionConfig.server.startsWith('localhost:') ||
        connectionConfig.server.startsWith('127.0.0.1:')

      // On Windows, handle SSL/TLS certificate issues
      // Windows may have stricter certificate validation than macOS
      const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED
      // Only modify if not already set (allows environment override)
      // This helps with self-signed certificates or Windows certificate store issues
      const shouldDisableTLSValidation = isWindows && !process.env.NODE_TLS_REJECT_UNAUTHORIZED
      if (shouldDisableTLSValidation) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        console.log(
          '⚠️  Windows detected: Temporarily disabling strict TLS validation for database connection'
        )
      }

      // For localhost, we'll try with encryption first, then fallback to no encryption if TLS fails
      const shouldTryWithoutEncryption = isLocalhost

      const mssqlConfig: sql.config = {
        user: connectionConfig.user,
        password: connectionConfig.password,
        server: connectionConfig.server,
        database: connectionConfig.database,
        options: {
          // Try with encryption first (will fallback for localhost if needed)
          encrypt: true,
          trustServerCertificate: true,
          // Additional options for better compatibility
          enableArithAbort: true,
          abortTransactionOnError: false,
          // Windows-specific: ensure proper certificate handling
          ...(isWindows
            ? {
                useUTC: true
              }
            : {})
        },
        connectionTimeout: 15000, // Increased timeout for Windows
        requestTimeout: 30000, // Increased timeout for Windows
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000
        }
      }

      try {
        dbPool = await sql.connect(mssqlConfig)

        // Test the connection with a simple query
        const result = await dbPool.request().query('SELECT 1 as test')

        if (result && result.recordset) {
          console.log('Database connection successful')
          // Restore original TLS setting after successful connection
          if (shouldDisableTLSValidation) {
            if (originalRejectUnauthorized !== undefined) {
              process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
            } else {
              delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
            }
          }
          return { success: true }
        }

        // Restore original TLS setting on failure
        if (shouldDisableTLSValidation) {
          if (originalRejectUnauthorized !== undefined) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
          } else {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
          }
        }

        return {
          success: false,
          error: 'Connection test failed: No data returned from test query'
        }
      } catch (connectError) {
        // If encryption failed and we're on localhost, try without encryption
        if (
          shouldTryWithoutEncryption &&
          mssqlConfig.options?.encrypt &&
          (connectError instanceof Error
            ? connectError.message.includes('UNSUPPORTED_PROTOCOL') ||
              connectError.message.includes('SSL') ||
              connectError.message.includes('TLS') ||
              connectError.message.includes('certificate')
            : false)
        ) {
          console.log('⚠️  TLS/SSL connection failed, retrying without encryption for localhost...')
          try {
            // Clean up failed connection
            if (dbPool) {
              try {
                await dbPool.close()
              } catch {
                // Ignore close errors
              }
              dbPool = null
            }

            // Retry without encryption
            const retryConfig: sql.config = {
              ...mssqlConfig,
              options: {
                ...mssqlConfig.options,
                encrypt: false
              }
            }

            dbPool = await sql.connect(retryConfig)
            const result = await dbPool.request().query('SELECT 1 as test')

            if (result && result.recordset) {
              console.log('Database connection successful (without encryption)')
              // Restore original TLS setting
              if (shouldDisableTLSValidation) {
                if (originalRejectUnauthorized !== undefined) {
                  process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
                } else {
                  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
                }
              }
              return { success: true }
            }
          } catch (retryError) {
            // If retry also fails, fall through to original error handling
            console.error('Retry without encryption also failed:', retryError)
          }
        }
        // Restore original TLS setting on error
        if (shouldDisableTLSValidation) {
          if (originalRejectUnauthorized !== undefined) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
          } else {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
          }
        }
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
          } else if (
            errorMessage.includes('certificate') ||
            errorMessage.includes('SSL') ||
            errorMessage.includes('TLS') ||
            errorMessage.includes('handshake')
          ) {
            errorMessage = `SSL/TLS certificate error: ${errorMessage}. This may be a certificate validation issue. Please check your server's SSL certificate configuration.`
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

  // Check if connecting to localhost - may need different SSL handling
  const isLocalhost =
    connectionConfig.server === 'localhost' ||
    connectionConfig.server === '127.0.0.1' ||
    connectionConfig.server.startsWith('localhost:') ||
    connectionConfig.server.startsWith('127.0.0.1:')

  // On Windows, handle SSL/TLS certificate issues
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  const shouldDisableTLSValidation = isWindows && !process.env.NODE_TLS_REJECT_UNAUTHORIZED
  if (shouldDisableTLSValidation) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    console.log(
      '⚠️  Windows detected: Temporarily disabling strict TLS validation for database connection'
    )
  }

  // For localhost, we'll try with encryption first, then fallback to no encryption if TLS fails
  const shouldTryWithoutEncryption = isLocalhost

  const mssqlConfig: sql.config = {
    user: connectionConfig.user,
    password: connectionConfig.password,
    server: connectionConfig.server,
    database: connectionConfig.database,
    options: {
      // Try with encryption first (will fallback for localhost if needed)
      encrypt: true,
      trustServerCertificate: true,
      // Additional options for better compatibility
      enableArithAbort: true,
      abortTransactionOnError: false,
      // Windows-specific: ensure proper certificate handling
      ...(isWindows
        ? {
            useUTC: true
          }
        : {})
    },
    connectionTimeout: 15000,
    requestTimeout: 30000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  }

  try {
    dbPool = await sql.connect(mssqlConfig)
    // Restore original TLS setting after successful connection
    if (shouldDisableTLSValidation) {
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      }
    }
    return dbPool
  } catch (error) {
    // If encryption failed and we're on localhost, try without encryption
    if (
      shouldTryWithoutEncryption &&
      mssqlConfig.options?.encrypt &&
      (error instanceof Error
        ? error.message.includes('UNSUPPORTED_PROTOCOL') ||
          error.message.includes('SSL') ||
          error.message.includes('TLS') ||
          error.message.includes('certificate')
        : false)
    ) {
      console.log('⚠️  TLS/SSL connection failed, retrying without encryption for localhost...')
      try {
        // Clean up failed connection
        if (dbPool) {
          try {
            await dbPool.close()
          } catch {
            // Ignore close errors
          }
          dbPool = null
        }

        // Retry without encryption
        const retryConfig: sql.config = {
          ...mssqlConfig,
          options: {
            ...mssqlConfig.options,
            encrypt: false
          }
        }

        dbPool = await sql.connect(retryConfig)
        // Restore original TLS setting
        if (shouldDisableTLSValidation) {
          if (originalRejectUnauthorized !== undefined) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
          } else {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
          }
        }
        return dbPool
      } catch (retryError) {
        // If retry also fails, restore TLS setting and throw original error
        if (shouldDisableTLSValidation) {
          if (originalRejectUnauthorized !== undefined) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
          } else {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
          }
        }
        throw retryError
      }
    }

    // Restore original TLS setting on error
    if (shouldDisableTLSValidation) {
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      }
    }
    throw error
  }
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

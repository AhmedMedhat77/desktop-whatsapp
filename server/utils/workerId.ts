import os from 'os'

/**
 * Generates a unique worker identifier for this process instance.
 * Format: hostname:pid
 * 
 * This ID is used to track which worker/process has claimed a record
 * for processing. In distributed environments (PM2, Docker, multiple instances),
 * each process will have a unique worker ID.
 * 
 * Example: "my-server-01:12345"
 */
let cachedWorkerId: string | null = null

export function getWorkerId(): string {
  if (cachedWorkerId) {
    return cachedWorkerId
  }
  
  const hostname = os.hostname()
  const pid = process.pid
  cachedWorkerId = `${hostname}:${pid}`
  
  return cachedWorkerId
}

/**
 * Resets the cached worker ID (useful for testing)
 */
export function resetWorkerId(): void {
  cachedWorkerId = null
}



import { scheduleJob, Job } from 'node-schedule'

export type ScheduleDelay = 'immediate' | '1min' | '5min' | '15min' | '30min' | '1hour' | 'custom'

export interface ScheduledJob {
  id: string
  job: Job
  delay: ScheduleDelay
  customDelayMs?: number
  executeAt: Date
}

const scheduledJobs = new Map<string, ScheduledJob>()

/**
 * Calculate delay in milliseconds based on delay type
 */
export const getDelayMs = (delay: ScheduleDelay, customDelayMs?: number): number => {
  switch (delay) {
    case 'immediate':
      return 0
    case '1min':
      return 60 * 1000
    case '5min':
      return 5 * 60 * 1000
    case '15min':
      return 15 * 60 * 1000
    case '30min':
      return 30 * 60 * 1000
    case '1hour':
      return 60 * 60 * 1000
    case 'custom':
      return customDelayMs || 0
    default:
      return 0
  }
}

/**
 * Schedule a function to run after a delay
 */
export const scheduleDelayedJob = (
  id: string,
  fn: () => void | Promise<void>,
  delay: ScheduleDelay,
  customDelayMs?: number
): ScheduledJob => {
  // Cancel existing job with same ID if any
  cancelJob(id)

  const delayMs = getDelayMs(delay, customDelayMs)
  const executeAt = new Date(Date.now() + delayMs)

  let job: Job

  if (delay === 'immediate' || delayMs === 0) {
    // Execute immediately
    Promise.resolve(fn()).catch((error) => {
      console.error(`Error executing immediate job ${id}:`, error)
    })
    // Create a dummy job for tracking
    job = scheduleJob(executeAt, () => {})
  } else {
    // Schedule for later
    job = scheduleJob(executeAt, async () => {
      try {
        await fn()
      } catch (error) {
        console.error(`Error executing scheduled job ${id}:`, error)
      } finally {
        scheduledJobs.delete(id)
      }
    })
  }

  const scheduledJob: ScheduledJob = {
    id,
    job,
    delay,
    customDelayMs,
    executeAt
  }

  scheduledJobs.set(id, scheduledJob)
  return scheduledJob
}

/**
 * Cancel a scheduled job
 */
export const cancelJob = (id: string): boolean => {
  const scheduledJob = scheduledJobs.get(id)
  if (scheduledJob) {
    scheduledJob.job.cancel()
    scheduledJobs.delete(id)
    return true
  }
  return false
}

/**
 * Get all scheduled jobs
 */
export const getScheduledJobs = (): ScheduledJob[] => {
  return Array.from(scheduledJobs.values())
}

/**
 * Get a specific scheduled job
 */
export const getScheduledJob = (id: string): ScheduledJob | undefined => {
  return scheduledJobs.get(id)
}

/**
 * Cancel all scheduled jobs
 */
export const cancelAllJobs = (): void => {
  scheduledJobs.forEach((scheduledJob) => {
    scheduledJob.job.cancel()
  })
  scheduledJobs.clear()
}


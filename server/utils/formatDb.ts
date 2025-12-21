// Utility functions for formatting date and time from DB values

/**
 * Format a date from yyyymmdd (e.g. 20250824) to yyyy-mm-dd (e.g. 2025-08-24)
 */
export function formatDbDate(rawDate: string | number): string {
  const str = rawDate?.toString() || ''
  if (str.length === 8) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`
  }
  return str
}

/**
 * Format a time from hmm or hhmm (e.g. 900, 1145) to HH:mm (e.g. 09:00, 11:45)
 */
export function formatDbTime(rawTime: string | number): string {
  const str = rawTime?.toString().padStart(4, '0') || ''
  if (str.length === 4) {
    return `${str.slice(0, 2)}:${str.slice(2, 4)}`
  }
  return str
}

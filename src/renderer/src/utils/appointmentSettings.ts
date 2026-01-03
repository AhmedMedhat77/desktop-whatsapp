export type ReminderType = '1day' | '2days' | 'custom'

export interface AppointmentReminderSettings {
  reminderType: ReminderType
  customHours: number // For custom type
  enabled: boolean
  startFrom?: string // ISO date string (YYYY-MM-DD), optional for backward compatibility
}

const STORAGE_KEY = 'appointment_reminder_settings'
const DEFAULT_SETTINGS: AppointmentReminderSettings = {
  reminderType: '1day',
  customHours: 24,
  enabled: true
}

/**
 * Get appointment reminder settings from localStorage
 */
export const getReminderSettings = (): AppointmentReminderSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_SETTINGS
    const settings = JSON.parse(stored) as AppointmentReminderSettings
    // Validate and merge with defaults
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      customHours: settings.customHours || DEFAULT_SETTINGS.customHours
    }
  } catch (error) {
    console.error('Error reading reminder settings from localStorage:', error)
    return DEFAULT_SETTINGS
  }
}

/**
 * Save appointment reminder settings to localStorage
 */
export const saveReminderSettings = (settings: AppointmentReminderSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Error saving reminder settings to localStorage:', error)
  }
}

/**
 * Get reminder time in milliseconds before appointment
 */
export const getReminderTimeMs = (settings: AppointmentReminderSettings): number => {
  if (!settings.enabled) return 0

  switch (settings.reminderType) {
    case '1day':
      return 24 * 60 * 60 * 1000 // 1 day in milliseconds
    case '2days':
      return 2 * 24 * 60 * 60 * 1000 // 2 days in milliseconds
    case 'custom':
      return settings.customHours * 60 * 60 * 1000 // Custom hours in milliseconds
    default:
      return 24 * 60 * 60 * 1000
  }
}

/**
 * Get reminder time in hours (for display)
 */
export const getReminderTimeHours = (settings: AppointmentReminderSettings): number => {
  if (!settings.enabled) return 0

  switch (settings.reminderType) {
    case '1day':
      return 24
    case '2days':
      return 48
    case 'custom':
      return settings.customHours
    default:
      return 24
  }
}

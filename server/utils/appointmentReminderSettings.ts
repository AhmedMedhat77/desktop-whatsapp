import fs from 'node:fs'
import path from 'node:path'

export type ReminderType = '1day' | '2days' | 'custom'

export interface AppointmentReminderSettings {
  reminderType: ReminderType
  customHours: number
  enabled: boolean
}

const SETTINGS_FILE = path.join(process.cwd(), '.appointment-reminder-settings.json')
const DEFAULT_SETTINGS: AppointmentReminderSettings = {
  reminderType: '1day',
  customHours: 24,
  enabled: true
}

/**
 * Get appointment reminder settings from file
 */
export const getReminderSettings = (): AppointmentReminderSettings => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return DEFAULT_SETTINGS
    }

    const fileContent = fs.readFileSync(SETTINGS_FILE, 'utf8')
    const settings = JSON.parse(fileContent) as AppointmentReminderSettings

    // Validate and merge with defaults
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      customHours: settings.customHours || DEFAULT_SETTINGS.customHours
    }
  } catch (error) {
    console.error('Error reading reminder settings:', error)
    return DEFAULT_SETTINGS
  }
}

/**
 * Save appointment reminder settings to file
 */
export const saveReminderSettings = (settings: AppointmentReminderSettings): void => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8')
  } catch (error) {
    console.error('Error saving reminder settings:', error)
    throw error
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

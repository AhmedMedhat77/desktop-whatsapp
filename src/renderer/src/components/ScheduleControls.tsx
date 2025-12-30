import { useState } from 'react'
import Button from './Button'
import Input from './Input'

export type ScheduleDelay = 'immediate' | '1min' | '5min' | '15min' | '30min' | '1hour' | 'custom'

interface ScheduleControlsProps {
  onSchedule: (delay: ScheduleDelay, customDelayMs?: number) => void
  disabled?: boolean
  isLoading?: boolean
}

const ScheduleControls: React.FC<ScheduleControlsProps> = ({
  onSchedule,
  disabled = false,
  isLoading = false
}) => {
  const [selectedDelay, setSelectedDelay] = useState<ScheduleDelay>('immediate')
  const [customMinutes, setCustomMinutes] = useState<string>('')
  const [customHours, setCustomHours] = useState<string>('')

  const delayOptions: Array<{ value: ScheduleDelay; label: string }> = [
    { value: 'immediate', label: 'Immediate' },
    { value: '1min', label: 'After 1 minute' },
    { value: '5min', label: 'After 5 minutes' },
    { value: '15min', label: 'After 15 minutes' },
    { value: '30min', label: 'After 30 minutes' },
    { value: '1hour', label: 'After 1 hour' },
    { value: 'custom', label: 'Custom delay' }
  ]

  const handleSchedule = (): void => {
    if (selectedDelay === 'custom') {
      const minutes = parseInt(customMinutes) || 0
      const hours = parseInt(customHours) || 0
      const totalMs = (hours * 60 + minutes) * 60 * 1000

      if (totalMs <= 0) {
        alert('Please enter a valid delay (at least 1 minute)')
        return
      }

      onSchedule('custom', totalMs)
    } else {
      onSchedule(selectedDelay)
    }
  }

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <h3 className="font-semibold text-lg">Schedule Message</h3>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Delay</label>
        <select
          value={selectedDelay}
          onChange={(e) => setSelectedDelay(e.target.value as ScheduleDelay)}
          disabled={disabled || isLoading}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        >
          {delayOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {selectedDelay === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
            <Input
              type="number"
              min="0"
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              disabled={disabled || isLoading}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label>
            <Input
              type="number"
              min="0"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              disabled={disabled || isLoading}
              placeholder="0"
            />
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={handleSchedule}
        disabled={disabled || isLoading}
        isLoading={isLoading}
        className="w-full bg-blue-500 hover:bg-blue-600"
      >
        {selectedDelay === 'immediate' ? 'Send Now' : 'Schedule'}
      </Button>
    </div>
  )
}

export default ScheduleControls


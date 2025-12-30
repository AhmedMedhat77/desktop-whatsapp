import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose: () => void
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = 3000, onClose }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [duration, onClose])

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />
      case 'error':
        return <AlertCircle className="w-5 h-5" />
      case 'warning':
        return <AlertCircle className="w-5 h-5" />
      default:
        return <Info className="w-5 h-5" />
    }
  }

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800'
    }
  }

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 p-4 rounded-lg shadow-lg border ${getStyles()} animate-in slide-in-from-top-5 fade-in duration-300`}
    >
      <div className="flex-shrink-0">{getIcon()}</div>
      <p className="text-sm font-medium flex-1">{message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 hover:opacity-70 transition-opacity"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default Toast


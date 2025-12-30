import { MessageCircle, Heart } from 'lucide-react'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
}

const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }: LogoProps) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  }

  const textSizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl'
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Logo Icon */}
      <div className="relative">
        <div
          className={`${sizeClasses[size]} bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform duration-200`}
        >
          <MessageCircle
            className={`${size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-7 h-7'} text-white`}
          />
        </div>
        {/* Small heart icon overlay */}
        <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 shadow-md">
          <Heart className="w-2.5 h-2.5 text-white fill-white" />
        </div>
      </div>

      {/* Logo Text */}
      {showText && (
        <div className="flex flex-col">
          <h1
            className={`${textSizes[size]} font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent`}
          >
            ClinicMessenger
          </h1>
          {size !== 'sm' && (
            <p className="text-xs text-gray-500 hidden sm:block">Healthcare Messaging</p>
          )}
        </div>
      )}
    </div>
  )
}

export default Logo

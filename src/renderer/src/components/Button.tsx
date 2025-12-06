import { Loader2Icon } from 'lucide-react'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
}

const Button: React.FC<Props> = ({ className = '', isLoading, children, ...props }: Props) => {
  return (
    <button
      {...props}
      className={`text-white p-2 rounded-md gap-2 flex items-center justify-center w-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
        className || 'bg-blue-500 hover:bg-blue-600'
      }`}
    >
      {isLoading && <Loader2Icon className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
}

export default Button

import { useState } from 'react'

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}
const Input = (props: Props): React.JSX.Element => {
  const [showPassword, setShowPassword] = useState(false)

  const handleShowPassword = (): void => {
    setShowPassword(!showPassword)
  }

  return (
    <div className="flex flex-col gap-1 px-2 ">
      <label className="text-sm font-medium text-gray-700 px-1  block" htmlFor={props.id}>
        {props.label}
      </label>
      <div className="relative w-full">
        <input
          {...props}
          type={showPassword ? 'text' : props.type}
          className={`border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 w-full ${props.leftIcon ? 'pl-9' : ''} ${props.rightIcon ? 'pr-9' : ''}`}
        />

        {props.leftIcon && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">
            {props.leftIcon}
          </div>
        )}

        {props.rightIcon && (
          <div
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
            onClick={handleShowPassword}
          >
            {props.rightIcon}
          </div>
        )}
      </div>

      {props.error && <p className="text-red-500 text-sm px-1">{props.error}</p>}
      {props.hint && <p className="text-gray-500 text-sm px-1">{props.hint}</p>}
    </div>
  )
}

export default Input

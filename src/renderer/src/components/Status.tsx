interface Props {
  status?: 'online' | 'offline' | 'pending' | 'connecting' | 'error'
  size?: number
}

const Status: React.FC<Props> = ({ size = 16, status = 'pending' }: Props) => {
  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    pending: 'bg-yellow-500',
    connecting: 'bg-blue-500',
    error: 'bg-red-500'
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full ${statusColors[status]} animate-pulse`}
    />
  )
}

export default Status

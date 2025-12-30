import { Link, useLocation } from '@tanstack/react-router'
import { Home, MessageSquare, Settings, Zap } from 'lucide-react'

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  {
    label: 'Home',
    path: '/',
    icon: <Home className="w-5 h-5" />
  },
  {
    label: 'Messages',
    path: '/messages',
    icon: <MessageSquare className="w-5 h-5" />
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: <Settings className="w-5 h-5" />
  }
]

const Navbar: React.FC = () => {
  const location = useLocation()
  const isActive = (path: string): boolean => location.pathname === path

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-md">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">WhatsApp Manager</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Desktop Messaging System</p>
            </div>
          </div>

          {/* Navigation Items */}
          <ul className="flex items-center gap-2">
            {navItems.map((item) => {
              const active = isActive(item.path)
              return (
                <li key={item.path} className="relative">
                  <Link
                    to={item.path}
                    className={`
                      relative flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200
                      ${
                        active
                          ? 'bg-blue-600 text-white font-semibold shadow-md'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                  >
                    <span className={active ? 'text-white' : 'text-gray-500'}>{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </nav>
  )
}

export default Navbar

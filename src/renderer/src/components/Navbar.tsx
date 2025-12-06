import { Link, useLocation } from '@tanstack/react-router'

const navItems = [
  {
    label: 'Home',
    path: '/'
  },
  {
    label: 'Database Config',
    path: '/config'
  }
]

const Navbar: React.FC = () => {
  const location = useLocation()
  const isActive = (path: string): boolean => location.pathname === path
  return (
    <nav className="p-2 border-b border-gray-200 shadow-md absolute top-0 left-0 right-0">
      <ul className="flex gap-2">
        {navItems.map((item) => (
          <li
            key={item.path}
            className={`${isActive(item.path) ? 'font-bold text-primary-color' : 'text-gray-500'}`}
          >
            <Link to={item.path}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default Navbar

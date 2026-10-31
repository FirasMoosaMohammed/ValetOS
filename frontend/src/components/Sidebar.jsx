import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import '../styles/sidebar.css'

const ADMIN_NAV = [
  { path: '/dashboard',  label: 'Dashboard',    icon: '⬡' },
  { path: '/entry',      label: 'Entry',        icon: '↘' },
  { path: '/exit',       label: 'Exit',         icon: '↗' },
  { path: '/tickets',    label: 'All Tickets',  icon: '◈' },
  { path: '/slot-map',   label: 'Slot Map',     icon: '⊟' },
  { path: '/history',    label: 'History',      icon: '◷' },
]
const ADMIN_MANAGE = [
  { path: '/staff',       label: 'Staff',        icon: '◉' },
  { path: '/rfid-cards',  label: 'RFID Cards',   icon: '▣' },
  { path: '/slots',       label: 'Slots',        icon: '⊞' },
  { path: '/rates',       label: 'Rates',        icon: '₹' },
  { path: '/exceptions',  label: 'Exceptions',   icon: '⚠' },
]
const VALET_NAV = [
  { path: '/valet/dashboard', label: 'My Tasks',   icon: '◈' },
  { path: '/valet/history',   label: 'My History', icon: '◷' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }
  const isAdmin = user?.role === 'admin'
  const navItems = isAdmin ? ADMIN_NAV : VALET_NAV

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-v">V</span>
        <span className="logo-rest">alet<em>OS</em></span>
      </div>

      <div className="sidebar-user">
        <div className="user-avatar">{(user?.full_name || user?.username || 'U')[0].toUpperCase()}</div>
        <div className="user-info">
          <span className="user-name">{user?.full_name || user?.username}</span>
          <span className={`user-role role-${user?.role}`}>{user?.role}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {isAdmin && <div className="nav-section-label">Operations</div>}
        {navItems.map(item => (
          <NavLink key={item.path} to={item.path} end={item.path === '/dashboard' || item.path === '/valet/dashboard'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div className="nav-section-label" style={{ marginTop: 6 }}>Management</div>
            {ADMIN_MANAGE.map(item => (
              <NavLink key={item.path} to={item.path}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="sidebar-bottom">
        <button className="theme-toggle" onClick={toggle}>
          <span>{theme === 'dark' ? '☀' : '☾'}</span>
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <button className="sidebar-logout" onClick={handleLogout}>
          <span>⏻</span> Logout
        </button>
      </div>
    </aside>
  )
}

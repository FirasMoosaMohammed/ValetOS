import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import ValetRoute from './components/ValetRoute'
import Sidebar from './components/Sidebar'

// Auth
import Login from './pages/Login'

// Admin pages
import Dashboard   from './pages/admin/Dashboard'
import Entry       from './pages/admin/Entry'
import Exit        from './pages/admin/Exit'
import Tickets     from './pages/admin/Tickets'
import SlotMap     from './pages/admin/SlotMap'
import History     from './pages/admin/History'
import Staff       from './pages/admin/Staff'
import RFIDCards   from './pages/admin/RFIDCards'
import Slots       from './pages/admin/Slots'
import Rates       from './pages/admin/Rates'
import Exceptions  from './pages/admin/Exceptions'
import Receipt     from './pages/admin/Receipt'

// Valet pages
import ValetDashboard from './pages/valet/ValetDashboard'
import ValetHistory   from './pages/valet/ValetHistory'

import './styles/global.css'

function AppShell({ children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">{children}</main>
    </div>
  )
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      {/* Login */}
      <Route path="/login" element={
        user ? <Navigate to={user.role==='admin'?'/dashboard':'/valet/dashboard'} replace /> : <Login />
      } />

      {/* Admin routes — all wrapped in AppShell */}
      <Route path="/dashboard" element={<ProtectedRoute adminOnly><AppShell><Dashboard /></AppShell></ProtectedRoute>} />
      <Route path="/entry"     element={<ProtectedRoute adminOnly><AppShell><Entry /></AppShell></ProtectedRoute>} />
      <Route path="/exit"      element={<ProtectedRoute adminOnly><AppShell><Exit /></AppShell></ProtectedRoute>} />
      <Route path="/tickets"   element={<ProtectedRoute adminOnly><AppShell><Tickets /></AppShell></ProtectedRoute>} />
      <Route path="/slot-map"  element={<ProtectedRoute adminOnly><AppShell><SlotMap /></AppShell></ProtectedRoute>} />
      <Route path="/history"   element={<ProtectedRoute adminOnly><AppShell><History /></AppShell></ProtectedRoute>} />
      <Route path="/staff"     element={<ProtectedRoute adminOnly><AppShell><Staff /></AppShell></ProtectedRoute>} />
      <Route path="/rfid-cards" element={<ProtectedRoute adminOnly><AppShell><RFIDCards /></AppShell></ProtectedRoute>} />
      <Route path="/slots"     element={<ProtectedRoute adminOnly><AppShell><Slots /></AppShell></ProtectedRoute>} />
      <Route path="/rates"     element={<ProtectedRoute adminOnly><AppShell><Rates /></AppShell></ProtectedRoute>} />
      <Route path="/exceptions" element={<ProtectedRoute adminOnly><AppShell><Exceptions /></AppShell></ProtectedRoute>} />

      {/* Receipt — standalone, no sidebar, accessible to both roles */}
      <Route path="/receipt/:ticketId" element={<ProtectedRoute><Receipt /></ProtectedRoute>} />

      {/* Valet routes */}
      <Route path="/valet/dashboard" element={<ValetRoute><AppShell><ValetDashboard /></AppShell></ValetRoute>} />
      <Route path="/valet/history"   element={<ValetRoute><AppShell><ValetHistory /></AppShell></ValetRoute>} />

      {/* Default redirects */}
      <Route path="/" element={
        user
          ? <Navigate to={user.role==='admin'?'/dashboard':'/valet/dashboard'} replace />
          : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

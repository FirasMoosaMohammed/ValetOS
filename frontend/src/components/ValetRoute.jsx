import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ValetRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading"><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/dashboard" replace />
  return children
}

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch { localStorage.clear() }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (username, password) => {
    const res = await api.post('/api/auth/login/', { username, password })
    const { access, refresh, user: u } = res.data
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
    localStorage.setItem('user', JSON.stringify(u))
    setUser(u)
    return u
  }, [])

  const logout = useCallback(() => {
    localStorage.clear()
    setUser(null)
  }, [])

  // Refresh user from live DB (e.g. after admin changes shift status)
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/api/auth/me/')
      const fresh = res.data
      // Merge into stored user to keep token fields
      const merged = { ...user, ...fresh }
      localStorage.setItem('user', JSON.stringify(merged))
      setUser(merged)
      return merged
    } catch {
      return user
    }
  }, [user])

  return (
    <AuthContext.Provider value={{
      user, login, logout, loading, refreshUser,
      isAdmin: user?.role === 'admin',
      isValet: user?.role === 'attendant',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

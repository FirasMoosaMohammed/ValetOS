import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/global.css'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const submit = async e => {
    e.preventDefault()
    if (!form.username || !form.password) { setError('Both fields required.'); return }
    setLoading(true); setError('')
    try {
      const u = await login(form.username, form.password)
      navigate(u.role === 'admin' ? '/dashboard' : '/valet/dashboard', { replace: true })
    } catch {
      setError('Invalid credentials.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-primary)' }}>
      {/* Left brand panel */}
      <div style={{
        width: 400, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 48px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 20, position: 'relative', zIndex: 1 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 68, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>V</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -2 }}>alet<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>OS</span></span>
        </div>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.45, position: 'relative', zIndex: 1 }}>
          End-to-end valet<br />parking operations.
        </p>
        {/* Grid decoration */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(var(--border-color) 1px,transparent 1px),linear-gradient(90deg,var(--border-color) 1px,transparent 1px)',
          backgroundSize: '38px 38px', opacity: .45,
          maskImage: 'radial-gradient(ellipse at 30% 50%,black 30%,transparent 75%)',
        }} />
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 24 }}>Sign in</h1>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={submit} noValidate>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" autoFocus value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="username" />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" className="form-input" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
            </div>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Signing in…</> : 'Sign in →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

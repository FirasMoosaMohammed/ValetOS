import { useState, useEffect, useCallback } from 'react'
import { getMyTasks, confirmParked, confirmRetrieved } from '../../api/taskApi'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'

const VT_ICONS = { car:'🚗', suv:'🚙', bike:'🏍', truck:'🚛', other:'🚐' }

function fmtMins(m) { return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m` }
function fmtTime(iso) { if(!iso) return '—'; return new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) }

function ParkTaskCard({ task, onConfirm, confirming }) {
  return (
    <div style={{ background:'var(--bg-card)', border:'2px solid rgba(34,197,94,.35)', borderRadius:'var(--radius-lg)', padding:20, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'var(--green)' }} />
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--green)' }}>🅿 Park Vehicle</span>
          <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, color:'var(--text-primary)', letterSpacing:.5, marginTop:2 }}>{task.vehicle_number}</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)' }}>{task.customer_name}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:24, fontWeight:800, color:'var(--accent)' }}>{task.slot_code || '—'}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>Zone {task.zone || '—'}</div>
        </div>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{VT_ICONS[task.vehicle_type]} {task.vehicle_type}</span>
        <span style={{ fontSize:12, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{task.ticket_id}</span>
      </div>

      <button className="btn btn-success btn-full" onClick={()=>onConfirm(task.id)} disabled={confirming===task.id}>
        {confirming===task.id ? <><span className="spinner" style={{width:13,height:13}}/> Confirming…</> : '✓ Confirm Parked'}
      </button>
    </div>
  )
}

function RetrieveTaskCard({ task, onConfirm, confirming }) {
  return (
    <div style={{ background:'var(--bg-card)', border:'2px solid rgba(239,68,68,.35)', borderRadius:'var(--radius-lg)', padding:20, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'var(--red)' }} />
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--red)' }}>🚗 Retrieve Vehicle</span>
          <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, color:'var(--text-primary)', letterSpacing:.5, marginTop:2 }}>{task.vehicle_number}</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)' }}>{task.customer_name}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:24, fontWeight:800, color:'var(--red)' }}>{task.slot_code || '—'}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>Zone {task.zone || '—'}</div>
        </div>
      </div>
      <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:14 }}>
        {task.ticket_id} · Assigned {fmtTime(task.assigned_at)}
      </div>
      <button className="btn btn-danger btn-full" onClick={()=>onConfirm(task.retrieval_task_id)} disabled={confirming===task.retrieval_task_id}>
        {confirming===task.retrieval_task_id ? <><span className="spinner" style={{width:13,height:13}}/> Confirming…</> : '↗ Confirm Retrieved'}
      </button>
    </div>
  )
}

export default function ValetDashboard() {
  const toast = useToast()
  const { user } = useAuth()
  const [tasks, setTasks]       = useState({ park_tasks:[], retrieval_tasks:[] })
  const [loading, setLoading]   = useState(true)
  const [confirmingPark, setConfirmingPark]   = useState(null)
  const [confirmingRetrieve, setConfirmingRetrieve] = useState(null)
  const [lastPoll, setLastPoll] = useState(null)
  const [isOnShift, setIsOnShift] = useState(null)  // null = loading, true/false = live value

  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true)
    try {
      const r = await getMyTasks()
      setTasks(r.data)
      setLastPoll(new Date())
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Poll shift status from live DB via /api/auth/me/ every 30s
  // (JWT payload doesn't update when admin toggles shift)
  const checkShift = useCallback(async () => {
    try {
      const r = await api.get('/api/auth/me/')
      setIsOnShift(r.data.is_on_shift)
    } catch {
      // Keep previous value on network error
    }
  }, [])

  useEffect(() => {
    load()
    checkShift()
    const taskInterval  = setInterval(() => load(true), 10000)
    const shiftInterval = setInterval(checkShift, 30000)
    return () => {
      clearInterval(taskInterval)
      clearInterval(shiftInterval)
    }
  }, [load, checkShift])

  const handleConfirmParked = async id => {
    setConfirmingPark(id)
    try {
      await confirmParked(id)
      toast.success('Vehicle marked as parked!')
      load(true)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to confirm.')
    } finally { setConfirmingPark(null) }
  }

  const handleConfirmRetrieved = async id => {
    setConfirmingRetrieve(id)
    try {
      await confirmRetrieved(id)
      toast.success('Vehicle marked as retrieved!')
      load(true)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to confirm.')
    } finally { setConfirmingRetrieve(null) }
  }

  const parkCount     = tasks.park_tasks?.length || 0
  const retrieveCount = tasks.retrieval_tasks?.length || 0
  const totalTasks    = parkCount + retrieveCount

  return (
    <div>
      <div className="flex-between page-header">
        <div>
          <h1 className="page-title">My Tasks</h1>
          <p className="page-subtitle">
            {totalTasks > 0
              ? `${totalTasks} task${totalTasks!==1?'s':''} assigned to you`
              : 'No tasks assigned right now'}
            {lastPoll && ` · Last updated ${lastPoll.toLocaleTimeString('en-IN')}`}
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--green)', background:'var(--green-dim)', border:'1px solid rgba(34,197,94,.3)', borderRadius:4, padding:'3px 8px' }}>
            ↻ Auto-refresh 10s
          </span>
          <button className="btn btn-ghost btn-sm" onClick={()=>load()}>Refresh</button>
        </div>
      </div>

      {/* Shift status — live polled every 30s from /api/auth/me/ */}
      {isOnShift === false && (
        <div className="alert alert-warn">
          ⚠ You are not on shift. Ask an admin to start your shift so you can receive tasks.
        </div>
      )}
      {isOnShift === true && (
        <div className="alert alert-success">
          ✓ You are on shift and receiving tasks.
        </div>
      )}

      {loading ? (
        <div className="page-center"><div className="spinner" /></div>
      ) : totalTasks === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px' }}>
          <div style={{ fontSize:48, marginBottom:12, opacity:.3 }}>✓</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>All clear!</div>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>No tasks assigned. Waiting for next assignment…</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>

          {/* Park tasks */}
          {tasks.park_tasks?.map(t => (
            <ParkTaskCard key={t.id} task={t} onConfirm={handleConfirmParked} confirming={confirmingPark} />
          ))}

          {/* Retrieval tasks */}
          {tasks.retrieval_tasks?.map(t => (
            <RetrieveTaskCard key={t.retrieval_task_id} task={t} onConfirm={handleConfirmRetrieved} confirming={confirmingRetrieve} />
          ))}
        </div>
      )}

      {/* Summary bar */}
      {totalTasks > 0 && (
        <div style={{ marginTop:20, display:'flex', gap:10, flexWrap:'wrap' }}>
          {parkCount > 0 && (
            <div style={{ background:'var(--green-dim)', border:'1px solid rgba(34,197,94,.25)', borderRadius:'var(--radius)', padding:'10px 16px', fontSize:13, color:'var(--green)' }}>
              🅿 <strong>{parkCount}</strong> vehicle{parkCount!==1?'s':''} to park
            </div>
          )}
          {retrieveCount > 0 && (
            <div style={{ background:'var(--red-dim)', border:'1px solid rgba(239,68,68,.25)', borderRadius:'var(--radius)', padding:'10px 16px', fontSize:13, color:'var(--red)' }}>
              🚗 <strong>{retrieveCount}</strong> vehicle{retrieveCount!==1?'s':''} to retrieve
            </div>
          )}
        </div>
      )}
    </div>
  )
}

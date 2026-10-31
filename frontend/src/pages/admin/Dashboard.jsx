import { useState, useEffect } from 'react'
import { getDashboardStats } from '../../api/ticketApi'

const STATUS_LABEL = {
  checked_in:'Checked In', queued_slot:'Queue (Slot)', queued_valet:'Queue (Valet)',
  valet_assigned:'Assigned', parked:'Parked', retrieval_pending:'Retrieval',
  retrieved:'Retrieved', completed:'Completed',
}

function Stat({ label, value, color, prefix='', sub }) {
  return (
    <div className="card" style={{ '--ac': color, position:'relative', overflow:'hidden' }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:4 }}>{label}</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:36, fontWeight:800, color:'var(--ac,var(--text-primary))', lineHeight:1.05, letterSpacing:-1 }}>{prefix}{value ?? '—'}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{sub}</div>}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:'var(--ac,var(--border-color))', opacity:.5 }} />
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { const r = await getDashboardStats(); setStats(r.data) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  if (loading) return <div className="page-center"><div className="spinner" /></div>
  if (!stats) return null

  const pct = stats.total_slots ? Math.round(stats.occupied/stats.total_slots*100) : 0

  return (
    <div>
      <div className="flex-between page-header">
        <div><h1 className="page-title">Dashboard</h1><p className="page-subtitle">Live operations overview</p></div>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:12 }}>
        <Stat label="Total Slots"    value={stats.total_slots}    color="var(--text-secondary)" />
        <Stat label="Occupied"       value={stats.occupied}       color="var(--red)"    sub={`${pct}% full`} />
        <Stat label="Available"      value={stats.available}      color="var(--green)" />
        <Stat label="Active Tickets" value={stats.active_tickets} color="var(--accent)" />
        <Stat label="Parked"         value={stats.parked_tickets} color="var(--blue)" />
        <Stat label="Today Entries"  value={stats.today_entries}  color="var(--purple)" />
        <Stat label="Today Revenue"  value={parseFloat(stats.today_revenue||0).toFixed(0)} prefix="₹" color="var(--green)" sub={`₹${parseFloat(stats.today_revenue||0).toFixed(2)}`} />
        <Stat label="On Shift"       value={stats.on_shift_count} color={stats.on_shift_count>0?'var(--green)':'var(--text-muted)'} />
      </div>

      {(stats.slot_queue_count > 0 || stats.valet_queue_count > 0) && (
        <div style={{ display:'flex', gap:10, marginTop:14, flexWrap:'wrap' }}>
          {stats.slot_queue_count > 0 && <div className="alert alert-warn" style={{ marginBottom:0, flex:1, minWidth:200 }}>⚠ <strong>{stats.slot_queue_count}</strong> vehicle{stats.slot_queue_count!==1?'s':''} waiting for a slot</div>}
          {stats.valet_queue_count > 0 && <div className="alert alert-warn" style={{ marginBottom:0, flex:1, minWidth:200 }}>⚠ <strong>{stats.valet_queue_count}</strong> ticket{stats.valet_queue_count!==1?'s':''} waiting for a valet</div>}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:16 }}>
        <div className="card">
          <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:12 }}>Tickets by Status</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {stats.tickets_by_status?.map(s => (
              <div key={s.status} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span className={`badge status-${s.status}`}>{STATUS_LABEL[s.status]||s.status}</span>
                <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:18, color:'var(--text-primary)' }}>{s.count}</span>
              </div>
            ))}
            {!stats.tickets_by_status?.length && <p style={{fontSize:12,color:'var(--text-muted)'}}>No active tickets</p>}
          </div>
        </div>

        <div className="card">
          <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:12 }}>Attendant Workload</div>
          {stats.attendant_workload?.length === 0 && <p style={{ fontSize:12, color:'var(--text-muted)' }}>No attendants on shift</p>}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {stats.attendant_workload?.map((a,i) => {
              const max = Math.max(...stats.attendant_workload.map(x=>x.active_tasks), 1)
              const p = Math.round(a.active_tasks/max*100)
              return (
                <div key={i}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:500 }}>{a.full_name}</span>
                    <span style={{ fontSize:11, color:'var(--text-muted)' }}>{a.active_tasks} active · {a.today_tasks} today</span>
                  </div>
                  <div style={{ height:5, background:'var(--border-color)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${p}%`, background:p>75?'var(--red)':p>40?'var(--accent)':'var(--green)', borderRadius:3, transition:'width .5s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {stats.zones?.length > 0 && (
        <div className="card mt-14">
          <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:12 }}>Zone Overview</div>
          <div className="grid-2">
            {stats.zones.map(z => {
              const p = z.total ? Math.round(z.occupied_count/z.total*100) : 0
              const col = p>80?'var(--red)':p>50?'var(--accent)':'var(--green)'
              return (
                <div key={z.zone} style={{ background:'var(--bg-input)', border:'1px solid var(--border-color)', borderRadius:'var(--radius)', padding:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:14 }}>Zone {z.zone}</span>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)' }}>{p}%</span>
                  </div>
                  <div style={{ height:4, background:'var(--border-color)', borderRadius:2, overflow:'hidden', marginBottom:5 }}>
                    <div style={{ height:'100%', width:`${p}%`, background:col, borderRadius:2 }} />
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text-muted)' }}>
                    <span>{z.occupied_count} occ.</span><span>{z.total-z.occupied_count} free</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

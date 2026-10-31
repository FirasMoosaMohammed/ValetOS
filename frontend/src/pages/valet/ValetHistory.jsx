import { useState, useEffect } from 'react'
import { getValetHistory } from '../../api/taskApi'
import { useToast } from '../../components/Toast'

function fmt(iso) { if(!iso) return '—'; return new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) }
function fmtMins(m) { return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m` }

export default function ValetHistory() {
  const toast = useToast()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [totalFee, setTotalFee] = useState(0)

  useEffect(() => {
    getValetHistory()
      .then(r => {
        const t = r.data.results ?? r.data
        setTickets(t)
        setTotalFee(t.reduce((s, x) => s + parseFloat(x.fee_amount||0), 0))
      })
      .catch(() => toast.error('Failed to load history.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My History</h1>
        <p className="page-subtitle">Tickets I completed today</p>
      </div>

      {/* Summary */}
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        {[
          ['Completed Today', tickets.length, 'var(--green)'],
          ['Revenue Handled', `₹${totalFee.toFixed(2)}`, 'var(--accent)'],
        ].map(([l,v,c]) => (
          <div key={l} style={{ background:'var(--bg-card)', border:'1px solid var(--border-color)', borderRadius:'var(--radius-lg)', padding:'14px 20px', display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:140 }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>{l}</span>
            <span style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:800, color:c }}>{v}</span>
          </div>
        ))}
      </div>

      <div className="card">
        {loading ? <div className="page-center"><div className="spinner" /></div> :
         tickets.length===0 ? (
          <div className="empty-state">
            <span className="empty-icon">◷</span>
            <p>No completed tickets today yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ticket</th><th>Vehicle</th><th>Customer</th><th>Slot</th><th>Entry</th><th>Exit</th><th>Duration</th><th>Fee</th></tr></thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id}>
                    <td><span className="mono text-accent" style={{fontSize:11}}>{t.ticket_id}</span></td>
                    <td><strong className="mono">{t.vehicle_number}</strong></td>
                    <td><strong>{t.customer_name}</strong></td>
                    <td>{t.slot_code?<span className="slot-tag">{t.slot_code}</span>:'—'}</td>
                    <td style={{fontSize:11}}>{fmt(t.entry_time)}</td>
                    <td style={{fontSize:11}}>{fmt(t.exit_time)}</td>
                    <td className="mono" style={{fontSize:11}}>{fmtMins(t.duration_minutes)}</td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--green)'}}>{t.fee_amount?`₹${parseFloat(t.fee_amount).toFixed(2)}`:'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

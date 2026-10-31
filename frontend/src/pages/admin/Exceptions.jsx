import { useState, useEffect } from 'react'
import { getExceptions } from '../../api/staffApi'
import { useToast } from '../../components/Toast'

const TYPE_LABEL = {
  lost_rfid:       'Lost RFID',
  unknown_rfid:    'Unknown RFID',
  flagged_rfid:    'Flagged RFID',
  no_slots:        'No Slots',
  no_valet:        'No Valet',
  otp_verified:    'OTP Verified',
  manual_override: 'Manual Override',
}
const TYPE_COLOR = {
  lost_rfid:'badge-amber', unknown_rfid:'badge-red', flagged_rfid:'badge-red',
  no_slots:'badge-amber', no_valet:'badge-amber',
  otp_verified:'badge-green', manual_override:'badge-blue',
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true})
}

export default function Exceptions() {
  const toast = useToast()
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage]       = useState(1)
  const [total, setTotal]     = useState(0)

  const load = async () => {
    setLoading(true)
    try {
      const params = { page }
      if (typeFilter) params.type = typeFilter
      const r = await getExceptions(params)
      const d = r.data
      setLogs(d.results ?? d)
      setTotal(d.count ?? d.length)
    } catch { toast.error('Failed to load exceptions.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, typeFilter])

  const totalPages = Math.ceil(total / 20) || 1

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Exception Log</h1>
        <p className="page-subtitle">All flagged events and override actions</p>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
        <select className="form-select" style={{ width:'auto' }} value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setPage(1)}}>
          <option value="">All Types</option>
          {Object.entries(TYPE_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }}>{total} events</span>
      </div>

      <div className="card">
        {loading ? <div className="page-center"><div className="spinner" /></div> :
         logs.length===0 ? <div className="empty-state"><span className="empty-icon">⚠</span><p>No exceptions logged.</p></div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Type</th><th>Ticket</th><th>RFID UID</th><th>Resolved By</th><th>Notes</th><th>Timestamp</th></tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td><span className={`badge ${TYPE_COLOR[log.type]||'badge-gray'}`}>{TYPE_LABEL[log.type]||log.type}</span></td>
                    <td>
                      {log.ticket_id
                        ? <span className="mono text-accent" style={{fontSize:11}}>{log.ticket_id}</span>
                        : <span style={{color:'var(--text-muted)'}}>—</span>}
                    </td>
                    <td>
                      {log.rfid_uid
                        ? <span className="mono" style={{fontSize:11}}>{log.rfid_uid}</span>
                        : <span style={{color:'var(--text-muted)'}}>—</span>}
                    </td>
                    <td style={{fontSize:12}}>{log.resolved_by?.username || '—'}</td>
                    <td style={{fontSize:11,color:'var(--text-secondary)',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{log.notes||'—'}</td>
                    <td style={{fontSize:11,color:'var(--text-muted)',whiteSpace:'nowrap'}}>{fmt(log.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:14, alignItems:'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>p-1)} disabled={page===1}>← Prev</button>
          <span className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>Page {page} of {totalPages}</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>p+1)} disabled={page===totalPages}>Next →</button>
        </div>
      )}
    </div>
  )
}

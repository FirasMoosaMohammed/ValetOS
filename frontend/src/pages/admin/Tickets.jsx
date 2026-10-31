import { useState, useEffect } from 'react'
import { getTickets, handover } from '../../api/ticketApi'
import { useToast } from '../../components/Toast'

const STATUS_LABEL = {
  checked_in:'Checked In', queued_slot:'Queued–Slot', queued_valet:'Queued–Valet',
  valet_assigned:'Assigned', parked:'Parked', retrieval_pending:'Retrieval',
  retrieved:'Retrieved', completed:'Completed', cancelled:'Cancelled',
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})
}
function fmtMins(m) { return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m` }

export default function Tickets() {
  const toast = useToast()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [statusF, setStatusF] = useState('')
  const [page, setPage]       = useState(1)
  const [total, setTotal]     = useState(0)
  const [handoveringId, setHandoveringId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = { page }
      if (search) params.search = search
      if (statusF) params.status = statusF
      const r = await getTickets(params)
      const d = r.data
      setTickets(d.results ?? d)
      setTotal(d.count ?? (d.results ? d.count : d.length))
    } catch { toast.error('Failed to load tickets.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, statusF])

  const handleSearch = e => { e.preventDefault(); setPage(1); load() }

  const doHandover = async id => {
    setHandoveringId(id)
    try {
      await handover(id)
      toast.success('Handover complete!')
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'Handover failed.') }
    finally { setHandoveringId(null) }
  }

  const totalPages = Math.ceil(total / 20) || 1

  return (
    <div>
      <div className="page-header"><h1 className="page-title">All Tickets</h1><p className="page-subtitle">View and manage all valet tickets</p></div>

      <form style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }} onSubmit={handleSearch}>
        <input className="form-input" style={{ flex:1, minWidth:180 }} placeholder="Search ticket, vehicle, customer…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="form-select" style={{ width:'auto' }} value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1)}}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="submit" className="btn btn-ghost btn-sm">Search</button>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)', alignSelf:'center', padding:'0 6px' }}>{total} records</span>
      </form>

      <div className="card">
        {loading ? <div className="page-center"><div className="spinner" /></div> :
         tickets.length === 0 ? <div className="empty-state"><span className="empty-icon">◈</span><p>No tickets found.</p></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Ticket ID</th><th>Vehicle</th><th>Customer</th><th>Slot</th>
                <th>Entry</th><th>Duration</th><th>Fee</th><th>Status</th><th>Action</th>
              </tr></thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id}>
                    <td><span className="mono text-accent" style={{fontSize:11}}>{t.ticket_id}</span></td>
                    <td><strong className="mono">{t.vehicle_number}</strong></td>
                    <td><strong>{t.customer_name}</strong></td>
                    <td>{t.slot_code ? <span className="slot-tag">{t.slot_code}</span> : <span className="text-muted">—</span>}</td>
                    <td style={{fontSize:11}}>{fmt(t.entry_time)}</td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{fmtMins(t.duration_minutes)}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--green)'}}>{t.fee_amount?`₹${parseFloat(t.fee_amount).toFixed(2)}`:'—'}</span></td>
                    <td><span className={`badge status-${t.status}`}>{STATUS_LABEL[t.status]||t.status}</span></td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        {t.status==='retrieved' && (
                          <button className="btn btn-success btn-sm" onClick={()=>doHandover(t.id)} disabled={handoveringId===t.id}>
                            {handoveringId===t.id?'…':'Handover'}
                          </button>
                        )}
                        <a href={`/receipt/${t.id}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Receipt</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:16, alignItems:'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>p-1)} disabled={page===1}>← Prev</button>
          <span className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>Page {page} of {totalPages}</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>p+1)} disabled={page===totalPages}>Next →</button>
        </div>
      )}
    </div>
  )
}

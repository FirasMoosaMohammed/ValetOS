import { useState, useEffect } from 'react'
import { getTickets, exportTickets } from '../../api/ticketApi'
import { useToast } from '../../components/Toast'
import api from '../../api/axios'

function fmt(iso) { if(!iso) return '—'; return new Date(iso).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true}) }
function fmtMins(m) { return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m` }

export default function History() {
  const toast = useToast()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]   = useState('')
  const [page, setPage]       = useState(1)
  const [total, setTotal]     = useState(0)
  const [exporting, setExporting] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = { page, status:'completed' }
      if (search) params.search = search
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const r = await getTickets(params)
      const d = r.data
      setTickets(d.results ?? d)
      setTotal(d.count ?? d.length)
    } catch { toast.error('Failed to load history.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page])

  const handleSearch = e => { e.preventDefault(); setPage(1); load() }

  const doExport = async fmt => {
    setShowExportMenu(false); setExporting(true)
    try {
      const params = { format: fmt, status:'completed' }
      if (search) params.search = search
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const r = await api.get('/api/tickets/export/', { params, responseType:'blob' })
      const ext = fmt==='xlsx'?'xlsx':'csv'
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a'); a.href=url; a.download=`valet_tickets_${new Date().toISOString().slice(0,10)}.${ext}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { toast.error('Export failed.') }
    finally { setExporting(false) }
  }

  const totalPages = Math.ceil(total/20) || 1

  return (
    <div>
      <div className="page-header"><h1 className="page-title">History</h1><p className="page-subtitle">Completed sessions</p></div>
      <form style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }} onSubmit={handleSearch}>
        <input className="form-input" style={{ flex:1, minWidth:160 }} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} />
        <input type="date" className="form-input" style={{ width:140 }} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
        <input type="date" className="form-input" style={{ width:140 }} value={dateTo} onChange={e=>setDateTo(e.target.value)} />
        <button type="submit" className="btn btn-ghost btn-sm">Search</button>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)', alignSelf:'center' }}>{total} records</span>
        <div style={{ position:'relative' }}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ borderColor:'var(--accent)', color:'var(--accent)' }} onClick={()=>setShowExportMenu(m=>!m)} disabled={exporting}>
            {exporting?<><span className="spinner" style={{width:12,height:12}}/> …</>:'↓ Export ▾'}
          </button>
          {showExportMenu && (
            <div style={{ position:'absolute', right:0, top:'calc(100% + 5px)', background:'var(--bg-card)', border:'1px solid var(--border-color)', borderRadius:'var(--radius-lg)', minWidth:200, zIndex:50, overflow:'hidden', boxShadow:'var(--shadow)' }}>
              {[['csv','📄 Download CSV'],['xlsx','📊 Download Excel']].map(([f,l]) => (
                <button key={f} onClick={()=>doExport(f)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'11px 14px', background:'transparent', border:'none', cursor:'pointer', color:'var(--text-primary)', fontSize:12, textAlign:'left', borderBottom:'1px solid var(--border-color)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-input)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      </form>
      <div className="card">
        {loading ? <div className="page-center"><div className="spinner" /></div> :
         tickets.length===0 ? <div className="empty-state"><span className="empty-icon">◷</span><p>No completed sessions.</p></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ticket</th><th>Vehicle</th><th>Customer</th><th>Slot</th><th>Entry</th><th>Exit</th><th>Duration</th><th>Fee</th><th>Payment</th></tr></thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id}>
                    <td><a href={`/receipt/${t.id}`} target="_blank" rel="noreferrer" style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--accent)', textDecoration:'none' }}>{t.ticket_id} ↗</a></td>
                    <td><strong className="mono">{t.vehicle_number}</strong></td>
                    <td><strong>{t.customer_name}</strong></td>
                    <td>{t.slot_code?<span className="slot-tag">{t.slot_code}</span>:'—'}</td>
                    <td style={{fontSize:11}}>{fmt(t.entry_time)}</td>
                    <td style={{fontSize:11}}>{fmt(t.exit_time)}</td>
                    <td className="mono" style={{fontSize:11}}>{fmtMins(t.duration_minutes)}</td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--green)'}}>{t.fee_amount?`₹${parseFloat(t.fee_amount).toFixed(2)}`:'—'}</td>
                    <td><span className="badge badge-gray" style={{textTransform:'uppercase'}}>{t.payment_method||'—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {totalPages>1 && (
        <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:14, alignItems:'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>p-1)} disabled={page===1}>← Prev</button>
          <span className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>Page {page} of {totalPages}</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>p+1)} disabled={page===totalPages}>Next →</button>
        </div>
      )}
    </div>
  )
}

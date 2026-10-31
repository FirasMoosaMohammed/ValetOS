import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getReceipt } from '../../api/ticketApi'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true})
}

export default function Receipt() {
  const { ticketId } = useParams()
  const [r, setR]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getReceipt(ticketId)
      .then(res => setR(res.data))
      .catch(() => setError('Receipt not found.'))
      .finally(() => setLoading(false))
  }, [ticketId])

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#555' }}><div style={{ width:20,height:20,border:'2px solid #ddd',borderTopColor:'#f59e0b',borderRadius:'50%',animation:'spin .65s linear infinite' }} /></div>
  if (error)   return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#dc2626' }}>{error}</div>

  const fee = parseFloat(r.fee_amount) || 0

  return (
    <div style={{ background:'#f4f4f5', minHeight:'100vh', padding:0, fontFamily:"'Inter', sans-serif" }}>
      {/* Print toolbar — hidden on print */}
      <div className="no-print" style={{ background:'#1a1a1a', borderBottom:'1px solid #333', padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 }}>
        <span style={{ fontFamily:"'Syne', sans-serif", fontSize:16, fontWeight:700, color:'#f59e0b', letterSpacing:-.3 }}>ValetOS Receipt</span>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>window.print()} style={{ padding:'7px 16px', background:'#f59e0b', border:'none', borderRadius:6, fontWeight:700, fontSize:12, cursor:'pointer', color:'#09090b' }}>🖨 Print / Save as PDF</button>
          <button onClick={()=>window.close()} style={{ padding:'7px 14px', background:'transparent', border:'1px solid #444', borderRadius:6, fontSize:12, cursor:'pointer', color:'#aaa' }}>✕ Close</button>
        </div>
      </div>

      {/* Receipt paper */}
      <div style={{ width:380, margin:'32px auto 0', background:'#ffffff', border:'1px solid #e0e0e0', borderRadius:12, padding:'32px 28px', boxShadow:'0 8px 32px rgba(0,0,0,.12)', color:'#1a1a1a', fontSize:13, lineHeight:1.6 }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:4 }}>
          <div style={{ display:'inline-flex', alignItems:'baseline' }}>
            <span style={{ fontFamily:"'Syne', sans-serif", fontSize:36, fontWeight:800, color:'#f59e0b', lineHeight:1 }}>V</span>
            <span style={{ fontFamily:"'Syne', sans-serif", fontSize:26, fontWeight:700, color:'#1a1a1a', letterSpacing:-1 }}>alet<span style={{color:'#888',fontWeight:400}}>OS</span></span>
          </div>
          <div style={{ fontSize:12, fontWeight:600, color:'#444', textTransform:'uppercase', letterSpacing:'.07em', marginTop:2 }}>Valet Parking Services</div>
          <div style={{ fontSize:11, color:'#999', marginTop:2 }}>Professional · Secure · Swift</div>
        </div>

        <div style={{ border:'none', borderTop:'2px dashed #ddd', margin:'16px 0' }} />

        {/* Meta */}
        {[['Receipt / Ticket', r.ticket_id, true],['Date', fmt(r.generated_at), false],['Attendant', r.valet_name, false]].map(([l,v,m]) => (
          <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}>
            <span style={{ fontSize:11, color:'#888' }}>{l}</span>
            <span style={{ fontSize:12, fontWeight:500, fontFamily:m?"'DM Mono',monospace":'inherit' }}>{v}</span>
          </div>
        ))}

        <div style={{ border:'none', borderTop:'1px solid #e8e8e8', margin:'14px 0' }} />

        {/* Customer */}
        <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.1em', textTransform:'uppercase', color:'#aaa', marginBottom:8 }}>Customer Details</div>
        {[[r.customer_name,'Customer'],[r.phone||'—','Phone'],[r.vehicle_number,'Vehicle No.','mono'],[r.vehicle_type,'Vehicle Type'],[`${r.slot_code} (Zone ${r.zone})`,'Slot']].map(([v,l,m]) => (
          <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}>
            <span style={{ fontSize:11, color:'#888' }}>{l}</span>
            <span style={{ fontSize:12, fontWeight:500, fontFamily:m?"'DM Mono',monospace":'inherit' }}>{v}</span>
          </div>
        ))}

        <div style={{ border:'none', borderTop:'1px solid #e8e8e8', margin:'14px 0' }} />

        {/* Parking details */}
        <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.1em', textTransform:'uppercase', color:'#aaa', marginBottom:8 }}>Parking Details</div>
        {[[fmt(r.entry_time),'Entry'],[fmt(r.exit_time),'Exit'],[r.duration_str,'Duration'],[`₹${r.rate_per_hour}/hour`,'Rate'],[`${r.grace_period_minutes} min (free)`,'Grace Period']].map(([v,l]) => (
          <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}>
            <span style={{ fontSize:11, color:'#888' }}>{l}</span>
            <span style={{ fontSize:12, fontWeight:500 }}>{v}</span>
          </div>
        ))}

        <div style={{ border:'none', borderTop:'2px dashed #ddd', margin:'14px 0' }} />

        {/* Fee */}
        <div style={{ background:'#fafafa', border:'1px solid #e8e8e8', borderRadius:8, padding:'12px 14px' }}>
          {fee === 0 && <div style={{ fontSize:11, color:'#22c55e', textAlign:'center', marginBottom:8, fontStyle:'italic' }}>Within grace period — no charge</div>}
          <div style={{ display:'flex', justifyContent:'space-between', paddingTop:8, borderTop:'1px solid #ddd', marginTop:fee>0?8:0 }}>
            <span style={{ fontSize:14, fontWeight:700 }}>Total Paid</span>
            <span style={{ fontFamily:"'Syne', sans-serif", fontSize:22, fontWeight:800, color:'#1a1a1a' }}>₹{fee.toFixed(2)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:6, marginTop:8, fontSize:11, color:'#888' }}>
            <span style={{ background:'#f0f0f0', border:'1px solid #ddd', borderRadius:4, padding:'1px 7px', fontFamily:"'DM Mono',monospace", letterSpacing:'.04em' }}>{(r.payment_method||'CASH').toUpperCase()}</span>
            <span style={{ background:'#dcfce7', border:'1px solid #bbf7d0', color:'#16a34a', borderRadius:4, padding:'1px 7px', fontFamily:"'DM Mono',monospace", letterSpacing:'.04em' }}>{(r.payment_status||'PAID').toUpperCase()}</span>
          </div>
        </div>

        <div style={{ border:'none', borderTop:'2px dashed #ddd', margin:'16px 0' }} />

        {/* Footer */}
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:"'Syne', sans-serif", fontSize:16, fontWeight:700, marginBottom:5 }}>Thank you for using ValetOS!</div>
          <div style={{ fontSize:11, color:'#aaa' }}>Please keep this receipt for your records.</div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:'#ccc', marginTop:14, letterSpacing:.5 }}>{r.ticket_id}</div>
        </div>
      </div>

      <div className="no-print" style={{ width:380, margin:'16px auto 40px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.2)', borderRadius:8, padding:'12px 16px', fontSize:12, color:'#555', lineHeight:1.6 }}>
        💡 Press <strong>Ctrl+P</strong> (Cmd+P on Mac) and select <em>"Save as PDF"</em> to download.
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html { background: #fff !important; margin: 0; padding: 0; }
          @page { size: A5 portrait; margin: 8mm; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

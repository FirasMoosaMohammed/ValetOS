import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { exitScan, completeExit, handover, getReceipt } from '../../api/ticketApi'
import { useToast } from '../../components/Toast'
import { useRFIDScanner } from '../../hooks/useRFIDScanner'
import RFIDStatusBar from '../../components/RFIDStatusBar'
import LostTokenModal from '../../components/LostTokenModal'
import { sendPrintCommand, formatReceiptForPrinter } from '../../utils/printReceipt'

function fmt(iso) { if(!iso) return '—'; return new Date(iso).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true}) }
function fmtMins(m) { return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m` }
function fmtINR(v) { const n=parseFloat(v); return isNaN(n)?'₹0.00':`₹${n.toFixed(2)}` }

export default function Exit() {
  const toast = useToast()
  const [uid, setUid]             = useState('')
  const [scanState, setScanState] = useState('idle')
  const [ticket, setTicket]       = useState(null)
  const [breakdown, setBreakdown] = useState(null)
  const [scanError, setScanError] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [submitting, setSubmitting] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)
  const [completedSession, setCompletedSession] = useState(null)

  const handleRFIDScan = useCallback(async (scannedUid) => {
    setUid(scannedUid); setScanState('loading'); setScanError(''); setTicket(null); setBreakdown(null)
    try {
      const r = await exitScan({ rfid_uid: scannedUid })
      setTicket(r.data); setBreakdown(r.data.fee_breakdown); setScanState('found')
    } catch (err) {
      setScanError(err.response?.data?.error||'Card/ticket not found.'); setScanState('error')
    }
  }, [])

  const { isConnected, isPrinterReady, sendPrint } = useRFIDScanner({ onScan: handleRFIDScan })

  const triggerScan = async (lookupUid) => {
    const target = (lookupUid||uid).trim()
    if (!target) return
    setScanState('loading'); setScanError(''); setTicket(null); setBreakdown(null)
    try {
      const r = await exitScan({ rfid_uid: target })
      setTicket(r.data); setBreakdown(r.data.fee_breakdown); setScanState('found')
    } catch (err) {
      setScanError(err.response?.data?.error||'Card/ticket not found.'); setScanState('error')
    }
  }

  const handleCompleteExit = async () => {
    setSubmitting(true)
    try {
      const r = await completeExit({ ticket_id: ticket.ticket_id, payment_method: payMethod })
      setTicket(r.data); setScanState('retrieval')
      toast.success('Fee collected. Valet assigned for retrieval.')
    } catch (err) { toast.error(err.response?.data?.error||'Failed.') }
    finally { setSubmitting(false) }
  }

  const handleHandover = async () => {
    setSubmitting(true)
    try {
      const r = await handover(ticket.id)
      setTicket(r.data); setScanState('completed')
      // Fetch receipt data for printer
      try {
        const rr = await getReceipt(ticket.id)
        setCompletedSession(rr.data)
      } catch {}
      toast.success('Handover complete!')
    } catch (err) { toast.error(err.response?.data?.error||'Handover failed.') }
    finally { setSubmitting(false) }
  }

  const handlePrint = () => {
    if (completedSession) {
      sendPrintCommand(formatReceiptForPrinter(completedSession), sendPrint, ticket?.id)
    }
  }

  // Lost token verified → scan using that card's UID
  const handleLostVerified = async (verifiedCard) => {
    setShowLostModal(false)
    setUid(verifiedCard.uid)
    await triggerScan(verifiedCard.uid)
  }

  const reset = () => {
    setUid(''); setScanState('idle'); setTicket(null); setBreakdown(null)
    setScanError(''); setCompletedSession(null)
  }

  return (
    <div>
      <div className="flex-between page-header">
        <div><h1 className="page-title">Vehicle Exit</h1><p className="page-subtitle">Scan RFID → fee → retrieval → handover</p></div>
        <button className="btn btn-ghost btn-sm" style={{ borderColor:'var(--orange)',color:'var(--orange)' }} onClick={()=>setShowLostModal(true)}>🔑 Lost Token</button>
      </div>

      <RFIDStatusBar isConnected={isConnected} isPrinterReady={isPrinterReady} />

      <div style={{ display:'flex',flexDirection:'column',gap:14,maxWidth:620 }}>
        {/* Scan */}
        {(scanState==='idle'||scanState==='error'||scanState==='loading')&&(
          <div className="card">
            <div style={{ fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--accent)',marginBottom:8 }}>Step 1 — RFID Scan</div>
            {isConnected?(
              <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'var(--green-dim)',border:'1px solid rgba(34,197,94,.25)',borderRadius:'var(--radius)',marginBottom:12,fontSize:12,color:'var(--green)' }}>
                <span style={{ width:8,height:8,borderRadius:'50%',background:'var(--green)',animation:'pulse-g 1.5s infinite',flexShrink:0 }} />
                Waiting for RFID scan…
              </div>
            ):(
              <p style={{ fontSize:12,color:'var(--text-muted)',marginBottom:10 }}>Bridge not connected — manual input:</p>
            )}
            <div style={{ display:'flex',gap:10,marginBottom:10 }}>
              <input className="form-input rfid" style={{ flex:1 }} placeholder="Scan or type RFID UID…" value={uid} autoFocus
                onKeyDown={e=>e.key==='Enter'&&triggerScan()}
                onChange={e=>{ setUid(e.target.value); setScanState('idle'); setTicket(null) }} />
            </div>
            <button className="btn btn-primary" onClick={()=>triggerScan()} disabled={!uid.trim()||scanState==='loading'}>
              {scanState==='loading'?<><span className="spinner" style={{width:13,height:13}}/> Looking up…</>:'Find Ticket →'}
            </button>
            {scanState==='error'&&<div className="alert alert-error mt-8">{scanError}</div>}
          </div>
        )}

        {/* Fee review */}
        {scanState==='found'&&ticket&&(
          <div className="card" style={{ borderColor:ticket.is_vip?'rgba(245,158,11,.4)':'rgba(239,68,68,.25)' }}>
            <div style={{ fontFamily:'var(--font-mono)',fontSize:9,textTransform:'uppercase',letterSpacing:'.12em',color:'var(--accent)',marginBottom:10,display:'flex',gap:10,alignItems:'center' }}>
              Step 2 — Ticket &amp; Fee
              {ticket.is_vip&&<span style={{ background:'var(--accent-dim)',border:'1px solid var(--accent-border)',color:'var(--accent)',borderRadius:4,padding:'1px 8px',fontSize:10 }}>⭐ VIP</span>}
            </div>
            <div style={{ textAlign:'center',marginBottom:14 }}>
              <div style={{ fontFamily:'var(--font-display)',fontSize:26,fontWeight:800,color:'var(--red)',letterSpacing:'.04em' }}>{ticket.vehicle_number}</div>
              <div style={{ fontSize:13,color:'var(--text-secondary)' }}>{ticket.customer_name}</div>
            </div>
            {[['Ticket ID',ticket.ticket_id,true],['Slot',ticket.slot_code?`${ticket.slot_code} · Zone ${ticket.zone}`:'—',false],['Entry',fmt(ticket.entry_time),false],['Duration',fmtMins(ticket.duration_minutes),false]].map(([l,v,m])=>(
              <div key={l} style={{ display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-color)' }}>
                <span style={{ fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text-muted)' }}>{l}</span>
                <span style={{ fontSize:12,fontWeight:500,color:'var(--text-primary)',fontFamily:m?'var(--font-mono)':'inherit' }}>{v}</span>
              </div>
            ))}
            {breakdown&&(
              <div style={{ marginTop:14,background:'var(--bg-input)',border:'1px solid var(--border-color)',borderRadius:'var(--radius)',padding:'12px 14px' }}>
                <div style={{ fontFamily:'var(--font-mono)',fontSize:9,textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8 }}>Fee Breakdown</div>
                {[['Rate',`₹${breakdown.rate_per_hour}/hr`],['Grace',`${breakdown.grace_minutes} min free`],['Duration',fmtMins(breakdown.total_minutes)],['Billable',fmtMins(breakdown.billable_minutes)]].map(([l,v])=>(
                  <div key={l} style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text-secondary)',padding:'3px 0' }}>
                    <span>{l}</span><span className="mono">{v}</span>
                  </div>
                ))}
                <div style={{ borderTop:'1px dashed var(--border-color)',marginTop:8,paddingTop:8,display:'flex',justifyContent:'space-between' }}>
                  <span style={{ fontWeight:600 }}>Total</span>
                  <span style={{ fontFamily:'var(--font-display)',fontSize:22,fontWeight:800,color:'var(--accent)' }}>{fmtINR(breakdown.total_fee)}</span>
                </div>
              </div>
            )}
            <div className="form-group mt-14">
              <label className="form-label">Payment Method</label>
              <div style={{ display:'flex',gap:8 }}>
                {['cash','card','upi'].map(m=>(
                  <button key={m} type="button" onClick={()=>setPayMethod(m)} style={{ flex:1,padding:'9px 6px',background:payMethod===m?'var(--accent-dim)':'var(--bg-input)',border:`1px solid ${payMethod===m?'var(--accent)':'var(--border-color)'}`,borderRadius:'var(--radius)',color:payMethod===m?'var(--accent)':'var(--text-secondary)',cursor:'pointer',fontFamily:'var(--font-display)',fontWeight:700,fontSize:12,transition:'all var(--transition)' }}>
                    {m==='cash'?'💵':m==='card'?'💳':'📱'} {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-danger btn-full btn-lg" onClick={handleCompleteExit} disabled={submitting}>
              {submitting?<><span className="spinner" style={{width:13,height:13}}/> Processing…</>:`↗ Confirm Exit · ${fmtINR(breakdown?.total_fee||0)}`}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ marginTop:8,width:'100%',justifyContent:'center' }} onClick={reset}>Cancel</button>
          </div>
        )}

        {/* Retrieval pending */}
        {scanState==='retrieval'&&ticket&&(
          <div className="card" style={{ textAlign:'center',padding:32 }}>
            <div style={{ fontSize:32,marginBottom:12 }}>🔔</div>
            <div style={{ fontFamily:'var(--font-display)',fontSize:18,fontWeight:800,marginBottom:6 }}>Valet Notified</div>
            <p style={{ fontSize:13,color:'var(--text-secondary)',marginBottom:20 }}>
              Retrieving <strong>{ticket.vehicle_number}</strong> from slot <strong>{ticket.slot_code}</strong>
            </p>
            <div style={{ background:'var(--bg-input)',border:'1px solid var(--border-color)',borderRadius:'var(--radius)',padding:'10px 16px',marginBottom:16,display:'inline-block' }}>
              <span style={{ fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-secondary)' }}>Fee: </span>
              <span style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:18,color:'var(--green)' }}>{fmtINR(ticket.fee_amount)} via {ticket.payment_method?.toUpperCase()}</span>
            </div>
            <br/>
            <button className="btn btn-success btn-lg" onClick={handleHandover} disabled={submitting||ticket.status!=='retrieved'}>
              {submitting?'…':'✓ Complete Handover'}
            </button>
            {ticket.status!=='retrieved'&&<p style={{ fontSize:11,color:'var(--text-muted)',marginTop:8 }}>Waiting for valet to confirm retrieval…</p>}
          </div>
        )}

        {/* Completed */}
        {scanState==='completed'&&ticket&&(
          <div className="card" style={{ textAlign:'center',padding:36 }}>
            <div style={{ width:56,height:56,borderRadius:'50%',background:'var(--green-dim)',border:'2px solid var(--green)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:'var(--green)',margin:'0 auto 14px' }}>✓</div>
            <div style={{ fontFamily:'var(--font-display)',fontSize:20,fontWeight:800,marginBottom:6 }}>Handover Complete</div>
            <p style={{ fontSize:13,color:'var(--text-secondary)',marginBottom:20 }}>{ticket.ticket_id} · {ticket.customer_name}</p>
            <div style={{ display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap' }}>
              <button className="btn btn-primary" onClick={handlePrint}>
                {isPrinterReady?'🖨 Print (Thermal)':'🖨 Print Receipt'}
              </button>
              <a href={`/receipt/${ticket.id}`} target="_blank" rel="noreferrer" className="btn btn-ghost">↗ Open Receipt</a>
              <button className="btn btn-ghost" onClick={reset}>Next Vehicle</button>
            </div>
          </div>
        )}
      </div>

      {showLostModal&&<LostTokenModal purpose="lost_token_exit" onVerified={handleLostVerified} onClose={()=>setShowLostModal(false)} />}
      <style>{`@keyframes pulse-g{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}`}</style>
    </div>
  )
}

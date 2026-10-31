import { useState, useEffect, useCallback } from 'react'
import { entryLookup, ticketEntry } from '../../api/ticketApi'
import { getAvailableSlots } from '../../api/slotApi'
import { useToast } from '../../components/Toast'
import { useRFIDScanner } from '../../hooks/useRFIDScanner'
import RFIDStatusBar from '../../components/RFIDStatusBar'
import LostTokenModal from '../../components/LostTokenModal'

const VEHICLE_TYPES = ['car','suv','bike','truck','other']
const VT_ICONS = { car:'🚗', suv:'🚙', bike:'🏍', truck:'🚛', other:'🚐' }
const getSlotCategory = value => (value || 'standard').toLowerCase()

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border-color)' }}>
      <span style={{ fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize:12,fontWeight:500,color:'var(--text-primary)',fontFamily:mono?'var(--font-mono)':'inherit' }}>{value}</span>
    </div>
  )
}

export default function Entry() {
  const toast = useToast()
  const [uid, setUid]               = useState('')
  const [scanState, setScanState]   = useState('idle')
  const [card, setCard]             = useState(null)
  const [scanError, setScanError]   = useState('')
  const [newCustomer, setNewCustomer] = useState({ customer_name:'',vehicle_number:'',vehicle_type:'car',phone:'' })
  const [availCount, setAvailCount] = useState(null)
  const [notes, setNotes]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]         = useState(null)
  const [showLostModal, setShowLostModal] = useState(false)

  const triggerLookup = async (lookupUid) => {
    const target = (lookupUid||uid).trim()
    if (!target) return
    setScanState('loading'); setScanError(''); setCard(null); setResult(null)
    try {
      const r = await entryLookup(target)
      const d = r.data
      if (!d.found) { setScanState('new'); return }
      if (d.flagged) { setScanError(`🚫 Card flagged: ${d.flag_reason}`); setScanState('error'); return }
      if (d.card?.active_ticket_id) { setScanError(`Vehicle already has active ticket ${d.card.active_ticket_id}`); setScanState('error'); return }
      setCard(d.card); setScanState('found')
    } catch { setScanError('Lookup failed.'); setScanState('error') }
  }

  const handleRFIDScan = useCallback((scannedUid) => {
    setUid(scannedUid)
    triggerLookup(scannedUid)
  }, [])

  const { isConnected, isPrinterReady } = useRFIDScanner({ onScan: handleRFIDScan })

  const vehicleType = card?.vehicle_type || newCustomer.vehicle_type
  const isVip = card?.is_vip ?? false
  useEffect(() => {
    if (scanState !== 'found' && scanState !== 'new') return
    getAvailableSlots(vehicleType, isVip).then(r => setAvailCount(r.data.total_available)).catch(() => setAvailCount(null))
  }, [scanState, vehicleType, isVip])

  const handleSubmit = async e => {
    e?.preventDefault(); setSubmitting(true)
    try {
      const payload = { rfid_uid: uid.trim(), notes }
      if (!uid.trim()) { toast.error('RFID UID is required.'); setSubmitting(false); return }
      if (scanState === 'new') {
        if (!newCustomer.customer_name.trim()||!newCustomer.vehicle_number.trim()) { toast.error('Name and vehicle required.'); setSubmitting(false); return }
        if (!newCustomer.vehicle_type) { toast.error('Vehicle type is required.'); setSubmitting(false); return }
        Object.assign(payload, { ...newCustomer, vehicle_number: newCustomer.vehicle_number.toUpperCase() })
      }
      const r = await ticketEntry(payload)
      setResult(r.data)
    } catch (err) {
      const msg = err.response?.data?.message||err.response?.data?.error||'Entry failed.'
      toast.error(msg)
    } finally { setSubmitting(false) }
  }

  const handleLostVerified = (verifiedCard) => {
    setShowLostModal(false)
    setUid(verifiedCard.uid); setCard(verifiedCard); setScanState('found'); setScanError(''); setResult(null)
  }

  const reset = () => {
    setUid(''); setScanState('idle'); setCard(null); setScanError('')
    setNewCustomer({ customer_name:'',vehicle_number:'',vehicle_type:'car',phone:'' })
    setAvailCount(null); setNotes(''); setResult(null)
  }

  if (result) {
    const { slot_queued, valet_queued, vip_fallback, is_vip_fallback, is_vip, slot_category, ticket_id, vehicle_number, customer_name, slot, assigned_valet, auto_assigned, queue_position } = result
    const normalizedSlotCategory = getSlotCategory(slot_category)
    const hasVipFallback = is_vip_fallback === true || vip_fallback === true
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Vehicle Entry</h1></div>
        <div className="card" style={{ maxWidth:500,textAlign:'center',padding:40 }}>
          <div style={{ width:56,height:56,borderRadius:'50%',background:'var(--green-dim)',border:'2px solid var(--green)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:'var(--green)',margin:'0 auto 16px' }}>✓</div>
          <div style={{ fontFamily:'var(--font-display)',fontSize:20,fontWeight:800,marginBottom:8 }}>Ticket Created</div>
          <div style={{ background:'var(--bg-input)',border:'1px solid var(--border-color)',borderRadius:'var(--radius-lg)',padding:'14px 20px',marginBottom:14 }}>
            <div style={{ fontFamily:'var(--font-mono)',fontSize:18,fontWeight:700,color:'var(--accent)',letterSpacing:'.06em' }}>{ticket_id}</div>
            <div style={{ fontSize:12,color:'var(--text-secondary)',marginTop:4 }}>
              {vehicle_number} · {customer_name}
              {is_vip&&<span style={{ marginLeft:8,color:'var(--accent)' }}>⭐ VIP</span>}
            </div>
          </div>
          {!slot_queued&&!valet_queued&&(
            <div style={{ display:'flex',gap:12,justifyContent:'center',marginBottom:14,flexWrap:'wrap' }}>
              <div style={{ background:normalizedSlotCategory==='vip'?'rgba(245,158,11,.15)':'var(--accent-dim)',border:normalizedSlotCategory==='vip'?'2px solid var(--accent)':'1px solid var(--accent-border)',borderRadius:'var(--radius)',padding:'12px 18px',textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-mono)',fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'var(--text-muted)',marginBottom:4 }}>
                  {normalizedSlotCategory==='vip'?'⭐ VIP Slot':'Assigned Slot'}
                </div>
                <div style={{ fontFamily:'var(--font-display)',fontSize:24,fontWeight:800,color:'var(--accent)' }}>{slot?.slot_code||'—'}</div>
                <div style={{ fontSize:11,color:'var(--text-muted)' }}>Zone {slot?.zone}</div>
              </div>
              <div style={{ background:'var(--blue-dim)',border:'1px solid rgba(59,130,246,.3)',borderRadius:'var(--radius)',padding:'12px 18px',textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-mono)',fontSize:9,textTransform:'uppercase',letterSpacing:'.1em',color:'var(--text-muted)',marginBottom:4 }}>Assigned Valet</div>
                <div style={{ fontFamily:'var(--font-display)',fontSize:18,fontWeight:800,color:'var(--blue)' }}>{assigned_valet?.first_name||assigned_valet?.username||'—'}</div>
                {!auto_assigned&&<div style={{ fontSize:10,color:'var(--orange)' }}>⚠ No one on shift</div>}
              </div>
            </div>
          )}
          {is_vip&&hasVipFallback&&<div className="alert alert-warn">⚠ No VIP slots available — assigned standard slot {slot?.slot_code}</div>}
          {is_vip&&!hasVipFallback&&slot&&<div className="alert alert-warn" style={{background:'rgba(245,158,11,.12)',borderColor:'var(--accent)',color:'var(--accent)'}}>&#11088; VIP Slot Assigned — {slot?.slot_code}</div>}
          {slot_queued&&<div className="alert alert-warn">No slot — queued (position {queue_position})</div>}
          {valet_queued&&<div className="alert alert-warn">No valet on shift — in valet queue</div>}
          <button className="btn btn-ghost" onClick={reset}>↩ Next Vehicle</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex-between page-header">
        <div><h1 className="page-title">Vehicle Entry</h1><p className="page-subtitle">Scan RFID → slot &amp; valet auto-assigned</p></div>
        <button className="btn btn-ghost btn-sm" style={{ borderColor:'var(--orange)',color:'var(--orange)' }} onClick={()=>setShowLostModal(true)}>🔑 Lost Token</button>
      </div>

      <RFIDStatusBar isConnected={isConnected} isPrinterReady={isPrinterReady} />

      <div style={{ display:'flex',flexDirection:'column',gap:14,maxWidth:600 }}>
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
              onKeyDown={e=>e.key==='Enter'&&triggerLookup()} onChange={e=>{ setUid(e.target.value); setScanState('idle'); setCard(null) }} />
          </div>
          <div style={{ display:'flex',gap:8 }}>
            <button className="btn btn-primary" onClick={()=>triggerLookup()} disabled={!uid.trim()||scanState==='loading'}>
              {scanState==='loading'?<><span className="spinner" style={{width:13,height:13}}/> Looking up…</>:'Look Up →'}
            </button>
            {(card||scanState==='new'||scanState==='error')&&<button className="btn btn-ghost" onClick={reset}>Clear</button>}
          </div>
          {scanState==='error'&&<div className="alert alert-error mt-8">{scanError}</div>}
        </div>

        {scanState==='found'&&card&&(
          <div className="card" style={{ borderColor:card.is_vip?'rgba(245,158,11,.4)':undefined }}>
            <div style={{ fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--accent)',marginBottom:10,display:'flex',alignItems:'center',gap:10 }}>
              Step 2 — Customer Info
              {card.is_vip&&<span style={{ background:'var(--accent-dim)',border:'1px solid var(--accent-border)',color:'var(--accent)',borderRadius:4,padding:'1px 8px',fontSize:10 }}>⭐ VIP</span>}
            </div>
            <InfoRow label="Customer"    value={card.customer_name} />
            <InfoRow label="Vehicle No." value={card.vehicle_number} mono />
            <InfoRow label="Type"        value={`${VT_ICONS[card.vehicle_type]} ${card.vehicle_type}`} />
            <InfoRow label="Phone"       value={card.phone||'—'} />
            {card.is_vip&&card.vip_notes&&<div style={{ marginTop:10,padding:'8px 12px',background:'rgba(245,158,11,.08)',border:'1px solid var(--accent-border)',borderRadius:'var(--radius)',fontSize:12,color:'var(--accent)' }}>📋 {card.vip_notes}</div>}
            <div style={{ marginTop:10,padding:'8px 12px',background:availCount===0?'var(--red-dim)':'var(--green-dim)',border:`1px solid ${availCount===0?'rgba(239,68,68,.3)':'rgba(34,197,94,.3)'}`,borderRadius:'var(--radius)',fontSize:12,color:availCount===0?'var(--red)':'var(--green)' }}>
              {availCount===null?'⋯ Checking…':availCount===0?`⚠ No slots — will queue`:`✓ ${availCount} slot${availCount!==1?'s':''} available`}
            </div>
          </div>
        )}

        {scanState==='new'&&(
          <div className="card">
            <div style={{ fontFamily:'var(--font-mono)',fontSize:9,textTransform:'uppercase',letterSpacing:'.12em',color:'var(--orange)',marginBottom:6 }}>Step 2 — New Customer</div>
            <div className="alert alert-info" style={{ marginBottom:12 }}>Card not found — register to proceed.</div>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Customer Name *</label><input className="form-input" value={newCustomer.customer_name} onChange={e=>setNewCustomer(n=>({...n,customer_name:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={newCustomer.phone} onChange={e=>setNewCustomer(n=>({...n,phone:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Vehicle Number *</label><input className="form-input mono" value={newCustomer.vehicle_number} onChange={e=>setNewCustomer(n=>({...n,vehicle_number:e.target.value.toUpperCase()}))} /></div>
              <div className="form-group"><label className="form-label">Vehicle Type</label><select className="form-select" value={newCustomer.vehicle_type} onChange={e=>setNewCustomer(n=>({...n,vehicle_type:e.target.value}))}>{VEHICLE_TYPES.map(t=><option key={t} value={t}>{VT_ICONS[t]} {t}</option>)}</select></div>
            </div>
          </div>
        )}

        {(scanState==='found'||scanState==='new')&&(
          <div className="card">
            <div style={{ fontFamily:'var(--font-mono)',fontSize:9,textTransform:'uppercase',letterSpacing:'.12em',color:'var(--accent)',marginBottom:10 }}>Step 3 — Confirm Entry</div>
            <div className="form-group"><label className="form-label">Notes (optional)</label><textarea className="form-textarea" value={notes} onChange={e=>setNotes(e.target.value)} /></div>
            <button className="btn btn-success btn-full btn-lg" onClick={handleSubmit} disabled={submitting||availCount===0}>
              {submitting?<><span className="spinner" style={{width:13,height:13}}/> Processing…</>:'⚡ Process Entry'}
            </button>
            <p style={{ textAlign:'center',fontSize:11,color:'var(--text-muted)',marginTop:8 }}>Slot &amp; valet auto-assigned</p>
          </div>
        )}
      </div>

      {showLostModal&&<LostTokenModal purpose="lost_token_entry" onVerified={handleLostVerified} onClose={()=>setShowLostModal(false)} />}
      <style>{`@keyframes pulse-g{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}`}</style>
    </div>
  )
}

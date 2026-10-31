import { useState, useEffect } from 'react'
import { getRFIDCards, createRFIDCard, flagCard, lostToken, verifyOTP, setVIP } from '../../api/staffApi'
import { otpSend, otpVerify, otpCustomerLookup } from '../../api/staffApi'
import { useToast } from '../../components/Toast'
import LostTokenModal from '../../components/LostTokenModal'

const VTS = ['car','suv','bike','truck','other']
const EMPTY = { uid:'', customer_name:'', vehicle_number:'', vehicle_type:'car', phone:'' }

export default function RFIDCards() {
  const toast = useToast()
  const [cards, setCards]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [showLostModal, setShowLostModal] = useState(false)
  const [vipEditing, setVipEditing] = useState({})    // { [cardId]: { is_vip, vip_notes } }
  const [vipSaving, setVipSaving]   = useState(null)  // cardId being saved

  const load = async q => {
    setLoading(true)
    try { const r = await getRFIDCards(q||''); setCards(r.data.results ?? r.data) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const handleSearch = e => { e.preventDefault(); load(search) }

  const validate = () => {
    const e = {}
    if (!form.uid.trim()) e.uid = 'Required.'
    if (!form.customer_name.trim()) e.customer_name = 'Required.'
    if (!form.vehicle_number.trim()) e.vehicle_number = 'Required.'
    return e
  }

  const handleSave = async e => {
    e.preventDefault()
    const errs = validate(); if (Object.keys(errs).length) { setFormErrors(errs); return }
    setSaving(true)
    try {
      await createRFIDCard({...form, vehicle_number: form.vehicle_number.toUpperCase()})
      toast.success('Card registered.')
      setShowForm(false); setForm(EMPTY); load()
    } catch (err) {
      const d = err.response?.data
      if (d) setFormErrors(Object.fromEntries(Object.entries(d).map(([k,v])=>[k,Array.isArray(v)?v[0]:v])))
      else toast.error('Failed.')
    } finally { setSaving(false) }
  }

  const handleFlag = async (card) => {
    const flagging = !card.is_flagged
    const reason = flagging ? (window.prompt('Reason for flagging:') || '') : ''
    try { await flagCard(card.id, { is_flagged:flagging, flag_reason:reason }); toast.success(flagging?'Flagged.':'Unflagged.'); load(search) }
    catch { toast.error('Failed.') }
  }

  // VIP inline edit
  const startVipEdit = (card) => {
    setVipEditing(prev => ({
      ...prev,
      [card.id]: { is_vip: card.is_vip, vip_notes: card.vip_notes || '' }
    }))
  }
  const cancelVipEdit = (cardId) => {
    setVipEditing(prev => { const n={...prev}; delete n[cardId]; return n })
  }
  const handleVipSave = async (cardId) => {
    const data = vipEditing[cardId]
    if (!data) return
    setVipSaving(cardId)
    try {
      await setVIP(cardId, data)
      toast.success(data.is_vip ? '⭐ VIP enabled.' : 'VIP removed.')
      cancelVipEdit(cardId)
      load(search)
    } catch { toast.error('Failed to update VIP status.') }
    finally { setVipSaving(null) }
  }

  const editing = (cardId) => vipEditing[cardId]

  return (
    <div>
      <div className="flex-between page-header">
        <div><h1 className="page-title">RFID Cards</h1><p className="page-subtitle">Register and manage customer cards</p></div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost btn-sm" style={{ borderColor:'var(--orange)',color:'var(--orange)' }} onClick={()=>setShowLostModal(true)}>🔑 Lost Token</button>
          <button className="btn btn-primary" onClick={()=>{setShowForm(s=>!s)}}>{showForm?'✕ Cancel':'+ Register Card'}</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom:14 }}>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:14,marginBottom:12,paddingBottom:10,borderBottom:'1px solid var(--border-color)' }}>Register New RFID Card</div>
          <form onSubmit={handleSave}>
            <div className="form-row-2">
              {[['uid','UID *','mono'],['customer_name','Customer Name *',''],['vehicle_number','Vehicle No. *','mono'],['phone','Phone','']].map(([n,l,cls])=>(
                <div key={n} className="form-group">
                  <label className="form-label">{l}</label>
                  <input name={n} className={`form-input${cls?' '+cls:''}`} value={form[n]} onChange={e=>setForm(f=>({...f,[n]:n==='vehicle_number'?e.target.value.toUpperCase():e.target.value}))} />
                  {formErrors[n]&&<span className="field-error">{formErrors[n]}</span>}
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Vehicle Type</label>
                <select className="form-select" value={form.vehicle_type} onChange={e=>setForm(f=>({...f,vehicle_type:e.target.value}))}>{VTS.map(t=><option key={t} value={t}>{t}</option>)}</select>
              </div>
            </div>
            <div style={{ display:'flex',gap:8,paddingTop:12,borderTop:'1px solid var(--border-color)' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':'✓ Register'}</button>
              <button type="button" className="btn btn-ghost" onClick={()=>{setShowForm(false);setForm(EMPTY)}}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <form style={{ display:'flex',gap:8,marginBottom:14 }} onSubmit={handleSearch}>
        <input className="form-input" style={{ flex:1 }} placeholder="Search by UID, name, vehicle, phone…" value={search} onChange={e=>setSearch(e.target.value)} />
        <button type="submit" className="btn btn-ghost btn-sm">Search</button>
        {search&&<button type="button" className="btn btn-ghost btn-sm" onClick={()=>{setSearch('');load('')}}>Clear</button>}
      </form>

      <div className="card">
        {loading ? <div className="page-center"><div className="spinner" /></div> :
         cards.length===0 ? <div className="empty-state"><span className="empty-icon">▣</span><p>No cards yet.</p></div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>UID</th><th>Customer</th><th>Vehicle</th><th>VIP</th><th>Active Ticket</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {cards.map(c => {
                  const ed = editing(c.id)
                  return (
                    <tr key={c.id} style={{ opacity:c.is_active?1:.55, background:c.is_vip?'rgba(245,158,11,.04)':undefined }}>
                      <td><span className="mono text-accent" style={{fontSize:11}}>{c.uid}</span></td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          {c.is_vip&&<span style={{fontSize:13}}>⭐</span>}
                          <div>
                            <strong>{c.customer_name}</strong>
                            <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.vehicle_number} · {c.vehicle_type}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div><strong className="mono">{c.vehicle_number}</strong></div>
                        <div style={{fontSize:10,color:'var(--text-muted)'}}>{c.phone||'—'}</div>
                      </td>
                      {/* VIP column */}
                      <td>
                        {ed ? (
                          <div style={{display:'flex',flexDirection:'column',gap:6,minWidth:200}}>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <label style={{fontSize:12,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                                <input type="checkbox" checked={ed.is_vip} onChange={e=>setVipEditing(prev=>({...prev,[c.id]:{...prev[c.id],is_vip:e.target.checked}}))} />
                                VIP
                              </label>
                            </div>
                            {ed.is_vip&&(
                              <input className="form-input" style={{fontSize:11,padding:'4px 8px'}} placeholder="VIP notes…" value={ed.vip_notes} onChange={e=>setVipEditing(prev=>({...prev,[c.id]:{...prev[c.id],vip_notes:e.target.value}}))} />
                            )}
                            <div style={{display:'flex',gap:5}}>
                              <button className="btn btn-success btn-sm" onClick={()=>handleVipSave(c.id)} disabled={vipSaving===c.id}>{vipSaving===c.id?'…':'✓'}</button>
                              <button className="btn btn-ghost btn-sm" onClick={()=>cancelVipEdit(c.id)}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span className={`badge ${c.is_vip?'badge-amber':'badge-gray'}`}>{c.is_vip?'⭐ VIP':'Standard'}</span>
                            <button className="btn btn-ghost btn-sm" style={{padding:'2px 7px',fontSize:10}} onClick={()=>startVipEdit(c)}>Edit</button>
                          </div>
                        )}
                      </td>
                      <td>{c.active_ticket_id?<span className="badge badge-amber">{c.active_ticket_id}</span>:<span style={{color:'var(--text-muted)',fontSize:11}}>—</span>}</td>
                      <td>{c.is_flagged?<span className="badge badge-red">🚩 Flagged</span>:<span className="badge badge-green">Active</span>}</td>
                      <td>
                        <button className={`btn btn-sm ${c.is_flagged?'btn-success':'btn-warning'}`} onClick={()=>handleFlag(c)}>
                          {c.is_flagged?'Unflag':'Flag'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showLostModal && <LostTokenModal purpose="lost_token_entry" onVerified={()=>setShowLostModal(false)} onClose={()=>setShowLostModal(false)} />}
    </div>
  )
}

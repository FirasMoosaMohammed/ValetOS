import { useState, useEffect } from 'react'
import { getSlots, createSlot, deleteSlot } from '../../api/slotApi'
import { useToast } from '../../components/Toast'

const ZONES = ['A','B','C','D','VIP']
const SLOT_TYPES = [
  { value:'any',  label:'Any Vehicle' },
  { value:'car',  label:'Car / SUV'   },
  { value:'bike', label:'Bike Only'   },
  { value:'van',  label:'Van / Truck' },
]
const SLOT_CATEGORIES = [
  { value:'standard', label:'Standard' },
  { value:'vip',      label:'VIP ⭐'   },
  { value:'disabled', label:'Disabled' },
]
const CAT_STYLE = {
  standard: { bg:'var(--bg-input)',   color:'var(--text-muted)', border:'var(--border-color)' },
  vip:      { bg:'rgba(245,158,11,.12)', color:'var(--accent)', border:'rgba(245,158,11,.35)' },
  disabled: { bg:'var(--blue-dim)',   color:'var(--blue)',       border:'rgba(59,130,246,.3)'  },
}
const ST_STYLE = {
  any:  { bg:'var(--bg-input)',   color:'var(--text-muted)', border:'var(--border-color)' },
  car:  { bg:'var(--blue-dim)',   color:'var(--blue)',       border:'rgba(59,130,246,.3)' },
  bike: { bg:'var(--green-dim)',  color:'var(--green)',      border:'rgba(34,197,94,.3)'  },
  van:  { bg:'var(--purple-dim)', color:'var(--purple)',     border:'rgba(168,85,247,.3)' },
}
const getSlotCategory = cat => (cat || 'standard').toLowerCase()
const syncZoneCategory = data => data.zone === 'VIP' ? { ...data, slot_category:'vip' } : data

function SlotTypeBadge({ t }) {
  const s = ST_STYLE[t] || ST_STYLE.any
  const l = SLOT_TYPES.find(x=>x.value===t)?.label || t
  return <span style={{ display:'inline-block', fontFamily:'var(--font-mono)', fontSize:9, fontWeight:500, letterSpacing:'.06em', padding:'2px 7px', borderRadius:4, background:s.bg, color:s.color, border:`1px solid ${s.border}`, textTransform:'uppercase' }}>{l}</span>
}

function CategoryBadge({ cat }) {
  const normalized = getSlotCategory(cat)
  const s = CAT_STYLE[normalized] || CAT_STYLE.standard
  const l = SLOT_CATEGORIES.find(x=>x.value===normalized)?.label || normalized
  return <span style={{ display:'inline-block', fontFamily:'var(--font-mono)', fontSize:9, fontWeight:500, letterSpacing:'.06em', padding:'2px 7px', borderRadius:4, background:s.bg, color:s.color, border:`1px solid ${s.border}`, textTransform:'uppercase' }}>{l}</span>
}

const EMPTY = { slot_code:'', zone:'A', slot_type:'any', slot_category:'standard', notes:'' }
const EMPTY_BULK = { zone:'A', slot_type:'any', slot_category:'standard', prefix:'', start:1, end:10 }

export default function Slots() {
  const toast = useToast()
  const [slots, setSlots]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [filterZone, setFilterZone] = useState('')
  const [filterOcc, setFilterOcc] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [showBulk, setShowBulk]   = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving]       = useState(false)
  const [bulkForm, setBulkForm]   = useState(EMPTY_BULK)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMsg, setBulkMsg]     = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterZone) params.zone = filterZone
      if (filterOcc !== '') params.occupied = filterOcc
      if (filterCat) params.category = filterCat
      const r = await getSlots(params)
      setSlots(r.data.results ?? r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterZone, filterOcc, filterCat])

  const handleSave = async e => {
    e.preventDefault()
    if (!form.slot_code.trim()) { setFormErrors({ slot_code:'Required.' }); return }
    setSaving(true)
    try {
      await createSlot(syncZoneCategory({ ...form, slot_code: form.slot_code.toUpperCase() }))
      toast.success(`Slot ${form.slot_code.toUpperCase()} created.`)
      setShowForm(false); setForm(EMPTY); load()
    } catch (err) {
      const d = err.response?.data
      if (d?.slot_code) toast.error(d.slot_code[0])
      else toast.error('Failed to create slot.')
    } finally { setSaving(false) }
  }

  const handleBulk = async e => {
    e.preventDefault()
    setBulkLoading(true); setBulkMsg(null)
    const normalizedBulk = syncZoneCategory(bulkForm)
    const { zone, slot_type, slot_category, prefix, start, end } = normalizedBulk
    let created = 0, skipped = 0
    for (let i = Number(start); i <= Number(end); i++) {
      const code = `${prefix || zone}${i}`
      try { await createSlot({ slot_code:code, zone, slot_type, slot_category, notes:'' }); created++ }
      catch { skipped++ }
    }
    setBulkMsg(`✓ Created ${created} slots. ${skipped} skipped (likely duplicate codes).`)
    setBulkLoading(false); load()
  }

  const handleDelete = async slot => {
    if (!window.confirm(`Delete slot ${slot.slot_code}?`)) return
    setDeletingId(slot.id)
    try { await deleteSlot(slot.id); setSlots(s => s.filter(x => x.id !== slot.id)) }
    catch (err) { toast.error(err.response?.data?.detail || 'Cannot delete — slot may be in use.') }
    finally { setDeletingId(null) }
  }

  const total = slots.length
  const occupied = slots.filter(s => s.is_occupied).length
  const vipCount = slots.filter(s => getSlotCategory(s.slot_category) === 'vip').length
  const vipFree  = slots.filter(s => getSlotCategory(s.slot_category) === 'vip' && !s.is_occupied).length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Slot Management</h1>
        <p className="page-subtitle">Manage slots, vehicle-type assignments and VIP categories</p>
      </div>

      {/* Mini stats */}
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        {[['Total',total,''],['Free',total-occupied,'var(--green)'],['Occupied',occupied,'var(--red)'],['VIP Slots',vipCount,'var(--accent)'],['VIP Free',vipFree,'rgba(245,158,11,.7)']].map(([l,v,c])=>(
          <div key={l} style={{ background:'var(--bg-card)',border:'1px solid var(--border-color)',borderRadius:'var(--radius)',padding:'10px 18px',display:'flex',flexDirection:'column',alignItems:'center',gap:2,minWidth:80 }}>
            <span style={{ fontFamily:'var(--font-display)',fontSize:24,fontWeight:800,color:c||'var(--text-primary)',lineHeight:1 }}>{v}</span>
            <span style={{ fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--text-muted)' }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center' }}>
        <select className="form-select" style={{ width:'auto' }} value={filterZone} onChange={e=>setFilterZone(e.target.value)}>
          <option value="">All Zones</option>
          {ZONES.map(z=><option key={z} value={z}>Zone {z}</option>)}
        </select>
        <select className="form-select" style={{ width:'auto' }} value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {SLOT_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="form-select" style={{ width:'auto' }} value={filterOcc} onChange={e=>setFilterOcc(e.target.value)}>
          <option value="">All Status</option>
          <option value="false">Free</option>
          <option value="true">Occupied</option>
        </select>
        <div style={{ flex:1 }} />
        <button className="btn btn-ghost btn-sm" onClick={()=>{setShowBulk(b=>!b);setShowForm(false)}}>{showBulk?'✕':'⊞ Bulk Add'}</button>
        <button className="btn btn-primary" onClick={()=>{setShowForm(f=>!f);setShowBulk(false)}}>{showForm?'✕ Cancel':'+ Add Slot'}</button>
      </div>

      {/* Bulk form */}
      {showBulk&&(
        <div className="card" style={{ marginBottom:14 }}>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:14,marginBottom:12 }}>Bulk Create Slots</div>
          {bulkMsg&&<div className="alert alert-success">{bulkMsg}</div>}
          <form onSubmit={handleBulk}>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Zone</label>
                <select className="form-select" value={bulkForm.zone} onChange={e=>setBulkForm(f=>syncZoneCategory({...f,zone:e.target.value}))}>
                  {ZONES.map(z=><option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Slot Type</label>
                <select className="form-select" value={bulkForm.slot_type} onChange={e=>setBulkForm(f=>({...f,slot_type:e.target.value}))}>
                  {SLOT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Category</label>
                <select className="form-select" value={bulkForm.slot_category} onChange={e=>setBulkForm(f=>syncZoneCategory({...f,slot_category:e.target.value}))} disabled={bulkForm.zone==='VIP'}>
                  {SLOT_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Prefix (blank = zone letter)</label>
                <input className="form-input mono" value={bulkForm.prefix} onChange={e=>setBulkForm(f=>({...f,prefix:e.target.value.toUpperCase()}))} />
              </div>
              <div className="form-group"><label className="form-label">Start #</label>
                <input type="number" className="form-input" min={1} value={bulkForm.start} onChange={e=>setBulkForm(f=>({...f,start:e.target.value}))} />
              </div>
              <div className="form-group"><label className="form-label">End #</label>
                <input type="number" className="form-input" min={1} value={bulkForm.end} onChange={e=>setBulkForm(f=>({...f,end:e.target.value}))} />
              </div>
            </div>
            <p style={{ fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-secondary)',marginBottom:10,padding:'8px 12px',background:'var(--bg-input)',border:'1px solid var(--border-color)',borderRadius:'var(--radius)' }}>
              Will create: {bulkForm.prefix||bulkForm.zone}{bulkForm.start} → {bulkForm.prefix||bulkForm.zone}{bulkForm.end} ({Math.max(0,Number(bulkForm.end)-Number(bulkForm.start)+1)} slots) · {SLOT_CATEGORIES.find(c=>c.value===bulkForm.slot_category)?.label}
            </p>
            <button type="submit" className="btn btn-primary" disabled={bulkLoading}>{bulkLoading?<><span className="spinner" style={{width:13,height:13}}/> Creating…</>:'⊞ Bulk Create'}</button>
          </form>
        </div>
      )}

      {/* Single slot form */}
      {showForm&&(
        <div className="card" style={{ marginBottom:14 }}>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:14,marginBottom:12,paddingBottom:10,borderBottom:'1px solid var(--border-color)' }}>Add Parking Slot</div>
          <form onSubmit={handleSave}>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Slot Code *</label>
                <input className="form-input mono" value={form.slot_code} onChange={e=>setForm(f=>({...f,slot_code:e.target.value.toUpperCase()}))} placeholder="e.g. A1, VIP3" />
                {formErrors.slot_code&&<span className="field-error">{formErrors.slot_code}</span>}
              </div>
              <div className="form-group"><label className="form-label">Zone</label>
                <select className="form-select" value={form.zone} onChange={e=>setForm(f=>syncZoneCategory({...f,zone:e.target.value}))}>
                  {ZONES.map(z=><option key={z} value={z}>Zone {z}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Slot Type</label>
                <select className="form-select" value={form.slot_type} onChange={e=>setForm(f=>({...f,slot_type:e.target.value}))}>
                  {SLOT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Category</label>
                <select className="form-select" value={form.slot_category} onChange={e=>setForm(f=>syncZoneCategory({...f,slot_category:e.target.value}))} disabled={form.zone==='VIP'}>
                  {SLOT_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <span style={{ fontSize:10,color:'var(--text-muted)',marginTop:2 }}>VIP category reserved for VIP customers</span>
              </div>
              <div className="form-group"><label className="form-label">Notes</label>
                <input className="form-input" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional" />
              </div>
            </div>
            <div style={{ display:'flex',gap:8,paddingTop:12,borderTop:'1px solid var(--border-color)' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':'✓ Add Slot'}</button>
              <button type="button" className="btn btn-ghost" onClick={()=>{setShowForm(false);setForm(EMPTY)}}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? <div className="page-center"><div className="spinner" /></div> :
         slots.length===0 ? <div className="empty-state"><span className="empty-icon">⊞</span><p>No slots. Add some to get started.</p></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Slot Code</th><th>Zone</th><th>Type</th><th>Category</th><th>Status</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                {slots.map(s=>(
                  <tr key={s.id} style={{ background: getSlotCategory(s.slot_category)==='vip'?'rgba(245,158,11,.04)':undefined }}>
                    <td><span className="slot-tag">{s.slot_code}</span></td>
                    <td><span className="mono text-accent">Zone {s.zone}</span></td>
                    <td><SlotTypeBadge t={s.slot_type||'any'} /></td>
                    <td><CategoryBadge cat={s.slot_category||'standard'} /></td>
                    <td><span className={`badge ${s.is_occupied?'badge-red':'badge-green'}`}>{s.is_occupied?'Occupied':'Free'}</span></td>
                    <td style={{ fontSize:11,color:'var(--text-muted)' }}>{s.notes||'—'}</td>
                    <td>
                      {!s.is_occupied&&(
                        <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)',borderColor:'rgba(239,68,68,.3)' }} onClick={()=>handleDelete(s)} disabled={deletingId===s.id}>
                          {deletingId===s.id?'…':'Delete'}
                        </button>
                      )}
                    </td>
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

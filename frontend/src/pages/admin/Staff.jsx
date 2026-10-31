import { useState, useEffect } from 'react'
import { getStaff, createStaff, updateStaff, startShift, endShift } from '../../api/staffApi'
import { useToast } from '../../components/Toast'

const EMPTY = { username:'', first_name:'', last_name:'', email:'', phone:'', password:'', confirm_password:'' }

export default function Staff() {
  const toast = useToast()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editStaff, setEditStaff] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [shiftingId, setShiftingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const load = async () => { setLoading(true); try { const r = await getStaff(); setStaff(r.data.results ?? r.data) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditStaff(null); setForm(EMPTY); setFormErrors({}); setShowForm(true) }
  const openEdit = s => { setEditStaff(s); setForm({ username:s.username, first_name:s.first_name, last_name:s.last_name, email:s.email, phone:s.phone||'', password:'', confirm_password:'' }); setFormErrors({}); setShowForm(true) }

  const validate = () => {
    const e = {}
    if (!form.username.trim()) e.username = 'Required.'
    if (!form.first_name.trim()) e.first_name = 'Required.'
    if (!form.email.trim()) e.email = 'Required.'
    if (!editStaff && !form.password) e.password = 'Required.'
    if (form.password && form.password !== form.confirm_password) e.confirm_password = 'Passwords do not match.'
    return e
  }

  const handleSave = async e => {
    e.preventDefault()
    const errs = validate(); if (Object.keys(errs).length) { setFormErrors(errs); return }
    setSaving(true)
    const payload = { ...form }; if (!payload.password) { delete payload.password; delete payload.confirm_password }
    try {
      if (editStaff) { await updateStaff(editStaff.id, payload); toast.success('Updated.') }
      else { await createStaff(payload); toast.success('Attendant created.') }
      setShowForm(false); load()
    } catch (err) {
      const d = err.response?.data
      if (d && typeof d === 'object') setFormErrors(Object.fromEntries(Object.entries(d).map(([k,v])=>[k,Array.isArray(v)?v[0]:v])))
      else toast.error('Save failed.')
    } finally { setSaving(false) }
  }

  const toggleShift = async s => {
    setShiftingId(s.id)
    try {
      if (s.is_on_shift) { await endShift(s.id); setStaff(prev=>prev.map(x=>x.id===s.id?{...x,is_on_shift:false}:x)); toast.info(`${s.first_name} shift ended.`) }
      else { await startShift(s.id); setStaff(prev=>prev.map(x=>x.id===s.id?{...x,is_on_shift:true}:x)); toast.success(`${s.first_name} shift started.`) }
    } catch { toast.error('Failed to update shift.') }
    finally { setShiftingId(null) }
  }

  const toggleActive = async s => {
    setTogglingId(s.id)
    try { await updateStaff(s.id, { is_active:!s.is_active }); setStaff(prev=>prev.map(x=>x.id===s.id?{...x,is_active:!x.is_active}:x)) }
    catch { toast.error('Failed.') }
    finally { setTogglingId(null) }
  }

  const onShift = staff.filter(s=>s.is_on_shift).length

  return (
    <div>
      <div className="flex-between page-header">
        <div><h1 className="page-title">Staff Management</h1><p className="page-subtitle">{onShift} on shift · {staff.length} total</p></div>
        <button className="btn btn-primary" onClick={showForm&&!editStaff?()=>setShowForm(false):openCreate}>{showForm&&!editStaff?'✕ Cancel':'+ Add Attendant'}</button>
      </div>

      {onShift > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'var(--green-dim)', border:'1px solid rgba(34,197,94,.3)', borderRadius:'var(--radius)', marginBottom:14, fontSize:12 }}>
          <span style={{ width:8,height:8,borderRadius:'50%',background:'var(--green)',animation:'pulse-g 2s infinite',flexShrink:0 }} />
          <strong>{onShift} attendant{onShift!==1?'s':''} on shift</strong> · {staff.filter(s=>s.is_on_shift).reduce((n,s)=>n+(s.active_sessions||0),0)} active tasks
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom:14 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, marginBottom:14, paddingBottom:10, borderBottom:'1px solid var(--border-color)' }}>
            {editStaff ? `Edit — ${editStaff.full_name||editStaff.username}` : 'Add New Attendant'}
          </div>
          <form onSubmit={handleSave} noValidate>
            <div className="form-row-2">
              {[['username','Username *','mono',false],['first_name','First Name *','',''],['last_name','Last Name','',''],['email','Email *','','email'],['phone','Phone','',''],['password','Password','','password'],['confirm_password','Confirm Password','','password']].map(([n,l,cls,type]) => (
                <div key={n} className="form-group">
                  <label className="form-label">{l}</label>
                  <input name={n} type={type||'text'} className={`form-input${cls?' '+cls:''} ${formErrors[n]?'input-error':''}`}
                    value={form[n]} onChange={e=>{ setForm(f=>({...f,[n]:e.target.value})); setFormErrors(fe=>({...fe,[n]:''})) }}
                    placeholder={n==='password'&&editStaff?'Leave blank to keep':undefined} />
                  {formErrors[n] && <span className="field-error">{formErrors[n]}</span>}
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:8, paddingTop:14, borderTop:'1px solid var(--border-color)' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?<><span className="spinner" style={{width:13,height:13}}/> Saving…</>:editStaff?'✓ Update':'✓ Create'}</button>
              <button type="button" className="btn btn-ghost" onClick={()=>{setShowForm(false);setEditStaff(null)}}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? <div className="page-center"><div className="spinner" /></div> :
         staff.length===0 ? <div className="empty-state"><span className="empty-icon">◈</span><p>No attendants yet.</p></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Username</th><th>Shift</th><th>Active Now</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id} style={{ opacity:s.is_active?1:.5 }}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <strong>{s.full_name||s.username}</strong>
                        {s.is_on_shift && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, fontWeight:600, color:'var(--green)', background:'var(--green-dim)', border:'1px solid rgba(34,197,94,.3)', borderRadius:3, padding:'1px 5px', letterSpacing:'.06em' }}>● ON SHIFT</span>}
                      </div>
                      <div style={{ fontSize:10, color:'var(--text-muted)' }}>{s.email}</div>
                    </td>
                    <td><span className="mono" style={{fontSize:11}}>{s.username}</span></td>
                    <td>
                      <button onClick={()=>toggleShift(s)} disabled={shiftingId===s.id||!s.is_active}
                        style={{ display:'inline-flex', alignItems:'center', gap:5, fontFamily:'var(--font-body)', fontWeight:600, fontSize:11, padding:'5px 10px', borderRadius:'var(--radius)', border:'1px solid', transition:'all var(--transition)', opacity:s.is_active?1:.5, cursor:s.is_active?'pointer':'not-allowed',
                          background:s.is_on_shift?'var(--red-dim)':'transparent', color:s.is_on_shift?'var(--red)':'var(--green)', borderColor:s.is_on_shift?'rgba(239,68,68,.35)':'rgba(34,197,94,.4)' }}>
                        {shiftingId===s.id?'…':s.is_on_shift?'⏹ End':'▶ Start'}
                      </button>
                    </td>
                    <td><span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:18, color:s.active_sessions>0?'var(--accent)':'var(--text-muted)' }}>{s.active_sessions??0}</span></td>
                    <td><span style={{ fontFamily:'var(--font-mono)', fontSize:11, background:'var(--accent-dim)', border:'1px solid var(--accent-border)', color:'var(--accent)', borderRadius:4, padding:'2px 7px' }}>{s.total_sessions??0}</span></td>
                    <td><span className={`badge ${s.is_active?'badge-green':'badge-gray'}`}>{s.is_active?'Active':'Inactive'}</span></td>
                    <td>
                      <div style={{ display:'flex', gap:5 }}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(s)}>Edit</button>
                        <button className={`btn btn-sm ${s.is_active?'btn-warning':'btn-success'}`} onClick={()=>toggleActive(s)} disabled={togglingId===s.id}>{togglingId===s.id?'…':s.is_active?'Deactivate':'Activate'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <style>{`
        @keyframes pulse-g { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }
        .input-error { border-color: var(--red) !important; }
      `}</style>
    </div>
  )
}

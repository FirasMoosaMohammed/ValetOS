import { useState, useEffect } from 'react'
import { getRates, saveRates } from '../../api/staffApi'
import { getDashboardStats } from '../../api/ticketApi'
import { useToast } from '../../components/Toast'

const VT_ICONS = { car:'🚗', suv:'🚙', bike:'🏍', truck:'🚛', other:'🚐' }
const VT_LABEL = { car:'Car', suv:'SUV', bike:'Bike', truck:'Truck', other:'Other' }

function fmtINR(v) {
  const n = parseFloat(v)
  return isNaN(n) ? '₹0.00' : `₹${n.toFixed(2)}`
}

export default function Rates() {
  const toast = useToast()
  const [rates, setRates]     = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [rr, dr] = await Promise.all([getRates(), getDashboardStats()])
      setRates(rr.data)
      setSummary(dr.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleChange = (vehicleType, field, value) => {
    setRates(prev => prev.map(r => r.vehicle_type === vehicleType ? { ...r, [field]: value } : r))
  }

  const handleSave = async () => {
    // Validation: rate_per_hour > 0, grace_period_minutes >= 0
    for (const r of rates) {
      if (parseFloat(r.rate_per_hour) <= 0) {
        toast.error(`Rate for ${r.vehicle_type} must be greater than 0.`); return
      }
      if (parseInt(r.grace_period_minutes) < 0) {
        toast.error(`Grace period for ${r.vehicle_type} cannot be negative.`); return
      }
    }
    setSaving(true)
    try {
      await saveRates(rates)
      toast.success('Rates saved successfully.')
      load()
    } catch { toast.error('Failed to save rates.') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="page-center"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Rate Configuration</h1><p className="page-subtitle">Set hourly rates, minimum charges, and grace periods per vehicle type</p></div>

      {/* Revenue summary */}
      {summary && (
        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
          {[
            ["Today's Revenue", `₹${parseFloat(summary.today_revenue||0).toFixed(2)}`, 'var(--accent)'],
            ["Today's Exits",   summary.today_exits,   'var(--blue)'],
          ].map(([l,v,c]) => (
            <div key={l} style={{ background:'var(--bg-card)', border:'1px solid var(--border-color)', borderRadius:'var(--radius-lg)', padding:'16px 22px', display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:150 }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>{l}</span>
              <span style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:800, color:c, letterSpacing:-0.5 }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:18 }}>Hourly Rates by Vehicle Type</div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14 }}>
          {rates.map(r => (
            <div key={r.vehicle_type} style={{ background:'var(--bg-input)', border:'1px solid var(--border-color)', borderRadius:'var(--radius-lg)', padding:16, transition:'border-color var(--transition)' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-hi)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-color)'}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, paddingBottom:12, borderBottom:'1px solid var(--border-color)' }}>
                <span style={{ fontSize:20 }}>{VT_ICONS[r.vehicle_type]}</span>
                <span style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>{VT_LABEL[r.vehicle_type]}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Rate per Hour (₹)</label>
                <input type="number" min="0" step="0.5" className="form-input mono" value={r.rate_per_hour}
                  onChange={e => handleChange(r.vehicle_type, 'rate_per_hour', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Minimum Charge (₹)</label>
                <input type="number" min="0" step="0.5" className="form-input mono" value={r.minimum_charge}
                  onChange={e => handleChange(r.vehicle_type, 'minimum_charge', e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Grace Period (minutes)</label>
                <input type="number" min="0" max="120" className="form-input mono" value={r.grace_period_minutes}
                  onChange={e => handleChange(r.vehicle_type, 'grace_period_minutes', e.target.value)} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:10, marginTop:22, paddingTop:18, borderTop:'1px solid var(--border-color)' }}>
          <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner" style={{width:13,height:13}}/> Saving…</> : '✓ Save All Rates'}
          </button>
          <button className="btn btn-ghost" onClick={load}>Reset</button>
        </div>
      </div>

      {/* Fee formula */}
      <div className="card mt-14" style={{ background:'var(--bg-input)' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:10 }}>Fee Formula</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-secondary)', lineHeight:1.8 }}>
          <div>billable_minutes = ceil((duration − grace_period) / 15) × 15</div>
          <div>fee = max(billable_minutes / 60 × rate_per_hour, minimum_charge)</div>
          <div style={{ color:'var(--text-muted)', marginTop:6 }}>Duration within grace period → ₹0.00</div>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSlotMap } from '../../api/slotApi'
import '../../styles/slot-map.css'

function fmtMins(m) { return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m` }
function fmtTime(iso) { if(!iso) return '—'; return new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) }
function getSlotCategory(slot) { return (slot?.slot_category || 'standard').toLowerCase() }
function getSlotClass(slot) {
  const category = getSlotCategory(slot)
  if (category === 'vip') return slot.is_occupied ? 'vip-occupied' : 'vip-free'
  return slot.is_occupied ? 'occupied' : 'free'
}

function slotColors(slot) {
  const isVIP = getSlotCategory(slot) === 'vip'
  if (isVIP) {
    return slot.is_occupied
      ? { bg:'rgba(180,100,0,.22)', border:'rgba(245,158,11,.55)', dot:'#d97706' }   // deep amber = occupied VIP
      : { bg:'rgba(245,158,11,.10)', border:'rgba(245,158,11,.35)', dot:'#f59e0b' }  // light gold = free VIP
  }
  return slot.is_occupied
    ? { bg:'var(--red-dim)',   border:'rgba(239,68,68,.3)',  dot:'var(--red)'   }
    : { bg:'var(--green-dim)', border:'rgba(34,197,94,.25)', dot:'var(--green)' }
}

function Popover({ slot, onClose }) {
  const ref = useRef()
  useEffect(() => {
    const h = e => { if(ref.current&&!ref.current.contains(e.target)) onClose() }
    const k = e => { if(e.key==='Escape') onClose() }
    document.addEventListener('mousedown',h); document.addEventListener('keydown',k)
    return () => { document.removeEventListener('mousedown',h); document.removeEventListener('keydown',k) }
  }, [onClose])

  const isVIP = getSlotCategory(slot) === 'vip'
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,backdropFilter:'blur(2px)' }}>
      <div ref={ref} style={{ background:'var(--bg-card)',border:`1px solid ${isVIP?'rgba(245,158,11,.5)':'var(--border-color)'}`,borderRadius:'var(--radius-lg)',padding:28,width:'100%',maxWidth:320,position:'relative',boxShadow:'0 20px 60px rgba(0,0,0,.4)' }}>
        <button onClick={onClose} style={{ position:'absolute',top:12,right:12,background:'var(--bg-input)',border:'1px solid var(--border-color)',borderRadius:6,color:'var(--text-muted)',width:26,height:26,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12 }}>✕</button>
        <div style={{ display:'flex',alignItems:'baseline',gap:8,marginBottom:8 }}>
          <span style={{ fontFamily:'var(--font-display)',fontSize:26,fontWeight:800,color:isVIP?'var(--accent)':'var(--text-primary)' }}>{slot.slot_code}</span>
          {isVIP&&<span style={{ fontSize:12,color:'var(--accent)' }}>⭐ VIP</span>}
          <span style={{ fontFamily:'var(--font-mono)',fontSize:10,color:'var(--text-muted)',textTransform:'uppercase' }}>Zone {slot.zone}</span>
        </div>
        <div style={{ fontFamily:'var(--font-display)',fontSize:20,fontWeight:800,color:'var(--red)',letterSpacing:'.04em',marginBottom:4 }}>{slot.vehicle_number}</div>
        <div style={{ fontSize:13,color:'var(--text-secondary)',marginBottom:14 }}>
          {slot.customer_name}
          {slot.is_vip_ticket&&<span style={{ marginLeft:8,color:'var(--accent)' }}>⭐ VIP</span>}
        </div>
        {[['Entry',fmtTime(slot.entry_time)],['Duration',fmtMins(slot.duration_minutes||0)]].map(([l,v])=>(
          <div key={l} style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',borderTop:'1px solid var(--border-color)',fontSize:12 }}>
            <span style={{ color:'var(--text-muted)' }}>{l}</span><span style={{ fontWeight:500 }}>{v}</span>
          </div>
        ))}
        {slot.ticket_id&&(
          <a href={`/receipt/${slot.ticket_id}`} target="_blank" rel="noreferrer"
            style={{ display:'block',textAlign:'center',marginTop:14,fontSize:12,color:'var(--blue)',textDecoration:'none',border:'1px solid rgba(59,130,246,.3)',borderRadius:'var(--radius)',padding:8 }}>
            View Ticket ↗
          </a>
        )}
      </div>
    </div>
  )
}

export default function SlotMap() {
  const [slots, setSlots]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    try { const r = await getSlotMap(); setSlots(r.data); setLastUpdated(new Date()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); const t = setInterval(load,30000); return () => clearInterval(t) }, [load])

  const zones = slots.reduce((acc,s) => { if(!acc[s.zone]) acc[s.zone]=[]; acc[s.zone].push(s); return acc }, {})
  const totalOcc = slots.filter(s=>s.is_occupied).length
  const pctOcc   = slots.length ? Math.round(totalOcc/slots.length*100) : 0
  const vipFree  = slots.filter(s=>getSlotCategory(s)==='vip'&&!s.is_occupied).length
  const vipOcc   = slots.filter(s=>getSlotCategory(s)==='vip'&&s.is_occupied).length

  return (
    <div>
      <div className="flex-between page-header">
        <div>
          <h1 className="page-title">Slot Map</h1>
          <p className="page-subtitle">Live · auto-refreshes every 30s{lastUpdated?` · ${lastUpdated.toLocaleTimeString('en-IN')}`:''}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>{loading?'…':'↻ Refresh'}</button>
      </div>

      {/* Legend */}
      <div style={{ display:'flex',alignItems:'center',gap:16,marginBottom:18,background:'var(--bg-card)',border:'1px solid var(--border-color)',borderRadius:'var(--radius-lg)',padding:'12px 16px',flexWrap:'wrap' }}>
        {[
          ['Free',          'var(--green)'],
          ['Occupied',      'var(--red)'],
          ['VIP Free',      '#f59e0b'],
          ['VIP Occupied',  '#d97706'],
        ].map(([l,c])=>(
          <div key={l} style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text-secondary)' }}>
            <div style={{ width:10,height:10,borderRadius:2,background:c }} />{l}
          </div>
        ))}
        <div style={{ width:1,height:18,background:'var(--border-color)' }} />
        <span style={{ fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-secondary)' }}>{pctOcc}% full ({totalOcc}/{slots.length})</span>
        <span style={{ fontFamily:'var(--font-mono)',fontSize:11,color:'var(--accent)' }}>⭐ {vipFree} VIP free · {vipOcc} VIP occupied</span>
        <div style={{ flex:1,minWidth:80,height:5,background:'var(--border-color)',borderRadius:3,overflow:'hidden' }}>
          <div style={{ height:'100%',width:`${pctOcc}%`,background:pctOcc>80?'var(--red)':pctOcc>50?'var(--accent)':'var(--green)',borderRadius:3,transition:'width .5s' }} />
        </div>
      </div>

      {loading&&slots.length===0 ? <div className="page-center"><div className="spinner" /></div> : (
        <div style={{ display:'flex',flexDirection:'column',gap:20 }}>
          {Object.entries(zones).sort().map(([zone,zSlots])=>{
            const zOcc = zSlots.filter(s=>s.is_occupied).length
            const zPct = zSlots.length ? Math.round(zOcc/zSlots.length*100) : 0
            const zVIP = zSlots.some(s=>getSlotCategory(s)==='vip')
            return (
              <div key={zone} style={{ background:'var(--bg-card)',border:`1px solid ${zVIP?'rgba(245,158,11,.2)':'var(--border-color)'}`,borderRadius:'var(--radius-lg)',padding:18 }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                    <span style={{ fontFamily:'var(--font-display)',fontSize:16,fontWeight:800,color:zVIP?'var(--accent)':'var(--text-primary)',background:zVIP?'rgba(245,158,11,.12)':'var(--bg-input)',border:`1px solid ${zVIP?'rgba(245,158,11,.3)':'var(--border-color)'}`,borderRadius:6,padding:'2px 10px' }}>
                      Zone {zone}{zVIP?' ⭐':''}
                    </span>
                    <span style={{ fontFamily:'var(--font-mono)',fontSize:10,color:'var(--text-muted)' }}>{zOcc}/{zSlots.length} · {zPct}%</span>
                  </div>
                  <div style={{ width:80,height:4,background:'var(--border-color)',borderRadius:2,overflow:'hidden' }}>
                    <div style={{ height:'100%',width:`${zPct}%`,background:zPct>80?'var(--red)':zPct>50?'var(--accent)':'var(--green)',borderRadius:2 }} />
                  </div>
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(86px,1fr))',gap:8 }}>
                  {zSlots.map(s=>{
                    const col = slotColors(s)
                    const isVIP = getSlotCategory(s)==='vip'
                    return (
                      <button key={s.id} onClick={()=>s.is_occupied&&setSelected(s)}
                        title={s.is_occupied?`${s.vehicle_number} · ${s.customer_name}`:`${s.slot_code} — Free${isVIP?' (VIP)':''}`}
                        className={`slot-card ${getSlotClass(s)}`}
                        style={{ position:'relative',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,padding:'9px 5px 7px',borderRadius:'var(--radius)',minHeight:68,textAlign:'center',cursor:s.is_occupied?'pointer':'default',transition:'all var(--transition)',background:col.bg,border:`1px solid ${col.border}` }}
                        onMouseEnter={e=>{ if(s.is_occupied) e.currentTarget.style.transform='translateY(-2px)' }}
                        onMouseLeave={e=>{ e.currentTarget.style.transform='' }}>
                        <span style={{ fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600,color:'var(--text-primary)' }}>
                          {isVIP&&<span style={{ fontSize:8,marginRight:1 }}>⭐</span>}
                          {s.slot_code}
                        </span>
                        {s.is_occupied&&<span style={{ fontFamily:'var(--font-mono)',fontSize:8,color:isVIP?'var(--accent)':'var(--red)',maxWidth:78,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{s.vehicle_number}</span>}
                        {s.is_occupied&&<span style={{ fontSize:9,color:'var(--text-muted)' }}>{fmtMins(s.duration_minutes||0)}</span>}
                        <div style={{ position:'absolute',bottom:4,right:4,width:6,height:6,borderRadius:'50%',background:col.dot,animation:s.is_occupied?'pulse-slot 2s infinite':undefined }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selected&&<Popover slot={selected} onClose={()=>setSelected(null)} />}
      <style>{`@keyframes pulse-slot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.7)}}`}</style>
    </div>
  )
}

/**
 * LostTokenModal — Full-screen overlay for lost/forgotten RFID card flow.
 *
 * Steps:
 *   1. Search by phone or vehicle number
 *   2. Send OTP → countdown timer → Resend
 *   3. Enter 6-digit OTP (OTPInput component)
 *   4. Verified → call onVerified(card) to proceed with entry/exit
 *
 * Props:
 *   purpose   — 'lost_token_entry' | 'lost_token_exit'
 *   onVerified(card) — called on successful verification
 *   onClose   — called to dismiss modal
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import OTPInput from './OTPInput'
import { otpSend, otpVerify, otpCustomerLookup } from '../api/staffApi'
import { useToast } from './Toast'

export default function LostTokenModal({ purpose = 'lost_token_entry', onVerified, onClose }) {
  const toast = useToast()

  // Step 1 — Search
  const [tab, setTab]             = useState('phone')   // 'phone' | 'vehicle_number'
  const [searchVal, setSearchVal] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState(null)  // { customer_name, phone_masked, vehicle_number, vehicle_type, is_vip }
  const [searchError, setSearchError]   = useState('')

  // Step 2 — OTP sent
  const [otpSent, setOtpSent]     = useState(false)
  const [sending, setSending]     = useState(false)
  const [sendError, setSendError] = useState('')
  const [devOtp, setDevOtp]       = useState(null)   // preview in DEBUG mode
  const [phoneMasked, setPhoneMasked] = useState('')
  const [verifyPhone, setVerifyPhone] = useState('') // raw phone used for OTP verify
  const [countdown, setCountdown] = useState(0)
  const countdownRef              = useRef(null)

  // Step 3 — Verify OTP
  const [otpString, setOtpString] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState(3)
  const [otpError, setOtpError]   = useState(false)   // trigger shake

  // Step 4 — Verified
  const [verified, setVerified]   = useState(false)
  const [verifiedCard, setVerifiedCard] = useState(null)

  // Cleanup
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current) }, [])

  const startCountdown = useCallback(() => {
    setCountdown(60)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(countdownRef.current); return 0 }
        return c - 1
      })
    }, 1000)
  }, [])

  // Step 1: Search
  const handleSearch = async e => {
    e.preventDefault()
    if (!searchVal.trim()) return
    setSearching(true); setSearchError(''); setSearchResult(null)
    try {
      const params = tab === 'phone' ? { phone: searchVal.trim() } : { vehicle_number: searchVal.trim() }
      const r = await otpCustomerLookup(params)
      if (!r.data.found || !r.data.results?.length) {
        setSearchError('No registered customer found. Check the number and try again.')
      } else {
        setSearchResult(r.data.results[0])
      }
    } catch {
      setSearchError('Search failed. Try again.')
    } finally { setSearching(false) }
  }

  // Step 2: Send OTP
  const handleSendOTP = async () => {
    setSending(true); setSendError(''); setDevOtp(null)
    try {
      const payload = tab === 'phone'
        ? { phone: searchVal.trim(), purpose }
        : { vehicle_number: searchVal.trim().toUpperCase(), purpose }
      const r = await otpSend(payload)
      setPhoneMasked(r.data.phone_masked)
      setVerifyPhone(r.data.phone || searchVal.trim()) // store raw phone for verify step
      setOtpSent(true)
      startCountdown()
      if (r.data.otp_preview) {
        setDevOtp(r.data.otp_preview)
      }
    } catch (err) {
      setSendError(err.response?.data?.error || 'Failed to send OTP. Try again.')
    } finally { setSending(false) }
  }

  // Step 3: Verify OTP
  const handleVerify = async (otp) => {
    setOtpString(otp)
    setVerifying(true); setVerifyError(''); setOtpError(false)
    // verifyPhone is the raw phone number captured when OTP was sent (from the
    // otpSend response). Using it directly avoids sending a vehicle number as
    // the phone lookup key when the operator searched by vehicle number.
    try {
      const r = await otpVerify({
        phone: verifyPhone,
        otp_code: otp,
        purpose,
      })
      if (r.data.verified) {
        setVerified(true)
        setVerifiedCard(r.data.card)
      }
    } catch (err) {
      setOtpError(true)
      const remaining = err.response?.data?.attempts_remaining
      if (remaining !== undefined) {
        setAttemptsLeft(remaining)
        setVerifyError(`Wrong OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`)
      } else {
        setVerifyError(err.response?.data?.error || 'Verification failed.')
      }
      if (err.response?.data?.locked) {
        setVerifyError('Too many attempts. Request a new OTP.')
        setOtpSent(false)
        setCountdown(0)
      }
    } finally { setVerifying(false) }
  }

  const handleConfirm = () => {
    if (verifiedCard && onVerified) onVerified(verifiedCard)
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 500, padding: 20, backdropFilter: 'blur(3px)',
  }
  const panelStyle = {
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)', padding: '32px 28px',
    width: '100%', maxWidth: 440, position: 'relative',
    boxShadow: '0 24px 64px rgba(0,0,0,.45)',
    maxHeight: '90vh', overflowY: 'auto',
  }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panelStyle}>
        {/* Close */}
        <button onClick={onClose} style={{ position:'absolute', top:14, right:14, background:'var(--bg-input)', border:'1px solid var(--border-color)', borderRadius:6, color:'var(--text-muted)', width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>✕</button>

        <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800, color:'var(--text-primary)', marginBottom:4 }}>🔑 Lost / Forgotten Card</div>
        <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:20 }}>
          {purpose === 'lost_token_entry' ? 'Find customer and verify identity to proceed with entry.' : 'Find customer and verify identity to retrieve vehicle.'}
        </p>

        {/* ── Step 1: Search ── */}
        {!searchResult && !verified && (
          <>
            {/* Tab selector */}
            <div style={{ display:'flex', marginBottom:14, background:'var(--bg-input)', borderRadius:'var(--radius)', padding:3 }}>
              {[['phone','By Phone'],['vehicle_number','By Vehicle No.']].map(([k,l]) => (
                <button key={k} onClick={()=>{ setTab(k); setSearchVal(''); setSearchError('') }}
                  style={{ flex:1, padding:'7px 10px', border:'none', borderRadius:'calc(var(--radius) - 2px)', cursor:'pointer', fontFamily:'var(--font-body)', fontWeight:600, fontSize:12, transition:'all .15s',
                    background: tab===k?'var(--bg-card)':'transparent',
                    color: tab===k?'var(--accent)':'var(--text-muted)',
                    boxShadow: tab===k?'0 1px 4px rgba(0,0,0,.2)':undefined
                  }}>
                  {l}
                </button>
              ))}
            </div>

            <form onSubmit={handleSearch}>
              <div className="form-group">
                <label className="form-label">{tab === 'phone' ? 'Phone Number' : 'Vehicle Number'}</label>
                <input className="form-input" value={searchVal} autoFocus
                  placeholder={tab==='phone'?'e.g. 9876543210':'e.g. KL07AB1234'}
                  onChange={e=>{ setSearchVal(e.target.value); setSearchError('') }} />
              </div>
              {searchError && <div className="alert alert-error">{searchError}</div>}
              <button type="submit" className="btn btn-primary btn-full" disabled={!searchVal.trim()||searching}>
                {searching ? <><span className="spinner" style={{width:13,height:13}}/> Searching…</> : 'Search →'}
              </button>
            </form>
          </>
        )}

        {/* ── Step 2: Customer found → Send OTP ── */}
        {searchResult && !otpSent && !verified && (
          <>
            <div style={{ background:'var(--bg-input)', border:'1px solid var(--border-color)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16 }}>
              <div style={{ fontWeight:600, marginBottom:4 }}>{searchResult.customer_name}</div>
              <div style={{ fontSize:12, color:'var(--text-secondary)' }}>
                Phone: {searchResult.phone_masked} · {searchResult.vehicle_number} · {searchResult.vehicle_type}
                {searchResult.is_vip && <span style={{ marginLeft:8, color:'var(--accent)' }}>⭐ VIP</span>}
              </div>
            </div>
            <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:14 }}>
              We'll send a 6-digit OTP to <strong>{searchResult.phone_masked}</strong>
            </p>
            {sendError && <div className="alert alert-error">{sendError}</div>}
            <button className="btn btn-primary btn-full" onClick={handleSendOTP} disabled={sending}>
              {sending ? <><span className="spinner" style={{width:13,height:13}}/> Sending…</> : '📱 Send OTP'}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ marginTop:8, width:'100%' }} onClick={()=>setSearchResult(null)}>← Search again</button>
          </>
        )}

        {/* ── Step 3: Enter OTP ── */}
        {searchResult && otpSent && !verified && (
          <>
            <div className="alert alert-info" style={{ marginBottom:14 }}>
              OTP sent to <strong>{phoneMasked}</strong>
            </div>

            {/* DEV mode OTP preview */}
            {devOtp && (
              <div style={{ background:'var(--blue-dim)', border:'1px solid rgba(59,130,246,.3)', borderRadius:'var(--radius)', padding:'10px 14px', marginBottom:14, fontSize:12, color:'var(--blue)' }}>
                🧪 <strong>DEV MODE</strong> — OTP: <span className="mono" style={{ fontSize:18, fontWeight:700 }}>{devOtp}</span>
              </div>
            )}

            <p style={{ textAlign:'center', fontSize:12, color:'var(--text-secondary)', marginBottom:16 }}>
              Enter the 6-digit code:
            </p>

            <OTPInput
              key={otpSent}
              length={6}
              onComplete={handleVerify}
              disabled={verifying}
              error={otpError}
            />

            {verifyError && (
              <div className="alert alert-error mt-8" style={{ textAlign:'center' }}>
                {verifyError}
              </div>
            )}

            {verifying && (
              <div style={{ textAlign:'center', marginTop:12, color:'var(--text-muted)', fontSize:12 }}>
                <span className="spinner" style={{width:14,height:14,display:'inline-block',verticalAlign:'middle',marginRight:6}} />
                Verifying…
              </div>
            )}

            {attemptsLeft < 3 && !verifying && (
              <p style={{ textAlign:'center', fontSize:11, color:'var(--accent)', marginTop:8 }}>
                {attemptsLeft} attempt{attemptsLeft!==1?'s':''} remaining
              </p>
            )}

            {/* Resend */}
            <div style={{ textAlign:'center', marginTop:14 }}>
              {countdown > 0 ? (
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>Resend in {countdown}s</span>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={handleSendOTP} disabled={sending}>
                  {sending ? 'Sending…' : '↻ Resend OTP'}
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Step 4: Verified ── */}
        {verified && verifiedCard && (
          <div style={{ textAlign:'center' }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'var(--green-dim)', border:'2px solid var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'var(--green)', margin:'0 auto 14px', animation:'verify-pop .3s ease' }}>✓</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800, marginBottom:6 }}>Identity Verified</div>
            <div style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:6 }}>{verifiedCard.customer_name}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)', marginBottom:20 }}>{verifiedCard.vehicle_number}</div>
            <div className="alert alert-warn" style={{ textAlign:'left', fontSize:12 }}>
              ⚠ <strong>Lost Token</strong> — Identity verified via OTP. This exception will be logged.
            </div>
            <button className="btn btn-success btn-full btn-lg" onClick={handleConfirm}>
              Proceed with {purpose === 'lost_token_entry' ? 'Entry' : 'Exit'} →
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes verify-pop {
          from { transform: scale(.5); opacity: 0 }
          to   { transform: scale(1); opacity: 1 }
        }
      `}</style>
    </div>
  )
}

/**
 * OTPInput — 6 individual digit boxes with full keyboard + paste support.
 *
 * Props:
 *   length      — number of digits (default 6)
 *   onComplete  — called with full OTP string when all boxes filled
 *   disabled    — disables all inputs
 *   error       — if truthy, triggers shake animation and removes it after 500ms
 */
import { useRef, useState, useEffect, useCallback } from 'react'

export default function OTPInput({ length = 6, onComplete, disabled = false, error = false }) {
  const [digits, setDigits]     = useState(Array(length).fill(''))
  const [shake, setShake]       = useState(false)
  const inputRefs               = useRef([])

  // Trigger shake on error
  useEffect(() => {
    if (error) {
      setShake(true)
      const t = setTimeout(() => setShake(false), 520)
      return () => clearTimeout(t)
    }
  }, [error])

  // Clear digits when disabled lifts (new OTP round)
  useEffect(() => {
    if (!disabled) {
      // don't auto-clear; parent controls this via key prop
    }
  }, [disabled])

  const focusAt = (idx) => {
    const el = inputRefs.current[idx]
    if (el) { el.focus(); el.select() }
  }

  const handleChange = useCallback((idx, e) => {
    const val = e.target.value.replace(/\D/g, '') // digits only
    if (!val) return

    // Paste detection: if more than 1 char pasted, spread across boxes
    if (val.length > 1) {
      const chars = val.slice(0, length).split('')
      const next = [...digits]
      chars.forEach((c, i) => { if (idx + i < length) next[idx + i] = c })
      setDigits(next)
      const nextFocus = Math.min(idx + chars.length, length - 1)
      focusAt(nextFocus)
      const full = next.join('')
      if (full.length === length && onComplete) onComplete(full)
      return
    }

    const next = [...digits]
    next[idx] = val[0]
    setDigits(next)

    if (idx < length - 1) focusAt(idx + 1)

    const full = next.join('')
    if (full.length === length && !full.includes('') && onComplete) onComplete(full)
  }, [digits, length, onComplete])

  const handleKeyDown = useCallback((idx, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = [...digits]
      if (next[idx]) {
        next[idx] = ''
        setDigits(next)
      } else if (idx > 0) {
        next[idx - 1] = ''
        setDigits(next)
        focusAt(idx - 1)
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      focusAt(idx - 1)
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      focusAt(idx + 1)
    }
  }, [digits, length])

  const handlePaste = useCallback((idx, e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    const next = Array(length).fill('')
    pasted.split('').forEach((c, i) => { next[i] = c })
    setDigits(next)
    focusAt(Math.min(pasted.length, length - 1))
    if (pasted.length === length && onComplete) onComplete(pasted)
  }, [length, onComplete])

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', animation: shake ? 'otp-shake .5s ease' : undefined }}>
      {digits.map((d, idx) => (
        <input
          key={idx}
          ref={el => inputRefs.current[idx] = el}
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(idx, e)}
          onKeyDown={e => handleKeyDown(idx, e)}
          onPaste={e => handlePaste(idx, e)}
          onFocus={e => e.target.select()}
          style={{
            width: 46, height: 56,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 22,
            fontWeight: 700,
            background: 'var(--bg-input)',
            border: `2px solid ${d ? 'var(--accent)' : 'var(--border-color)'}`,
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            outline: 'none',
            transition: 'border-color 0.15s',
            caretColor: 'transparent',
            opacity: disabled ? 0.5 : 1,
          }}
        />
      ))}
      <style>{`
        @keyframes otp-shake {
          0%,100%{transform:translateX(0)}
          15%{transform:translateX(-8px)}
          30%{transform:translateX(8px)}
          45%{transform:translateX(-6px)}
          60%{transform:translateX(6px)}
          75%{transform:translateX(-3px)}
          90%{transform:translateX(3px)}
        }
      `}</style>
    </div>
  )
}

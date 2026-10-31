/**
 * useRFIDScanner — WebSocket connection to rfid_bridge.py
 *
 * Connects to ws://localhost:8765 on mount.
 * Calls onScan(uid) when a card is scanned.
 * Reconnects every 3 seconds if bridge is not running.
 * Falls back gracefully to manual text input when disconnected.
 *
 * Returns: { isConnected, isPrinterReady, lastScan, error, sendPrint }
 */
import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:8765'
const RECONNECT_MS = 3000

export function useRFIDScanner({ onScan } = {}) {
  const [isConnected, setIsConnected]     = useState(false)
  const [isPrinterReady, setIsPrinterReady] = useState(false)
  const [lastScan, setLastScan]           = useState(null)
  const [error, setError]                 = useState('')
  const wsRef      = useRef(null)
  const timerRef   = useRef(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    // Clean up any existing connection
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        setIsConnected(true)
        setIsPrinterReady(true)
        setError('')
        // Clear any pending reconnect
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      }

      ws.onmessage = (evt) => {
        if (!mountedRef.current) return
        try {
          const msg = JSON.parse(evt.data)
          if (msg.type === 'rfid_scan' && msg.uid) {
            const uid = String(msg.uid).trim()
            setLastScan(uid)
            if (onScan) onScan(uid)
          }
          if (msg.type === 'printer_status') {
            setIsPrinterReady(msg.ready === true)
          }
        } catch {}
      }

      ws.onerror = () => {
        setIsConnected(false)
        setIsPrinterReady(false)
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setIsConnected(false)
        setIsPrinterReady(false)
        setError('RFID bridge not connected — using manual input mode')
        // Schedule reconnect
        timerRef.current = setTimeout(connect, RECONNECT_MS)
      }
    } catch {
      setIsConnected(false)
      timerRef.current = setTimeout(connect, RECONNECT_MS)
    }
  }, [onScan])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (wsRef.current) { try { wsRef.current.close() } catch {} }
    }
  }, [connect])

  /** Send a print command to the bridge. Returns false if not connected. */
  const sendPrint = useCallback((receiptData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'print_receipt', receipt_data: receiptData }))
      return true
    }
    return false
  }, [])

  return { isConnected, isPrinterReady, lastScan, error, sendPrint }
}

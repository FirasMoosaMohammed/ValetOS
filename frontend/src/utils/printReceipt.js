/**
 * printReceipt.js
 *
 * Sends a print command to rfid_bridge.py via the shared WebSocket.
 * Falls back to window.open(receipt URL) → window.print() if bridge unavailable.
 */

/**
 * sendPrintCommand(receiptData, wsRef)
 *  - wsRef: WebSocket ref from useRFIDScanner (optional)
 *  - If ws connected → sends to thermal printer via bridge
 *  - If not → opens the Receipt page in a new tab for browser print
 *
 * @param {object} receiptData   — receipt fields from /api/tickets/<id>/receipt/
 * @param {function} sendPrint   — sendPrint fn from useRFIDScanner (or null)
 * @param {number|null} ticketPk — ticket primary key for fallback URL
 */
export function sendPrintCommand(receiptData, sendPrint, ticketPk) {
  // Try hardware thermal printer first
  if (sendPrint) {
    const sent = sendPrint(receiptData)
    if (sent) {
      return { method: 'thermal', success: true }
    }
  }

  // Fallback: open receipt page in new tab (browser Ctrl+P → Save as PDF)
  if (ticketPk) {
    window.open(`/receipt/${ticketPk}`, '_blank')
    return { method: 'browser', success: true }
  }

  return { method: 'none', success: false }
}

/**
 * formatReceiptForPrinter(receiptData)
 * Returns a clean object matching what rfid_bridge.py expects.
 */
export function formatReceiptForPrinter(r) {
  if (!r) return {}
  const fmtDT = iso => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
  }
  return {
    ticket_id:      r.ticket_id || r.receipt_no,
    customer_name:  r.customer_name,
    vehicle_number: r.vehicle_number,
    vehicle_type:   r.vehicle_type,
    slot_code:      r.slot_code,
    zone:           r.zone,
    is_vip:         r.is_vip,
    slot_category:  r.slot_category,
    entry_time:     fmtDT(r.entry_time),
    exit_time:      fmtDT(r.exit_time),
    duration_str:   r.duration_str,
    fee_amount:     r.fee_amount || '0.00',
    payment_method: r.payment_method,
    payment_status: r.payment_status,
    valet_name:     r.valet_name,
  }
}

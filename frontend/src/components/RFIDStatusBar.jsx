/**
 * RFIDStatusBar — shows bridge connection status in a small top bar.
 * Props: isConnected, isPrinterReady
 */
export default function RFIDStatusBar({ isConnected, isPrinterReady }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center',
      padding: '7px 14px', borderRadius: 'var(--radius)',
      background: 'var(--bg-input)', border: '1px solid var(--border-color)',
      marginBottom: 14, fontSize: 11, flexWrap: 'wrap',
    }}>
      <span style={{ color: isConnected ? 'var(--green)' : 'var(--red)', display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background: isConnected?'var(--green)':'var(--red)', display:'inline-block', animation: isConnected?'pulse-g 2s infinite':undefined }} />
        {isConnected ? 'RFID Connected' : 'RFID Disconnected'}
      </span>
      <span style={{ color:'var(--border-hi)' }}>|</span>
      <span style={{ color: isPrinterReady ? 'var(--blue)' : 'var(--text-muted)', display:'flex', alignItems:'center', gap:5 }}>
        <span>🖨</span>
        {isPrinterReady ? 'Printer Ready' : 'Printer Offline'}
      </span>
      {!isConnected && (
        <>
          <span style={{ color:'var(--border-hi)' }}>|</span>
          <span style={{ color:'var(--accent)', fontSize:10 }}>Manual input mode active</span>
        </>
      )}
      <style>{`
        @keyframes pulse-g { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }
      `}</style>
    </div>
  )
}

# ValetOS Hardware Setup Guide

## Overview

The bridge script `rfid_bridge.py` runs on the desk PC and connects:
- USB RFID Reader → WebSocket → React Frontend
- React Frontend → WebSocket → Thermal Printer

The Django backend is never involved in hardware. It stays clean.

---

## 1. Installation

```bash
cd hardware/
pip install -r requirements_bridge.txt
```

**Windows only:** The `keyboard` library requires admin rights:
```bash
# Run terminal as Administrator, then:
pip install keyboard
```

**Linux:** Add yourself to the `dialout` group for serial access:
```bash
sudo usermod -a -G dialout $USER
# Log out and back in
```

---

## 2. Identify Your RFID Reader Type

### HID (Keyboard-Emulating) — Most common, plug-and-play
- Plug in the reader — Windows/Linux recognises it instantly as a keyboard
- Open Notepad/any text editor
- Scan a card — if the UID appears as typed text, **it's HID**
- Set: `RFID_METHOD = "hid"` in rfid_bridge.py

### Serial (RS232/USB-Serial)
- Usually has a DB9 connector or a USB-Serial adapter
- Does NOT appear as a keyboard device
- Set: `RFID_METHOD = "serial"`

---

## 3. Find COM Port (Serial Mode)

### Windows:
1. Device Manager → Ports (COM & LPT)
2. Note the COM number, e.g. `COM3`
3. Set: `SERIAL_PORT = "COM3"`

### Linux:
```bash
ls /dev/ttyUSB* /dev/ttyACM*
# Usually /dev/ttyUSB0 for USB-Serial adapters
# Set: SERIAL_PORT = "/dev/ttyUSB0"
```

---

## 4. Find USB Vendor ID / Product ID (for Thermal Printer)

### Windows:
1. Device Manager → Universal Serial Bus controllers
2. Right-click your printer → Properties → Details → Hardware IDs
3. Note VID_XXXX and PID_XXXX

### Linux:
```bash
lsusb
# Example output:
# Bus 001 Device 003: ID 04b8:0202 Seiko Epson Corp. TM-T20
# VID = 0x04b8    PID = 0x0202
```

Update in rfid_bridge.py:
```python
PRINTER_VENDOR_ID  = 0x04b8
PRINTER_PRODUCT_ID = 0x0202
```

---

## 5. Recommended Hardware

### RFID Readers
| Model | Type | Notes |
|-------|------|-------|
| ACR122U | HID USB | Best plug-and-play, 13.56 MHz MIFARE |
| RDM6300 | Serial | 125 kHz EM4100, cheap, simple |
| Elatec TWN4 | HID USB | Multi-protocol, enterprise grade |
| Generic 125kHz USB | HID | Most ₹300–800 readers on Amazon |

> **Tip**: 125 kHz cards (EM4100) are cheaper and used for basic access.
> 13.56 MHz (MIFARE) cards support more data and better security.

### Thermal Printers (ESC/POS compatible)
| Model | Notes |
|-------|-------|
| Epson TM-T20 III | Industry standard, USB+Serial |
| HOIN HOP-E200 | Budget option, USB, widely available in India |
| Bixolon SRP-350 | Professional, fast |
| Generic 58mm/80mm USB | ₹2000–5000 range, ESC/POS compatible |

---

## 6. Run the Bridge

```bash
# Configure settings at top of rfid_bridge.py first, then:
python rfid_bridge.py
```

Expected output:
```
[2024-01-01 10:00:00] ValetOS RFID Bridge starting on ws://localhost:8765
[2024-01-01 10:00:00] RFID method: hid  |  Printer: usb
[2024-01-01 10:00:00] HID RFID listener started (intercepting keystrokes)
[2024-01-01 10:00:00] WebSocket server running. Connect frontend to ws://localhost:8765
```

---

## 7. Testing Without Hardware

You can simulate an RFID scan from the browser console:

```javascript
// Open browser DevTools (F12) → Console
// This simulates a card scan:
const ws = new WebSocket('ws://localhost:8765');
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'rfid_scan', uid: 'RFID001' }));
};
```

Or use any WebSocket testing tool (e.g. `websocat`, Postman) to send:
```json
{ "type": "rfid_scan", "uid": "TEST001" }
```

---

## 8. Frontend Connection Status

The React frontend shows a status indicator in the top bar:
- 🟢 **RFID Connected** — Bridge running, ready for scans
- 🔴 **RFID Disconnected** — Bridge not running (manual input mode active)
- 🖨 **Printer Ready** — Bridge can print receipts
- 🔴 **Printer Offline** — Use browser print as fallback

---

## 9. Auto-start on Boot (Optional)

### Windows — Task Scheduler:
1. Task Scheduler → Create Basic Task
2. Trigger: At log on
3. Action: Start program → `python C:\path\to\rfid_bridge.py`

### Linux — systemd:
```ini
# /etc/systemd/system/rfid-bridge.service
[Unit]
Description=ValetOS RFID Bridge
After=network.target

[Service]
ExecStart=/usr/bin/python3 /opt/valetos/hardware/rfid_bridge.py
Restart=always
User=valetos

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable rfid-bridge
sudo systemctl start rfid-bridge
```

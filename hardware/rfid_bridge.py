#!/usr/bin/env python3
"""
ValetOS RFID + Printer Bridge
Runs locally on the desk PC. Bridges USB RFID reader and thermal printer
to the React frontend via WebSocket.

Usage:
    pip install -r requirements_bridge.txt
    python rfid_bridge.py
"""

import asyncio
import json
import threading
import logging
import sys
from datetime import datetime

# ── CONFIG BLOCK ─────────────────────────────────────────────────
RFID_METHOD     = "hid"         # "hid" (keyboard emulation) or "serial"
SERIAL_PORT     = "COM3"        # Windows: "COM3"  Linux: "/dev/ttyUSB0"
BAUD_RATE       = 9600

PRINTER_TYPE    = "usb"         # "usb" or "serial"
PRINTER_VENDOR_ID  = 0x04b8     # Epson vendor ID (use lsusb to find yours)
PRINTER_PRODUCT_ID = 0x0202     # Epson TM-T20 product ID
PRINTER_PORT    = "COM4"        # Only used if PRINTER_TYPE="serial"

WS_HOST = "localhost"
WS_PORT = 8765
# ─────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
log = logging.getLogger("rfid_bridge")

# All connected WebSocket clients
_clients = set()

# Buffer for HID keyboard RFID scan (readers type UID + Enter)
_hid_buffer = []
_hid_lock = threading.Lock()


# ── WebSocket server ──────────────────────────────────────────────

async def ws_handler(websocket, path):
    _clients.add(websocket)
    log.info(f"Client connected: {websocket.remote_address}")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("type") == "print_receipt":
                    threading.Thread(target=print_receipt, args=(data.get("receipt_data", {}),), daemon=True).start()
                else:
                    log.info(f"Unknown message type: {data.get('type')}")
            except json.JSONDecodeError:
                log.warning(f"Invalid JSON from client: {message[:80]}")
    except Exception as e:
        log.warning(f"Client disconnected: {e}")
    finally:
        _clients.discard(websocket)
        log.info("Client disconnected")


async def broadcast(message: dict):
    """Send a message to all connected WebSocket clients."""
    if not _clients:
        return
    payload = json.dumps(message)
    dead = set()
    for ws in list(_clients):
        try:
            await ws.send(payload)
        except Exception:
            dead.add(ws)
    _clients.difference_update(dead)


def broadcast_sync(message: dict):
    """Thread-safe broadcast from non-async context."""
    loop = asyncio.get_event_loop()
    asyncio.run_coroutine_threadsafe(broadcast(message), loop)


# ── METHOD A — HID (keyboard-emulating RFID reader) ──────────────

def start_hid_listener():
    """
    Most plug-and-play RFID readers act as USB HID keyboards.
    They type the card UID as keystrokes followed by Enter.
    We intercept every keystroke globally and buffer until Enter.
    """
    try:
        import keyboard
    except ImportError:
        log.error("keyboard library not installed. Run: pip install keyboard")
        sys.exit(1)

    log.info("HID RFID listener started (intercepting keystrokes)")

    def on_key(event):
        if event.event_type != "down":
            return
        with _hid_lock:
            if event.name == "enter":
                uid = "".join(_hid_buffer).strip()
                _hid_buffer.clear()
                if uid and len(uid) >= 4:
                    log.info(f"RFID scan (HID): {uid}")
                    broadcast_sync({"type": "rfid_scan", "uid": uid})
            elif event.name and len(event.name) == 1:
                _hid_buffer.append(event.name)
            elif event.name == "backspace" and _hid_buffer:
                _hid_buffer.pop()

    keyboard.hook(on_key)
    # Keep thread alive
    while True:
        import time
        time.sleep(1)


# ── METHOD B — Serial RFID reader ────────────────────────────────

def start_serial_listener():
    """
    For RS232/USB-Serial RFID readers.
    Each scan sends the UID as a line terminated with CR+LF.
    """
    try:
        import serial
    except ImportError:
        log.error("pyserial not installed. Run: pip install pyserial")
        sys.exit(1)

    log.info(f"Serial RFID listener starting on {SERIAL_PORT} @ {BAUD_RATE}")

    while True:
        try:
            with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1) as ser:
                log.info(f"Serial port {SERIAL_PORT} opened")
                while True:
                    line = ser.readline().decode("ascii", errors="ignore").strip()
                    if line and len(line) >= 4:
                        log.info(f"RFID scan (serial): {line}")
                        broadcast_sync({"type": "rfid_scan", "uid": line})
        except Exception as e:
            log.error(f"Serial error: {e}. Retrying in 3s…")
            import time
            time.sleep(3)


# ── Thermal Printer ───────────────────────────────────────────────

def print_receipt(data: dict):
    """
    Format and print a receipt on a connected ESC/POS thermal printer.
    Works with Epson TM-T20, HOIN HOP-E200, and any ESC/POS-compatible printer.
    """
    try:
        if PRINTER_TYPE == "usb":
            from escpos.printer import Usb
            p = Usb(PRINTER_VENDOR_ID, PRINTER_PRODUCT_ID)
        else:
            from escpos.printer import Serial
            p = Serial(PRINTER_PORT, baudrate=BAUD_RATE)
    except ImportError:
        log.error("python-escpos not installed. Run: pip install python-escpos")
        return
    except Exception as e:
        log.error(f"Printer connection failed: {e}")
        return

    try:
        p.set(align="center", bold=True, width=2, height=2)
        p.text("VALETOS\n")
        p.set(align="center", bold=False, width=1, height=1)
        p.text("Valet Parking Services\n")
        p.text("Professional · Secure · Swift\n")
        p.text("-" * 32 + "\n")

        p.set(align="left")
        p.text(f"Ticket : {data.get('ticket_id','—')}\n")
        p.text(f"Date   : {datetime.now().strftime('%d %b %Y %H:%M')}\n")
        p.text("-" * 32 + "\n")

        p.text(f"Customer: {data.get('customer_name','—')}\n")
        p.text(f"Vehicle : {data.get('vehicle_number','—')}\n")
        p.text(f"Type    : {data.get('vehicle_type','—')}\n")
        p.text(f"Slot    : {data.get('slot_code','—')} (Zone {data.get('zone','—')})\n")
        if data.get('is_vip'):
            p.text("        *** VIP ***\n")
        p.text("-" * 32 + "\n")

        p.text(f"Entry  : {data.get('entry_time','—')}\n")
        p.text(f"Exit   : {data.get('exit_time','—')}\n")
        p.text(f"Duration: {data.get('duration_str','—')}\n")
        p.text("-" * 32 + "\n")

        p.set(align="right", bold=True)
        p.text(f"TOTAL  : Rs.{data.get('fee_amount','0.00')}\n")
        p.set(align="left", bold=False)
        p.text(f"Payment: {str(data.get('payment_method','—')).upper()}\n")
        p.text(f"Status : {str(data.get('payment_status','—')).upper()}\n")
        p.text("-" * 32 + "\n")

        p.set(align="center")
        p.text("Thank you for using ValetOS!\n")
        p.text("Drive safe.\n")
        p.text("\n\n\n")
        p.cut()

        log.info(f"Receipt printed: {data.get('ticket_id')}")

    except Exception as e:
        log.error(f"Print error: {e}")


# ── Main ──────────────────────────────────────────────────────────

async def main():
    import websockets

    log.info(f"ValetOS RFID Bridge starting on ws://{WS_HOST}:{WS_PORT}")
    log.info(f"RFID method: {RFID_METHOD}  |  Printer: {PRINTER_TYPE}")

    # Start RFID listener in a background thread
    if RFID_METHOD == "hid":
        t = threading.Thread(target=start_hid_listener, daemon=True)
    else:
        t = threading.Thread(target=start_serial_listener, daemon=True)
    t.start()

    # Start WebSocket server
    async with websockets.serve(ws_handler, WS_HOST, WS_PORT):
        log.info(f"WebSocket server running. Connect frontend to ws://{WS_HOST}:{WS_PORT}")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bridge stopped.")

# ValetOS — Administration, User Management & System Guide

This guide provides a comprehensive walkthrough for administrators to configure **ValetOS**, provision system users, manage valet attendants, and set up facility parameters from a clean installation.

---

## 1. System Overview & Architecture

ValetOS is structured around a decoupled, role-based architecture:

- **Backend (Django REST Framework)**: Manages business logic, automated slot allocation algorithms, shift tracking, transaction-atomic state transitions, and JWT-based authentication.
- **Frontend (React 18 + Vite)**: A responsive single-page web console designed for desk operators, shift supervisors, and mobile valet attendants.
- **Hardware Bridge (Python WebSocket)**: Interconnects physical desktop USB RFID readers and thermal receipt printers with the React web client.

---

## 2. User Roles & Permission Model

ValetOS enforces strict role-based access control (RBAC):

| Role | Access Level | Primary Responsibilities |
|---|---|---|
| **Admin** | Full System Access | System configuration, rate settings, parking slot management, staff provisioning, revenue reporting, audit logs, and exception resolution. |
| **Attendant (Valet)** | Operational Access | Clocking in/out of shifts, executing vehicle parking tasks, fetching requested vehicles, and viewing task queues. |

---

## 3. Creating the Initial Administrator Account

Because ValetOS is distributed with a clean database schema and without hardcoded credentials, you must provision an initial administrator:

1. **Activate your virtual environment and open the backend directory**:
   ```bash
   cd backend
   # Windows
   valet_env\Scripts\activate
   # Linux / macOS
   source valet_env/bin/activate
   ```

2. **Run migrations to ensure the database schema is up-to-date**:
   ```bash
   python manage.py migrate
   ```

3. **Execute the superuser creation command**:
   ```bash
   python manage.py createsuperuser
   ```

4. **Complete the interactive prompts**:
   - **Username**: Enter a unique username (e.g. `admin`).
   - **Email**: Enter an administrative contact email (e.g. `admin@example.com`).
   - **Password**: Enter a secure password (must be at least 8 characters).

> **Note**: ValetOS automatically provisions all superusers with `role = 'admin'`. This grants immediate access to both the ValetOS web console and the Django admin panel (`/django-admin/`).

---

## 4. Creating Valet Attendant Accounts

Once your administrator account is provisioned:

1. Start both the backend and frontend servers:
   ```bash
   # Terminal 1 (Backend)
   python manage.py runserver

   # Terminal 2 (Frontend)
   npm run dev
   ```
2. Navigate to `http://localhost:5173/` in your browser.
3. Sign in using your **Administrator** credentials.
4. From the sidebar navigation, select **Staff Management** (`/admin/staff`).
5. Click the **+ Add Attendant** button.
6. Provide the attendant's details:
   - **Username**: Unique identifier used for signing in (e.g. `valet_john`).
   - **First & Last Name**: The attendant's full name (displayed on printed receipts and logs).
   - **Email & Phone**: Contact details for internal scheduling and dispatch.
   - **Password**: Set an initial password for the attendant.
7. Click **Save Attendant**.

When the attendant signs in at `http://localhost:5173/`, the system automatically detects their `attendant` role and redirects them directly to the **Valet Dashboard** (`/valet/dashboard`).

---

## 5. Attendant Shift Workflow

ValetOS features an automated assignment engine that only routes tasks to attendants currently on shift:

1. **Starting a Shift**: In the **Staff Management** page, the administrator can toggle an attendant's status to **On Shift**. Alternatively, attendants can view active assignments on their dashboard once clocked in.
2. **Task Queue**: Incoming check-ins automatically assign available parking tasks to on-shift attendants using a balanced round-robin algorithm.
3. **Retrieval**: When a customer requests vehicle exit, a retrieval task is dispatched to an on-shift attendant with the exact slot location.
4. **Ending a Shift**: Toggling an attendant's status to **Off Shift** removes them from the automated task assignment pool.

---

## 6. Initial Facility Configuration Checklist

Before processing vehicles, complete the initial facility configuration in the Admin portal:

### A. Configure Parking Rates (`/admin/rates`)
Define billing rules per vehicle category (Bike, Car, SUV, Truck/Other):
- **Hourly Rate**: Rate charged per hour parked.
- **Minimum Charge**: Base fee applied upon check-in.
- **Grace Period (Minutes)**: Threshold duration before hourly billing commences.

### B. Configure Parking Slots (`/admin/slots`)
Define the physical layout of your facility:
- **Slot Code**: Unique slot identifier (e.g. `A1`, `B2`, `VIP1`).
- **Zone**: Grouping identifier (e.g. `A`, `B`, `VIP`).
- **Vehicle Type**: Supported vehicle type (`car`, `bike`, `any`).
- **Category**: Select `standard` or `vip` for VIP lane prioritisation.

### C. Register RFID Tokens (`/admin/rfid-cards`)
Link reusable physical RFID cards or key fobs:
- Tap the card on your USB RFID reader or enter the UID manually.
- Associate customer details, vehicle license plate, and VIP status.

---

## 7. Progressive Web App (PWA) Support

**Status**: **Fully Supported**

ValetOS includes full Progressive Web App (PWA) support powered by `vite-plugin-pwa`:
- **Installable Application**: Desk operators and mobile valet staff can install ValetOS directly from their browser (Chrome, Edge, Safari, iOS Safari) as a standalone desktop or mobile application via "Install ValetOS" or "Add to Home Screen".
- **Service Worker & Offline Caching**: Built-in Service Worker automatically caches static assets, styling, and application scripts, enabling near-instant launch times and resilience against intermittent WiFi or mobile cellular connections.
- **Web App Manifest**: Configured with dark theme colors (`#09090b`), high-resolution responsive icons (192x192, 512x512, maskable icons, and Apple touch icons), and standalone display mode.

---

## 8. Hardware & RFID Reader Setup Guide

ValetOS interfaces with physical desk hardware via the local Python bridge located in `hardware/rfid_bridge.py`:

> For in-depth hardware documentation, vendor/product ID discovery, and systemd service installation, refer to [Hardware Setup Guide](hardware/HARDWARE_SETUP.md).

### Quick RFID Setup:
1. **Identify Reader Type**:
   - **HID (Keyboard Emulation)**: Most standard 125 kHz or 13.56 MHz USB readers type the card UID automatically followed by Enter. Set `RFID_METHOD = "hid"` in `hardware/rfid_bridge.py`.
   - **Serial (RS232 / USB-Serial)**: Set `RFID_METHOD = "serial"` and specify the COM port (e.g. `COM3` on Windows, `/dev/ttyUSB0` on Linux).
2. **Launch the Bridge**:
   ```bash
   cd hardware
   pip install -r requirements_bridge.txt
   python rfid_bridge.py
   ```
3. **Frontend Connection**: The React top bar indicates hardware status with a green indicator (`RFID Connected`). When a card is scanned, the card UID is broadcast over WebSocket (`ws://localhost:8765`) to automatically fill check-in, checkout, or card registration forms.

---

## 9. Customer Interaction & Portal Architecture

### Current Operational Model
ValetOS is intentionally designed as a **high-security, internal facility operations platform**:
- **Check-In**: Customers pull up to the valet bay. The attendant taps an RFID card or issues a printed ticket ID to the customer.
- **Retrieval**: Customers return to the valet counter and hand their physical RFID card or ticket to the staff. Attendants tap the card to trigger exit scanning, dynamic fee calculation, and retrieval dispatch.
- **Lost Token Recovery**: If a customer misplaces their physical token, staff use the **Lost Token** dialog to look up the vehicle/phone and trigger an automated SMS OTP to verify the customer before releasing the vehicle.

### Customer Self-Service / Vehicle Tracking
Currently, customer operations are handled through attendants at the front desk rather than an external customer login. If your facility requires customer-facing live tracking or self-retrieval requests:
- Public endpoints can be routed from `/api/tickets/<pk>/` using an unauthenticated public token or signed URL (e.g. printed as a QR code on customer receipts).
- Customers can scan the QR code to view live vehicle status (`parked`, `retrieval_pending`, `retrieved`) without requiring access to internal admin dashboards.


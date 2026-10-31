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

**Current Status**: **Not Supported**

- ValetOS is currently built as a responsive Single Page Application (SPA) using React 18 and Vite.
- While the user interface is fully optimized for mobile devices and tablets used by valet staff, it does **not** currently include:
  - Web App Manifest (`manifest.webmanifest` / `manifest.json`)
  - Service Workers for offline asset caching
  - Browser install prompts ("Add to Home Screen")
- **PWA Roadmap**: PWA support can be integrated by adding `@vite-pwa/plugin` to enable offline ticket queue caching and home screen installation on Android/iOS devices.

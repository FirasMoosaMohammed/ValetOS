# ValetOS — Intelligent Valet Parking Management System

ValetOS is a modern, real-time valet parking operations platform engineered for hotels, airports, shopping malls, and commercial facilities. It combines automated slot allocation, attendant queue dispatching, RFID token tracking, fee calculation, and thermal receipt printing into an intuitive management dashboard.

---

## Key Features

- **Automated Check-In & Slot Assignment**: Instant ticket generation with automated slot allocation by vehicle type (Bike, Car, SUV, Van) and VIP priority lane routing.
- **Attendant Queue & Task Dispatch**: Workload-balanced task assignment algorithm routing valet staff for vehicle parking and customer retrieval.
- **Interactive Slot Map**: Real-time visual slot grid indicating occupancy, slot categories, and vehicle assignments.
- **Lost Token Recovery via OTP**: Built-in customer lookup and secure OTP SMS verification workflow for misplaced RFID tokens.
- **Dynamic Billing & Invoicing**: Configurable hourly rates, grace periods, minimum charges per vehicle class, and ESC/POS thermal receipt printing.
- **Staff & Shift Management**: Shift clock-in/out tracking with active and completed task metrics.
- **Hardware Bridge**: High-speed WebSocket bridge connecting desktop USB RFID readers (HID keyboard emulation & RS232 serial) and thermal receipt printers.
- **Role-Based Access Control**: Strict segregation of duties between Administrators and Valet Attendants with JWT authentication.

---

## Architecture & Tech Stack

- **Frontend**: React 18, Vite, React Router 6, Axios, Custom Modular CSS tokens.
- **Backend**: Python 3, Django 4.2, Django REST Framework, SimpleJWT, SQLite / PostgreSQL.
- **Hardware Integration**: Python WebSocket server, `python-escpos`, `pyserial`, `keyboard`.

---

## Getting Started

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- Git

---

### 2. Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment**:
   ```bash
   # Windows
   python -m venv valet_env
   valet_env\Scripts\activate

   # macOS / Linux
   python3 -m venv valet_env
   source valet_env/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Apply database migrations**:
   ```bash
   python manage.py migrate
   ```

5. **Start the development server**:
   ```bash
   python manage.py runserver
   ```
   The backend API will be running at `http://127.0.0.1:8000/`.

---

### 3. Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   The frontend application will be running at `http://localhost:5173/`.

---

## User & Account Management

### Creating an Admin Account
To create the initial administrator account, run Django's `createsuperuser` command from the `backend/` directory:

```bash
python manage.py createsuperuser
```
Follow the interactive prompts to provide a username, email address, and secure password.
Superusers are automatically provisioned with the `admin` role and have full access to both the ValetOS web console and the Django admin interface at `http://127.0.0.1:8000/django-admin/`.

### Creating Valet Attendant Accounts
Once logged in as an Administrator:
1. Open the ValetOS web portal at `http://localhost:5173/`.
2. Sign in with your Administrator credentials.
3. Navigate to **Staff Management** (`/admin/staff`) in the navigation bar.
4. Click **Add Attendant** and fill in the attendant's name, username, email, phone number, and password.
5. Attendants can then sign in directly to their dedicated **Valet Dashboard** (`/valet/dashboard`) to view park and retrieve tasks.

---

## Initial System Configuration

Once logged in as an Administrator, configure your facility settings:
1. **Rates (`/admin/rates`)**: Set hourly rates, minimum charges, and grace periods for each vehicle type.
2. **Slots (`/admin/slots`)**: Define parking slots (e.g. `A1`, `B1`, `VIP1`) and assign zones and categories.
3. **RFID Cards (`/admin/rfid-cards`)**: Register customer RFID card tokens for fast tap-and-go check-in.

---

## Hardware Bridge (Optional)

To connect physical USB RFID readers or ESC/POS thermal printers:
```bash
cd hardware
pip install -r requirements_bridge.txt
python rfid_bridge.py
```
The bridge opens a WebSocket service on `ws://localhost:8765`, which the ValetOS web interface automatically detects.

---

## License

This project is licensed under the MIT License.

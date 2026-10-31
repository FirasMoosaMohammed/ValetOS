import api from './axios'

// Auth
export const login = (username, password) =>
  api.post('/api/auth/login/', { username, password })
export const getMe = () => api.get('/api/auth/me/')

// RFID Cards
export const getRFIDCards = (search = '') =>
  api.get('/api/rfid-cards/', { params: search ? { search } : {} })
export const createRFIDCard = (data) => api.post('/api/rfid-cards/', data)
export const lookupRFID = (uid) =>
  api.get(`/api/rfid-cards/${encodeURIComponent(uid)}/lookup/`)

// Slots
export const getSlots = (params = {}) => api.get('/api/slots/', { params })
export const getAvailableSlots = (vehicleType) =>
  api.get('/api/slots/available/', { params: { vehicle_type: vehicleType } })
export const createSlot = (data) => api.post('/api/slots/', data)
export const updateSlot = (id, data) => api.patch(`/api/slots/${id}/`, data)
export const deleteSlot = (id) => api.delete(`/api/slots/${id}/`)
export const getSlotMap = () => api.get('/api/slots/map/')

// Parking actions
export const parkingEntry = (data) => api.post('/api/parking/entry/', data)
export const parkingExit = (data) => api.post('/api/parking/exit/', data)

// Sessions
export const getActiveSessions = () => api.get('/api/parking/active-sessions/')
export const getSessionHistory = (params = {}) =>
  api.get('/api/parking/sessions/history/', { params })
export const getReceipt = (sessionId) =>
  api.get(`/api/parking/sessions/${sessionId}/receipt/`)
export const exportSessions = (params = {}) =>
  api.get('/api/parking/sessions/export/', { params, responseType: 'blob' })

// Rates & Payments
export const getRates = () => api.get('/api/rates/')
export const saveRates = (data) => api.post('/api/rates/', data)
export const getPaymentSummary = () => api.get('/api/payments/summary/')

// Dashboard
export const getDashboardStats = () => api.get('/api/dashboard/stats/')

// Staff (admin)
export const getStaff = () => api.get('/api/auth/staff/')
export const createStaff = (data) => api.post('/api/auth/staff/', data)
export const updateStaff = (id, data) => api.patch(`/api/auth/staff/${id}/`, data)
export const deleteStaff = (id) => api.delete(`/api/auth/staff/${id}/`)

// Shift management
export const startShift = (id) => api.post(`/api/staff/${id}/start-shift/`)
export const endShift = (id) => api.post(`/api/staff/${id}/end-shift/`)
export const getOnShift = () => api.get('/api/staff/on-shift/')

import api from './axios'

export const fetchCurrentUser = () => api.get('/api/auth/me/')
export const getStaff     = ()     => api.get('/api/auth/staff/')
export const createStaff  = data   => api.post('/api/auth/staff/', data)
export const updateStaff  = (id, data) => api.patch(`/api/auth/staff/${id}/`, data)
export const startShift   = id     => api.post(`/api/auth/staff/${id}/start-shift/`)
export const endShift     = id     => api.post(`/api/auth/staff/${id}/end-shift/`)
export const getOnShift   = ()     => api.get('/api/auth/staff/on-shift/')
export const getRFIDCards = (search = '') => api.get('/api/rfid-cards/', { params: search ? { search } : {} })
export const createRFIDCard = data => api.post('/api/rfid-cards/', data)
export const flagCard     = (id, data) => api.post(`/api/rfid-cards/${id}/flag/`, data)
export const getRates     = ()     => api.get('/api/rates/')
export const saveRates    = data   => api.post('/api/rates/', data)
export const getExceptions = (params = {}) => api.get('/api/exceptions/', { params })
export const lostToken    = data   => api.post('/api/exceptions/lost-token/', data)
export const verifyOTP    = data   => api.post('/api/exceptions/verify-otp/', data)

// Enhancement 1 — VIP toggle
export const setVIP = (id, data) => api.patch(`/api/rfid-cards/${id}/vip/`, data)

// Enhancement 3 — OTP
export const otpSend           = data  => api.post('/api/otp/send/', data)
export const otpVerify         = data  => api.post('/api/otp/verify/', data)
export const otpCustomerLookup = params => api.get('/api/otp/customer-lookup/', { params })

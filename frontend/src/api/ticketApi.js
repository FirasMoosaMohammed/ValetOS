import api from './axios'

export const entryLookup  = uid => api.get(`/api/rfid-cards/${encodeURIComponent(uid)}/lookup/`)
export const ticketEntry  = data => api.post('/api/tickets/entry/', data)
export const exitScan     = data => api.post('/api/tickets/exit-scan/', data)
export const completeExit = data => api.post('/api/tickets/complete-exit/', data)
export const handover     = id   => api.post(`/api/tickets/${id}/handover/`)
export const getTickets   = (params = {}) => api.get('/api/tickets/', { params })
export const getTicket    = id   => api.get(`/api/tickets/${id}/`)
export const getReceipt   = id   => api.get(`/api/tickets/${id}/receipt/`)
export const exportTickets = (params = {}) => api.get('/api/tickets/export/', { params, responseType: 'blob' })
export const getDashboardStats = () => api.get('/api/dashboard/stats/')

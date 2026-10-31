import api from './axios'

export const getSlots          = (params = {}) => api.get('/api/slots/', { params })
export const createSlot        = data  => api.post('/api/slots/', data)
export const updateSlot        = (id, data) => api.patch(`/api/slots/${id}/`, data)
export const deleteSlot        = id    => api.delete(`/api/slots/${id}/`)
export const getAvailableSlots = (vt, isVip = false) =>
  api.get('/api/slots/available/', { params: { vehicle_type: vt, is_vip: isVip } })
export const getSlotMap        = ()    => api.get('/api/slots/map/')

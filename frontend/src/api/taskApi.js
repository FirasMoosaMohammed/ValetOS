import api from './axios'

export const getMyTasks       = ()  => api.get('/api/tasks/my-tasks/')
export const confirmParked    = id  => api.post(`/api/tasks/${id}/confirm-parked/`)
export const confirmRetrieved = id  => api.post(`/api/tasks/${id}/confirm-retrieved/`)
export const getValetHistory  = ()  => api.get('/api/valet/history/')

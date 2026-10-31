import axios from 'axios'

const BASE_URL = 'http://127.0.0.1:8000'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
}, err => Promise.reject(err))

api.interceptors.response.use(
  res => res,
  async err => {
    const orig = err.config

    // If the failed request was a login or refresh request, don't trigger the interceptor redirect
    if (orig?.url?.includes('/api/auth/login') || orig?.url?.includes('/api/auth/refresh')) {
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !orig._retry) {
      orig._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const res = await axios.post(`${BASE_URL}/api/auth/refresh/`, { refresh })
          localStorage.setItem('access_token', res.data.access)
          orig.headers.Authorization = `Bearer ${res.data.access}`
          return api(orig)
        } catch {
          localStorage.clear()
          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
        }
      } else {
        localStorage.clear()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api

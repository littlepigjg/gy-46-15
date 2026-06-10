import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const getUrls = () => api.get('/urls')
export const addUrl = (data) => api.post('/urls', data)
export const deleteUrl = (id) => api.delete(`/urls/${id}`)
export const updateUrl = (id, data) => api.put(`/urls/${id}`, data)
export const getUrl = (id) => api.get(`/urls/${id}`)
export const getScreenshots = (urlId) => api.get(`/urls/${urlId}/screenshots`)
export const deleteScreenshot = (id) => api.delete(`/screenshots/${id}`)
export const triggerScreenshot = (urlId) => api.post(`/urls/${urlId}/screenshot`)

export const getHealthChecks = (urlId, limit = 50) => api.get(`/urls/${urlId}/health-checks`, { params: { limit } })
export const getHealthCheckDetail = (id) => api.get(`/health-checks/${id}`)
export const getHealthTrend = (urlId, days = 7) => api.get(`/urls/${urlId}/health-trend`, { params: { days } })

export const getAlerts = (resolved = false, limit = 50) => api.get('/alerts', { params: { resolved, limit } })
export const getUrlAlerts = (urlId) => api.get(`/urls/${urlId}/alerts`)
export const resolveAlert = (id) => api.put(`/alerts/${id}/resolve`)

export const getDashboardSummary = () => api.get('/dashboard/summary')

export default api

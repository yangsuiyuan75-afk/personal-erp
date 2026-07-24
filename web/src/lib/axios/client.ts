import axios from 'axios'
import { getAccessToken, setAccessToken } from '@/lib/auth-session'

let pendingRequests = 0
const requestLoadingListeners = new Set<() => void>()

export function subscribeRequestLoading(listener: () => void) {
  requestLoadingListeners.add(listener)
  return () => requestLoadingListeners.delete(listener)
}

export function isRequestLoading() {
  return pendingRequests > 0
}

function updatePendingRequests(delta: number) {
  pendingRequests = Math.max(0, pendingRequests + delta)
  requestLoadingListeners.forEach((listener) => listener())
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1',
  timeout: 30_000,
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  updatePendingRequests(1)
  config.headers.set('x-request-id', crypto.randomUUID())
  const accessToken = getAccessToken()
  if (accessToken) config.headers.set('authorization', `Bearer ${accessToken}`)
  return config
})

let refreshRequest: Promise<string> | null = null

apiClient.interceptors.response.use(
  (response) => {
    updatePendingRequests(-1)
    return response
  },
  async (error) => {
    updatePendingRequests(-1)
    const original = error.config
    const isAuthRoute = String(original?.url ?? '').includes('/auth/')
    if (error.response?.status !== 401 || original?._retried || isAuthRoute) throw error

    original._retried = true
    refreshRequest ??= apiClient
      .post<{ data: { accessToken: string } }>('/auth/refresh')
      .then((response) => {
        setAccessToken(response.data.data.accessToken)
        return response.data.data.accessToken
      })
      .finally(() => {
        refreshRequest = null
      })
    const token = await refreshRequest
    original.headers.set('authorization', `Bearer ${token}`)
    return apiClient(original)
  },
)

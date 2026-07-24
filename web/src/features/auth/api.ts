import { apiClient } from '@/lib/axios/client'
import { setAccessToken } from '@/lib/auth-session'

export interface AuthUser {
  id: string
  username: string
}

interface SessionResponse {
  user: AuthUser
  accessToken: string
}

export async function getAuthStatus(): Promise<{
  initialized: boolean
  recoveryRequired?: boolean
}> {
  const response = await apiClient.get<{
    data: { initialized: boolean; recoveryRequired?: boolean }
  }>('/auth/status')
  return response.data.data
}

async function acceptSession(
  request: Promise<{ data: { data: SessionResponse } }>,
): Promise<AuthUser> {
  const response = await request
  setAccessToken(response.data.data.accessToken)
  return response.data.data.user
}

export function bootstrapAdmin(payload: { username: string; password: string }): Promise<AuthUser> {
  return acceptSession(apiClient.post('/auth/bootstrap', payload))
}

export function login(payload: { username: string; password: string }): Promise<AuthUser> {
  return acceptSession(apiClient.post('/auth/login', payload))
}

export function refreshSession(): Promise<AuthUser> {
  return acceptSession(apiClient.post('/auth/refresh'))
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
  setAccessToken(null)
}

export async function changePassword(payload: {
  currentPassword: string
  newPassword: string
}): Promise<void> {
  await apiClient.patch('/auth/password', payload)
  setAccessToken(null)
}

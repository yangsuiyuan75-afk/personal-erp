import { apiClient } from '@/lib/axios/client'

export type OneDriveStatusCode =
  | 'CLIENT_ID_MISSING'
  | 'NOT_CONNECTED'
  | 'AUTHORIZING'
  | 'CONNECTED'
  | 'REAUTH_REQUIRED'
  | 'GRAPH_UNREACHABLE'
  | 'STORAGE_FULL'

export interface DeviceCode {
  userCode: string
  verificationUri: string
  expiresAt: string
  message: string
}

export interface OneDriveStatus {
  code: OneDriveStatusCode
  label: string
  configured: boolean
  externalConfigurationStatus: 'CONFIGURED' | 'WAITING_FOR_EXTERNAL_CONFIGURATION'
  mockProviderAvailable: boolean
  authority: string
  scopes: string[]
  account?: { username: string; displayName?: string }
  drive?: {
    id: string
    type: string
    rootFolder: string
    connectedAt: string
    quota?: { total?: number; used?: number; remaining?: number; state?: string }
  }
  deviceCode?: DeviceCode
}

export async function getOneDriveStatus(): Promise<OneDriveStatus> {
  const response = await apiClient.get<{ data: OneDriveStatus }>('/onedrive/status')
  return response.data.data
}

export async function startOneDriveConnection(): Promise<DeviceCode> {
  const response = await apiClient.post<{ data: DeviceCode }>('/onedrive/connect/start')
  return response.data.data
}

export async function disconnectOneDrive(): Promise<void> {
  await apiClient.delete('/onedrive/connection')
}

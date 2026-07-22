import { apiClient } from '@/lib/axios/client';

export interface Health {
  status: 'operational' | 'degraded';
  database: 'connected' | 'unavailable';
  checkedAt: string;
}

export async function getHealth(): Promise<Health> {
  const response = await apiClient.get<{ data: Health }>('/health');
  return response.data.data;
}

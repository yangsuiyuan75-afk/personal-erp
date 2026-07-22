import axios from 'axios';
import { getAccessToken, setAccessToken } from '@/lib/auth-session';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1',
  timeout: 30_000,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  config.headers.set('x-request-id', crypto.randomUUID());
  const accessToken = getAccessToken();
  if (accessToken) config.headers.set('authorization', `Bearer ${accessToken}`);
  return config;
});

let refreshRequest: Promise<string> | null = null;

apiClient.interceptors.response.use(undefined, async (error) => {
  const original = error.config;
  const isAuthRoute = String(original?.url ?? '').includes('/auth/');
  if (error.response?.status !== 401 || original?._retried || isAuthRoute) throw error;

  original._retried = true;
  refreshRequest ??= apiClient
    .post<{ data: { accessToken: string } }>('/auth/refresh')
    .then((response) => {
      setAccessToken(response.data.data.accessToken);
      return response.data.data.accessToken;
    })
    .finally(() => {
      refreshRequest = null;
    });
  const token = await refreshRequest;
  original.headers.set('authorization', `Bearer ${token}`);
  return apiClient(original);
});

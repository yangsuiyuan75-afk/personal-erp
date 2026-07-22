import axios from 'axios';

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.error?.message ??
      (error.code === 'ERR_NETWORK' ? '无法连接本地 API' : '请求失败')
    );
  }
  return error instanceof Error ? error.message : '操作失败';
}

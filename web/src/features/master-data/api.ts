import { apiClient } from '@/lib/axios/client';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface MasterRow {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface MasterListResponse {
  data: MasterRow[];
  meta: PageMeta;
}

export interface ListParams extends Record<string, unknown> {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  createdFrom?: string;
  createdTo?: string;
  categoryId?: string;
  productId?: string;
  purchaseChannelId?: string;
  salesChannelId?: string;
  module?: string;
  action?: string;
  entityType?: string;
  result?: string;
  locationId?: string;
  skuId?: string;
  stockStatus?: string;
  supplierId?: string;
  transactionType?: string;
  documentStatus?: string;
  buyerId?: string;
  customerId?: string;
  sourceType?: string;
  responsibility?: string;
  resolutionType?: string;
  accountId?: string;
  direction?: string;
  category?: string;
  month?: string;
  provider?: string;
  fileStatus?: string;
  backupStatus?: string;
  trigger?: string;
  locked?: string;
}

export async function listMasterData(
  resource: string,
  params: ListParams,
): Promise<MasterListResponse> {
  const response = await apiClient.get<MasterListResponse>(`/master-data/${resource}`, { params });
  return response.data;
}

export async function createMasterData(
  resource: string,
  payload: Record<string, unknown>,
): Promise<MasterRow> {
  const response = await apiClient.post<{ data: MasterRow }>(`/master-data/${resource}`, payload);
  return response.data.data;
}

export async function updateMasterData(
  resource: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<MasterRow> {
  const response = await apiClient.patch<{ data: MasterRow }>(
    `/master-data/${resource}/${id}`,
    payload,
  );
  return response.data.data;
}

export async function deactivateMasterData(resource: string, id: string): Promise<void> {
  await apiClient.delete(`/master-data/${resource}/${id}`);
}

export async function exportMasterData(resource: string, params: ListParams): Promise<void> {
  const response = await apiClient.get(`/master-data/${resource}/export`, {
    params,
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${resource}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

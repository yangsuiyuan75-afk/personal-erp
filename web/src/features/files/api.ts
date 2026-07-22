import type {
  ListParams,
  MasterListResponse,
  MasterRow,
  PageMeta,
} from '@/features/master-data/api';
import { apiClient } from '@/lib/axios/client';

export type FileProvider = 'ONEDRIVE' | 'MOCK_LOCAL';
export type FileStatus = 'PENDING' | 'UPLOADING' | 'SYNCED' | 'FAILED' | 'DELETED';

export interface FileAsset extends MasterRow {
  provider: FileProvider;
  driveId: string;
  itemId: string;
  parentItemId?: string;
  logicalPath: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  eTag?: string;
  status: FileStatus;
  lastError?: string;
  productImage?: {
    id: string;
    isPrimary: boolean;
    sortOrder: number;
    product: { id: string; code: string; name: string };
  };
  associations: Array<{
    id: string;
    module: string;
    entityType: string;
    entityId: string;
    label?: string;
  }>;
}

export interface ProductImage {
  id: string;
  productId: string;
  fileAssetId: string;
  isPrimary: boolean;
  sortOrder: number;
  fileAsset: FileAsset;
}

export interface ProductImagesResponse {
  product: { id: string; code: string; name: string };
  images: ProductImage[];
}

export type OneDriveStatusCode =
  | 'CLIENT_ID_MISSING'
  | 'NOT_CONNECTED'
  | 'AUTHORIZING'
  | 'CONNECTED'
  | 'REAUTH_REQUIRED'
  | 'GRAPH_UNREACHABLE'
  | 'STORAGE_FULL';

export interface OneDriveStatus {
  code: OneDriveStatusCode;
  label: string;
  configured: boolean;
  externalConfigurationStatus: 'CONFIGURED' | 'WAITING_FOR_EXTERNAL_CONFIGURATION';
  mockProviderAvailable: boolean;
  authority: string;
  scopes: string[];
  account?: { username: string; displayName?: string };
  drive?: {
    id: string;
    type: string;
    rootFolder: string;
    connectedAt: string;
    quota?: { total?: number; used?: number; remaining?: number; state?: string };
  };
  deviceCode?: DeviceCode;
}

export interface DeviceCode {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  message: string;
}

function identity(row: FileAsset): FileAsset {
  return { ...row, code: row.sha256.slice(0, 10), name: row.fileName };
}

export async function listFiles(params: ListParams): Promise<MasterListResponse> {
  const response = await apiClient.get<{ data: FileAsset[]; meta: PageMeta }>('/files', { params });
  return { ...response.data, data: response.data.data.map((row) => identity(row)) };
}

export async function uploadFile(input: {
  file: File;
  logicalPath: string;
  module?: string;
  entityType?: string;
  entityId?: string;
  label?: string;
}): Promise<FileAsset> {
  const body = new FormData();
  body.set('file', input.file);
  body.set('logicalPath', input.logicalPath);
  for (const key of ['module', 'entityType', 'entityId', 'label'] as const) {
    if (input[key]) body.set(key, input[key]);
  }
  const response = await apiClient.post<{ data: FileAsset }>('/files', body);
  return identity(response.data.data);
}

export async function deleteFile(id: string): Promise<void> {
  await apiClient.delete(`/files/${id}`);
}

export async function retryFile(id: string): Promise<FileAsset> {
  const response = await apiClient.post<{ data: FileAsset }>(`/files/${id}/retry`);
  return identity(response.data.data);
}

export async function getFileBlob(id: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/files/${id}/content`, { responseType: 'blob' });
  return response.data;
}

export async function downloadFile(file: Pick<FileAsset, 'id' | 'fileName'>): Promise<void> {
  const blob = await getFileBlob(file.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportFiles(params: ListParams): Promise<void> {
  const response = await apiClient.get('/files/export', { params, responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'file-assets.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export async function getProductImages(productId: string): Promise<ProductImagesResponse> {
  const response = await apiClient.get<{ data: ProductImagesResponse }>(
    `/files/products/${productId}/images`,
  );
  return response.data.data;
}

export async function uploadProductImages(input: {
  productId: string;
  files: File[];
  isPrimary?: boolean;
}): Promise<ProductImagesResponse> {
  const body = new FormData();
  input.files.forEach((file) => body.append('files', file));
  body.set('isPrimary', String(Boolean(input.isPrimary)));
  const response = await apiClient.post<{ data: ProductImagesResponse }>(
    `/files/products/${input.productId}/images`,
    body,
  );
  return response.data.data;
}

export async function setPrimaryImage(productId: string, imageId: string): Promise<void> {
  await apiClient.post(`/files/products/${productId}/images/${imageId}/primary`);
}

export async function reorderProductImages(productId: string, imageIds: string[]): Promise<void> {
  await apiClient.patch(`/files/products/${productId}/images/reorder`, { imageIds });
}

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
  await apiClient.delete(`/files/products/${productId}/images/${imageId}`);
}

export async function getOneDriveStatus(): Promise<OneDriveStatus> {
  const response = await apiClient.get<{ data: OneDriveStatus }>('/onedrive/status');
  return response.data.data;
}

export async function startOneDriveConnection(): Promise<DeviceCode> {
  const response = await apiClient.post<{ data: DeviceCode }>('/onedrive/connect/start');
  return response.data.data;
}

export async function disconnectOneDrive(): Promise<void> {
  await apiClient.delete('/onedrive/connection');
}

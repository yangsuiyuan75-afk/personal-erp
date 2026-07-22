import { apiClient } from '@/lib/axios/client';
import type { ListParams, MasterListResponse, MasterRow } from '@/features/master-data/api';

export interface InventoryBalanceRow extends MasterRow {
  locationId: string;
  skuId: string;
  skuCode: string;
  stockStatus: string;
  onHandQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  averageCost: string;
  inventoryValue: string;
  location: { id: string; code: string; name: string; salesChannel?: { name: string } };
  sku: {
    id: string;
    code: string;
    barcode: string | null;
    name: string;
    product: { id: string; code: string; name: string };
    baseUnit: { id: string; code: string; name: string; decimalScale: number };
  };
}

export interface OpeningPreviewRow {
  rowNumber: number;
  locationCode: string;
  skuCode: string;
  stockStatus: string;
  quantity: string;
  unitCost: string;
  batchNo: string;
  remark?: string;
  locationId?: string;
  locationName?: string;
  skuId?: string;
  skuName?: string;
  errors: string[];
}

export interface OpeningPreview {
  valid: boolean;
  rowCount: number;
  validCount: number;
  totalQuantity: string;
  totalValue: string;
  rows: OpeningPreviewRow[];
}

async function list(path: string, params: ListParams): Promise<MasterListResponse> {
  const response = await apiClient.get<MasterListResponse>(path, { params });
  return {
    ...response.data,
    data: response.data.data.map((row) => ({ ...row, status: row.status ?? 'ACTIVE' })),
  };
}

export async function listBalances(params: ListParams): Promise<MasterListResponse> {
  return list('/inventory/balances', params);
}

export async function listLocations(params: ListParams): Promise<MasterListResponse> {
  return list('/inventory/locations', params);
}

export async function listTransactions(params: ListParams): Promise<MasterListResponse> {
  const response = await list('/inventory/transactions', params);
  return {
    ...response,
    data: response.data.map((row) => ({
      ...row,
      code: String(row.transactionNo),
      name: String(row.sourceType),
    })),
  };
}

export async function listBatches(params: ListParams): Promise<MasterListResponse> {
  const response = await list('/inventory/batches', params);
  return {
    ...response,
    data: response.data.map((row) => ({
      ...row,
      code: String(row.batchNo),
      name: String((row.sku as { name?: string } | undefined)?.name ?? row.batchNo),
    })),
  };
}

export async function createLocation(payload: Record<string, unknown>): Promise<MasterRow> {
  const response = await apiClient.post<{ data: MasterRow }>('/inventory/locations', payload);
  return response.data.data;
}

export async function previewOpeningFile(file: File): Promise<OpeningPreview> {
  const body = new FormData();
  body.append('file', file);
  const response = await apiClient.post<{ data: OpeningPreview }>(
    '/inventory/openings/preview-file',
    body,
  );
  return response.data.data;
}

export async function createOpening(payload: {
  importKey: string;
  occurredAt: string;
  remark?: string;
  rows: OpeningPreviewRow[];
}): Promise<{ id: string; openingNo: string }> {
  const response = await apiClient.post<{ data: { id: string; openingNo: string } }>(
    '/inventory/openings',
    {
      ...payload,
      rows: payload.rows.map(
        ({ locationCode, skuCode, stockStatus, quantity, unitCost, batchNo, remark }) => ({
          locationCode,
          skuCode,
          stockStatus,
          quantity,
          unitCost,
          batchNo,
          remark,
        }),
      ),
    },
  );
  return response.data.data;
}

export async function postInventoryDocument(
  kind: 'openings' | 'adjustments' | 'transfers',
  id: string,
): Promise<void> {
  await apiClient.post(`/inventory/${kind}/${id}/post`, undefined, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export async function createAdjustment(payload: Record<string, unknown>): Promise<{ id: string }> {
  const response = await apiClient.post<{ data: { id: string } }>(
    '/inventory/adjustments',
    payload,
  );
  return response.data.data;
}

export async function createTransfer(payload: Record<string, unknown>): Promise<{ id: string }> {
  const response = await apiClient.post<{ data: { id: string } }>('/inventory/transfers', payload);
  return response.data.data;
}

export async function downloadOpeningTemplate(): Promise<void> {
  const response = await apiClient.get('/inventory/openings/template', { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = '期初库存模板.csv';
  link.click();
  URL.revokeObjectURL(url);
}

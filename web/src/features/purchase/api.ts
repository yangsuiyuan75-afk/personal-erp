import { apiClient } from '@/lib/axios/client';
import type { ListParams, MasterListResponse, MasterRow } from '@/features/master-data/api';

export type PurchaseView = 'prices' | 'orders' | 'receipts' | 'returns' | 'payables' | 'credits';

const endpoints: Record<PurchaseView, string> = {
  prices: '/purchase/prices',
  orders: '/purchase/orders',
  receipts: '/purchase/receipts',
  returns: '/purchase/returns',
  payables: '/purchase/payables',
  credits: '/purchase/supplier-credits',
};

function rowIdentity(view: PurchaseView, row: MasterRow): MasterRow {
  const codeFields: Record<PurchaseView, string> = {
    prices: 'id',
    orders: 'orderNo',
    receipts: 'receiptNo',
    returns: 'returnNo',
    payables: 'payableNo',
    credits: 'creditNo',
  };
  const name =
    (row.supplier as { name?: string } | undefined)?.name ??
    (row.purchaseOrder as { supplier?: { name?: string } } | undefined)?.supplier?.name ??
    (row.sku as { name?: string } | undefined)?.name ??
    String(row[codeFields[view]] ?? '');
  return {
    ...row,
    code: String(row[codeFields[view]] ?? row.id),
    name,
    status: (row.status as 'ACTIVE' | 'INACTIVE') ?? 'ACTIVE',
  };
}

export async function listPurchase(
  view: PurchaseView,
  params: ListParams,
): Promise<MasterListResponse> {
  const response = await apiClient.get<MasterListResponse>(endpoints[view], { params });
  return { ...response.data, data: response.data.data.map((row) => rowIdentity(view, row)) };
}

async function create(path: string, payload: Record<string, unknown>): Promise<MasterRow> {
  const response = await apiClient.post<{ data: MasterRow }>(path, payload);
  return response.data.data;
}

export const createPurchasePrice = (payload: Record<string, unknown>) =>
  create('/purchase/prices', payload);
export const createPurchaseOrder = (payload: Record<string, unknown>) =>
  create('/purchase/orders', payload);
export const createPurchaseReceipt = (payload: Record<string, unknown>) =>
  create('/purchase/receipts', payload);
export const createPurchaseReturn = (payload: Record<string, unknown>) =>
  create('/purchase/returns', payload);

export async function transitionPurchase(
  kind: 'orders' | 'receipts' | 'returns',
  id: string,
  action: 'confirm' | 'cancel' | 'post',
): Promise<void> {
  await apiClient.post(`/purchase/${kind}/${id}/${action}`, undefined, {
    headers: action === 'post' ? { 'Idempotency-Key': crypto.randomUUID() } : undefined,
  });
}

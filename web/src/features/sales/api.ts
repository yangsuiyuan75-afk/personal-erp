import type { ListParams, MasterListResponse, MasterRow } from '@/features/master-data/api';
import { apiClient } from '@/lib/axios/client';

export type SalesView = 'prices' | 'orders' | 'issues' | 'returns' | 'receivables' | 'refunds';

const endpoints: Record<SalesView, string> = {
  prices: '/sales/prices',
  orders: '/sales/orders',
  issues: '/sales/issues',
  returns: '/sales/returns',
  receivables: '/sales/receivables',
  refunds: '/sales/customer-refunds',
};

function rowIdentity(view: SalesView, row: MasterRow): MasterRow {
  const codeFields: Record<SalesView, string> = {
    prices: 'id',
    orders: 'orderNo',
    issues: 'issueNo',
    returns: 'returnNo',
    receivables: 'receivableNo',
    refunds: 'refundNo',
  };
  const name =
    (row.customer as { name?: string } | undefined)?.name ??
    (row.salesChannel as { name?: string } | undefined)?.name ??
    (row.sku as { name?: string } | undefined)?.name ??
    String(row[codeFields[view]] ?? '');
  return {
    ...row,
    code: String(row[codeFields[view]] ?? row.id),
    name,
    status: (row.status as 'ACTIVE' | 'INACTIVE') ?? 'ACTIVE',
  };
}

export async function listSales(view: SalesView, params: ListParams): Promise<MasterListResponse> {
  const response = await apiClient.get<MasterListResponse>(endpoints[view], { params });
  return { ...response.data, data: response.data.data.map((row) => rowIdentity(view, row)) };
}

async function create(path: string, payload: Record<string, unknown>): Promise<MasterRow> {
  const response = await apiClient.post<{ data: MasterRow }>(path, payload);
  return response.data.data;
}

export const createSalesPrice = (payload: Record<string, unknown>) =>
  create('/sales/prices', payload);
export const createSalesOrder = (payload: Record<string, unknown>) =>
  create('/sales/orders', payload);
export async function updateSalesIssue(
  id: string,
  payload: Record<string, unknown>,
): Promise<MasterRow> {
  const response = await apiClient.patch<{ data: MasterRow }>(`/sales/issues/${id}`, payload);
  return response.data.data;
}
export const createSalesReturn = (payload: Record<string, unknown>) =>
  create('/sales/returns', payload);

export async function transitionSales(
  kind: 'orders' | 'issues' | 'returns',
  id: string,
  action: 'confirm' | 'cancel' | 'post',
): Promise<void> {
  await apiClient.post(`/sales/${kind}/${id}/${action}`, undefined, {
    headers: action === 'post' ? { 'Idempotency-Key': crypto.randomUUID() } : undefined,
  });
}

import type { ListParams, MasterListResponse, MasterRow } from '@/features/master-data/api';
import { apiClient } from '@/lib/axios/client';

export type FinanceView =
  | 'accounts'
  | 'payables'
  | 'receivables'
  | 'payments'
  | 'receipts'
  | 'transactions'
  | 'adjustments'
  | 'analytics';

export type FinanceListView = Exclude<FinanceView, 'analytics'>;
export type FinanceOptionSource =
  'accounts' | 'payables' | 'receivables' | 'refunds' | 'credits' | 'compensation';

const endpoints: Record<FinanceListView, string> = {
  accounts: '/finance/accounts',
  payables: '/finance/payables',
  receivables: '/finance/receivables',
  payments: '/finance/payments',
  receipts: '/finance/receipts',
  transactions: '/finance/transactions',
  adjustments: '/finance/adjustments',
};

const optionEndpoints: Record<FinanceOptionSource, string> = {
  accounts: '/finance/accounts',
  payables: '/finance/payables',
  receivables: '/finance/receivables',
  refunds: '/sales/customer-refunds',
  credits: '/purchase/supplier-credits',
  compensation: '/quality/compensation-receivables',
};

function identity(view: FinanceListView | FinanceOptionSource, row: MasterRow): MasterRow {
  const codeFields: Record<string, string> = {
    accounts: 'code',
    payables: 'payableNo',
    receivables: 'receivableNo',
    payments: 'paymentNo',
    receipts: 'receiptNo',
    transactions: 'transactionNo',
    adjustments: 'adjustmentNo',
    refunds: 'refundNo',
    credits: 'creditNo',
    compensation: 'receivableNo',
  };
  const name =
    (row.account as { name?: string } | undefined)?.name ??
    (row.supplier as { name?: string } | undefined)?.name ??
    (row.customer as { name?: string } | undefined)?.name ??
    String(row.name ?? row[codeFields[view]] ?? '');
  return {
    ...row,
    code: String(row[codeFields[view]] ?? row.id),
    name,
    status: String(row.status ?? 'ACTIVE'),
  };
}

export async function listFinance(
  view: FinanceListView,
  params: ListParams,
): Promise<MasterListResponse> {
  const response = await apiClient.get<MasterListResponse>(endpoints[view], { params });
  return { ...response.data, data: response.data.data.map((row) => identity(view, row)) };
}

export async function listFinanceOptions(source: FinanceOptionSource): Promise<MasterListResponse> {
  const sortBy = source === 'accounts' ? 'code' : 'createdAt';
  const response = await apiClient.get<MasterListResponse>(optionEndpoints[source], {
    params: { page: 1, pageSize: 100, sortBy, sortOrder: 'desc' },
  });
  return { ...response.data, data: response.data.data.map((row) => identity(source, row)) };
}

export interface FinanceAnalytics {
  summary: Record<
    | 'income'
    | 'outflow'
    | 'netCashFlow'
    | 'salesRevenue'
    | 'salesCost'
    | 'grossProfit'
    | 'platformFee'
    | 'logisticsFee'
    | 'otherExpense'
    | 'qualityLoss'
    | 'supplierCompensation'
    | 'operatingResult'
    | 'outstandingReceivable'
    | 'outstandingPayable',
    string
  >;
  monthly: Array<{
    month: string;
    income: string;
    outflow: string;
    netCashFlow: string;
    salesRevenue: string;
    salesCost: string;
    grossProfit: string;
    qualityLoss: string;
  }>;
  dimensions: Record<
    'salesChannels' | 'customers' | 'suppliers' | 'purchaseChannels' | 'buyers',
    Array<{ id: string; name: string; amount: string }>
  >;
}

export async function getFinanceAnalytics(params: ListParams): Promise<FinanceAnalytics> {
  const response = await apiClient.get<{ data: FinanceAnalytics }>('/finance/analytics', {
    params,
  });
  return response.data.data;
}

async function create(path: string, payload: Record<string, unknown>): Promise<MasterRow> {
  const response = await apiClient.post<{ data: MasterRow }>(path, payload);
  return response.data.data;
}

export const createFinancialAccount = (payload: Record<string, unknown>) =>
  create('/finance/accounts', payload);
export const createPayment = (payload: Record<string, unknown>) =>
  create('/finance/payments', payload);
export const createReceipt = (payload: Record<string, unknown>) =>
  create('/finance/receipts', payload);
export const createAdjustment = (payload: Record<string, unknown>) =>
  create('/finance/adjustments', payload);

export async function postFinanceDocument(
  kind: 'payments' | 'receipts' | 'adjustments',
  id: string,
): Promise<void> {
  await apiClient.post(`/finance/${kind}/${id}/post`, undefined, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

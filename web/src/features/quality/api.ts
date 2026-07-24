import type { ListParams, MasterListResponse, MasterRow } from '@/features/master-data/api'
import { apiClient } from '@/lib/axios/client'

export type QualityView =
  | 'pending'
  | 'inspections'
  | 'issues'
  | 'claims'
  | 'settlements'
  | 'stock'
  | 'compensation'
  | 'analytics'

const endpoints: Omit<Record<QualityView, string>, 'analytics'> & { analytics: string } = {
  pending: '/quality/pending-returns',
  inspections: '/quality/inspections',
  issues: '/quality/issues',
  claims: '/quality/claims',
  settlements: '/quality/settlements',
  stock: '/quality/stock',
  compensation: '/quality/compensation-receivables',
  analytics: '/quality/analytics',
}

function rowIdentity(view: Exclude<QualityView, 'analytics'>, row: MasterRow): MasterRow {
  const fields: Record<Exclude<QualityView, 'analytics'>, string> = {
    pending: 'returnNo',
    inspections: 'inspectionNo',
    issues: 'issueNo',
    claims: 'claimNo',
    settlements: 'settlementNo',
    stock: 'id',
    compensation: 'receivableNo',
  }
  const name =
    (row.supplier as { name?: string } | undefined)?.name ??
    (row.customer as { name?: string } | undefined)?.name ??
    (row.sku as { name?: string } | undefined)?.name ??
    String(row[fields[view]] ?? '')
  return {
    ...row,
    code: String(row[fields[view]] ?? row.id),
    name,
    status: (row.status as string | undefined) ?? String(row.stockStatus ?? 'ACTIVE'),
  }
}

export async function listQuality(
  view: Exclude<QualityView, 'analytics'>,
  params: ListParams,
): Promise<MasterListResponse> {
  const response = await apiClient.get<MasterListResponse>(endpoints[view], { params })
  return { ...response.data, data: response.data.data.map((row) => rowIdentity(view, row)) }
}

export interface QualityAnalytics {
  summary: {
    issueQuantity: string
    estimatedLoss: string
    claimedAmount: string
    settledAmount: string
  }
  suppliers: Array<{
    supplierId: string
    supplierName: string
    issueQuantity: string
    loss: string
    claims: number
    settled: number
    successRate: number
  }>
  skus: Array<{
    skuId: string
    skuCode: string
    skuName: string
    issued: string
    returned: string
    returnRate: string
  }>
}

export async function getQualityAnalytics(params: ListParams): Promise<QualityAnalytics> {
  const response = await apiClient.get<{ data: QualityAnalytics }>(endpoints.analytics, { params })
  return response.data.data
}

export async function createInspection(payload: Record<string, unknown>): Promise<MasterRow> {
  const response = await apiClient.post<{ data: MasterRow }>('/quality/inspections', payload)
  return response.data.data
}

export async function confirmInspection(
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await apiClient.post(`/quality/inspections/${id}/confirm`, payload, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })
}

export async function settleClaim(
  id: string,
  payload: Record<string, unknown>,
): Promise<MasterRow> {
  const response = await apiClient.post<{ data: MasterRow }>(
    `/quality/claims/${id}/settlements`,
    payload,
    { headers: { 'Idempotency-Key': crypto.randomUUID() } },
  )
  return response.data.data
}

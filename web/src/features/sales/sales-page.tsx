import { ClipboardCheck, PackageMinus, Plus, RotateCcw, Search, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import type { MasterRow } from '@/features/master-data/api'
import { useListUrlState } from '@/features/master-data/use-list-url-state'
import { apiErrorMessage } from '@/lib/api-error'
import { enumLabel } from '@/lib/enum-label'
import type { SalesView } from './api'
import { SalesDialogs, type SalesDialogKind } from './sales-dialogs'
import { useSalesList, useSalesMutations } from './use-sales'

const views: Array<{ id: SalesView; label: string }> = [
  { id: 'orders', label: '销售订单' },
  { id: 'issues', label: '销售出库' },
  { id: 'returns', label: '销售退货' },
  { id: 'prices', label: '销售价格' },
  { id: 'receivables', label: '应收' },
  { id: 'refunds', label: '客户退款' },
]

const sortConfig: Record<SalesView, { fallback: string; allowed: string[] }> = {
  prices: {
    fallback: 'effectiveFrom',
    allowed: ['createdAt', 'effectiveFrom', 'price', 'minQuantity'],
  },
  orders: { fallback: 'orderDate', allowed: ['createdAt', 'orderDate', 'orderNo', 'totalAmount'] },
  issues: { fallback: 'occurredAt', allowed: ['createdAt', 'occurredAt', 'totalRevenue'] },
  returns: { fallback: 'occurredAt', allowed: ['createdAt', 'occurredAt', 'totalRefund'] },
  receivables: {
    fallback: 'occurredAt',
    allowed: ['createdAt', 'occurredAt', 'outstandingAmount', 'originalAmount'],
  },
  refunds: { fallback: 'createdAt', allowed: ['createdAt', 'amount', 'paidAmount'] },
}

const statusText: Record<string, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PARTIALLY_ISSUED: '部分出库',
  ISSUED: '已出库',
  POSTED: '已过账',
  CANCELLED: '已取消',
  ACTIVE: '生效中',
  INACTIVE: '已停用',
  OPEN: '待处理',
  PARTIALLY_RECEIVED: '部分收款',
  PARTIALLY_PAID: '部分退款',
  SETTLED: '已结清',
  PAID: '已退款',
  VOID: '已作废',
}

function money(value: unknown) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function sumSalesQuantity(row: MasterRow) {
  return salesItems(row).reduce((total, item) => {
    if (!item || typeof item !== 'object') return total
    const value = Number((item as { quantity?: unknown }).quantity ?? 0)
    return total + (Number.isFinite(value) ? value : 0)
  }, 0)
}

type SalesItem = { sku?: { code?: unknown; name?: unknown }; quantity?: unknown }

function salesItems(row: MasterRow): SalesItem[] {
  const items = [
    row.items,
    (row.salesIssue as { items?: unknown } | undefined)?.items,
    (row.salesReturn as { items?: unknown } | undefined)?.items,
  ].find(Array.isArray)
  if (Array.isArray(items)) return items as SalesItem[]
  const sku = row.sku
  return sku && typeof sku === 'object'
    ? [{ sku: sku as SalesItem['sku'], quantity: row.minQuantity }]
    : []
}

function salesSku(row: MasterRow) {
  const labels = salesItems(row)
    .map((item) =>
      [String(item.sku?.code ?? ''), String(item.sku?.name ?? '')].filter(Boolean).join(' · '),
    )
    .filter(Boolean)
  return labels.length ? (
    <div className="business-sku-summary">
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  ) : (
    '—'
  )
}

function quantity(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}

function status(row: MasterRow) {
  const value = String(row.status)
  return (
    <span className={`business-status business-${value.toLowerCase()}`}>
      {statusText[value] ?? enumLabel(value)}
    </span>
  )
}

function columns(view: SalesView): DataTableColumn[] {
  if (view === 'prices')
    return [
      { key: 'sku', label: 'SKU · 名称', render: salesSku, sortable: false },
      {
        key: 'minQuantity',
        label: '销售数量（起售量）',
        render: (row) => quantity(Number(row.minQuantity ?? 0)),
        sortable: false,
      },
      { key: 'customer.name', label: '客户', sortable: false },
      { key: 'salesChannel.name', label: '销售渠道', sortable: false },
      { key: 'price', label: '售价', render: (row) => money(row.price) },
      { key: 'effectiveFrom', label: '生效时间' },
      { key: 'effectiveTo', label: '失效时间', sortable: false },
      { key: 'status', label: '状态', render: status, sortable: false },
    ]
  if (view === 'orders')
    return [
      { key: 'orderNo', label: '销售单号' },
      { key: 'skuSummary', label: 'SKU · 名称', render: salesSku, sortable: false },
      { key: 'salesChannel.name', label: '销售渠道', sortable: false },
      { key: 'customer.name', label: '客户', sortable: false },
      {
        key: 'salesQuantity',
        label: '销售数量',
        render: (row) => quantity(sumSalesQuantity(row)),
        sortable: false,
      },
      { key: 'totalAmount', label: '订单金额', render: (row) => money(row.totalAmount) },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'orderDate', label: '下单时间' },
    ]
  if (view === 'issues')
    return [
      { key: 'issueNo', label: '出库单号', sortable: false },
      { key: 'skuSummary', label: 'SKU · 名称', render: salesSku, sortable: false },
      { key: 'salesOrder.orderNo', label: '销售订单', sortable: false },
      { key: 'salesChannel.name', label: '销售渠道', sortable: false },
      { key: 'customer.name', label: '客户', sortable: false },
      { key: 'location.name', label: '出库地点', sortable: false },
      {
        key: 'salesQuantity',
        label: '销售数量',
        render: (row) => quantity(sumSalesQuantity(row)),
        sortable: false,
      },
      { key: 'totalRevenue', label: '销售收入', render: (row) => money(row.totalRevenue) },
      {
        key: 'totalCost',
        label: '成本快照',
        render: (row) => money(row.totalCost),
        sortable: false,
      },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '出库时间' },
    ]
  if (view === 'returns')
    return [
      { key: 'returnNo', label: '退货单号', sortable: false },
      { key: 'skuSummary', label: 'SKU · 名称', render: salesSku, sortable: false },
      { key: 'salesIssue.issueNo', label: '原出库单', sortable: false },
      { key: 'customer.name', label: '客户', sortable: false },
      { key: 'qcLocation.name', label: '待检地点', sortable: false },
      {
        key: 'salesQuantity',
        label: '销售数量',
        render: (row) => quantity(sumSalesQuantity(row)),
        sortable: false,
      },
      { key: 'reason', label: '退货原因', sortable: false },
      { key: 'totalRefund', label: '退款金额', render: (row) => money(row.totalRefund) },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '退货时间' },
    ]
  if (view === 'receivables')
    return [
      { key: 'receivableNo', label: '应收编号', sortable: false },
      { key: 'skuSummary', label: 'SKU · 名称', render: salesSku, sortable: false },
      { key: 'customer.name', label: '客户', sortable: false },
      { key: 'salesChannel.name', label: '销售渠道', sortable: false },
      {
        key: 'salesQuantity',
        label: '销售数量',
        render: (row) => quantity(sumSalesQuantity(row)),
        sortable: false,
      },
      { key: 'originalAmount', label: '原始应收', render: (row) => money(row.originalAmount) },
      {
        key: 'adjustedAmount',
        label: '退货调整',
        render: (row) => money(row.adjustedAmount),
        sortable: false,
      },
      {
        key: 'receivedAmount',
        label: '已收',
        render: (row) => money(row.receivedAmount),
        sortable: false,
      },
      {
        key: 'outstandingAmount',
        label: '未收',
        render: (row) => <strong>{money(row.outstandingAmount)}</strong>,
      },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '发生时间' },
    ]
  return [
    { key: 'refundNo', label: '退款编号', sortable: false },
    { key: 'skuSummary', label: 'SKU · 名称', render: salesSku, sortable: false },
    { key: 'customer.name', label: '客户', sortable: false },
    { key: 'salesChannel.name', label: '销售渠道', sortable: false },
    { key: 'salesReturn.returnNo', label: '销售退货单', sortable: false },
    {
      key: 'salesQuantity',
      label: '销售数量',
      render: (row) => quantity(sumSalesQuantity(row)),
      sortable: false,
    },
    { key: 'amount', label: '应退金额', render: (row) => money(row.amount) },
    { key: 'paidAmount', label: '已退金额', render: (row) => money(row.paidAmount) },
    { key: 'status', label: '状态', render: status, sortable: false },
    { key: 'createdAt', label: '创建时间' },
  ]
}

export function SalesPage() {
  const { params, keyword, setKeyword, setParam } = useListUrlState()
  const rawView = new URLSearchParams(window.location.search).get('view')
  const view: SalesView = views.some((item) => item.id === rawView)
    ? (rawView as SalesView)
    : 'orders'
  const queryParams = useMemo(
    () => ({
      ...params,
      sortBy: sortConfig[view].allowed.includes(params.sortBy)
        ? params.sortBy
        : sortConfig[view].fallback,
    }),
    [params, view],
  )
  const list = useSalesList(view, queryParams)
  const mutations = useSalesMutations()
  const [dialog, setDialog] = useState<SalesDialogKind>()
  const [issue, setIssue] = useState<MasterRow>()
  const rows = list.data?.data ?? []
  const total = rows.reduce(
    (sum, row) =>
      sum +
      Number(
        row.totalAmount ??
          row.totalRevenue ??
          row.totalRefund ??
          row.originalAmount ??
          row.amount ??
          0,
      ),
    0,
  )
  const outstanding = rows.reduce((sum, row) => sum + Number(row.outstandingAmount ?? 0), 0)
  const actionForView: Partial<Record<SalesView, SalesDialogKind>> = {
    prices: 'price',
    orders: 'order',
    returns: 'return',
  }
  return (
    <section className="page-section business-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">销售中心</span>
          <h1>销售、出库与渠道仓</h1>
          <p>客户与渠道独立建模；出库锁定移动平均成本，退货统一进入待质检。</p>
        </div>
        {actionForView[view] ? (
          <Button
            onClick={() => {
              setIssue(undefined)
              setDialog(actionForView[view])
            }}
          >
            <Plus size={17} />{' '}
            {view === 'orders' ? '新建销售订单' : view === 'returns' ? '销售退货' : '新增售价'}
          </Button>
        ) : null}
      </header>
      <nav className="inventory-tabs" aria-label="销售视图">
        {views.map((item) => (
          <button
            className={item.id === view ? 'active' : undefined}
            key={item.id}
            onClick={() => setParam('view', item.id)}
            type="button"
          >
            <Store size={15} />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="inventory-kpis business-kpis">
        <article>
          <span>当前页业务金额</span>
          <strong>{money(total)}</strong>
          <small>{rows.length} 条记录</small>
        </article>
        <article>
          <span>当前页未收金额</span>
          <strong>{money(outstanding)}</strong>
          <small>应收余额实时汇总</small>
        </article>
        <article>
          <span>销售闭环</span>
          <strong>{view === 'returns' ? '退货 → 待检' : '订单 → 出库 → 应收'}</strong>
          <small>渠道仓与批次追溯同步</small>
        </article>
      </div>
      <div className="list-card">
        <div className="filter-bar">
          <label className="search-box">
            <Search size={17} />
            <Input
              aria-label="销售关键字搜索"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索单号、SKU、客户或渠道"
              value={keyword}
            />
          </label>
          {view !== 'prices' ? (
            <Select
              aria-label="销售状态筛选"
              value={params.documentStatus ?? ''}
              onChange={(event) => setParam('documentStatus', event.target.value || undefined)}
            >
              <option value="">全部状态</option>
              {Object.entries(statusText)
                .filter(([value]) => !['ACTIVE', 'INACTIVE'].includes(value))
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </Select>
          ) : null}
        </div>
        <DataTable
          actions={(row) => (
            <>
              {view === 'orders' && row.status === 'DRAFT' ? (
                <button
                  aria-label={`确认 ${row.code}`}
                  onClick={() =>
                    mutations.transition.mutate({ kind: 'orders', id: row.id, action: 'confirm' })
                  }
                  type="button"
                >
                  <ClipboardCheck size={16} />
                </button>
              ) : null}
              {view === 'issues' &&
              row.status === 'DRAFT' &&
              ['CONFIRMED', 'PARTIALLY_ISSUED'].includes(
                String((row.salesOrder as MasterRow | undefined)?.status),
              ) ? (
                <button
                  aria-label={`销售出库 ${row.code}`}
                  onClick={() => {
                    setIssue(row)
                    setDialog('issue')
                  }}
                  type="button"
                >
                  <PackageMinus size={16} />
                </button>
              ) : null}
              {view === 'returns' && row.status === 'DRAFT' ? (
                <button
                  aria-label={`过账 ${row.code}`}
                  onClick={() =>
                    mutations.transition.mutate({ kind: 'returns', id: row.id, action: 'post' })
                  }
                  type="button"
                >
                  <RotateCcw size={16} />
                </button>
              ) : null}
            </>
          )}
          columns={columns(view)}
          error={list.error ? apiErrorMessage(list.error) : undefined}
          loading={list.isLoading}
          meta={list.data?.meta}
          onPageChange={(page) => setParam('page', String(page), false)}
          onPageSizeChange={(size) => setParam('pageSize', String(size))}
          onSort={(key) => {
            setParam('sortBy', key)
            setParam(
              'sortOrder',
              queryParams.sortBy === key && queryParams.sortOrder === 'asc' ? 'desc' : 'asc',
            )
          }}
          rows={rows}
          sortBy={queryParams.sortBy}
          sortOrder={queryParams.sortOrder}
        />
      </div>
      <SalesDialogs
        active={dialog}
        issue={issue}
        onOpenChange={(next) => {
          setDialog(next)
          if (!next) setIssue(undefined)
        }}
      />
    </section>
  )
}

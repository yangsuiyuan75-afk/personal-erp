import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table'
import { Dialog } from '@base-ui/react/dialog'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  Eye,
  RotateCcw,
} from 'lucide-react'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import type { MasterRow, PageMeta } from '@/features/master-data/api'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { formatDate } from '@/lib/date'
import { auditActionLabel, enumLabel } from '@/lib/enum-label'

const DETAIL_LABELS: Record<string, string> = {
  module: '所属模块',
  action: '操作',
  entityType: '实体类型',
  before: '变更前',
  after: '变更后',
  result: '执行结果',
  createdAt: '创建时间',
  updatedAt: '更新时间',
  confirmedAt: '确认时间',
  postedAt: '过账时间',
  backupNo: '备份编号',
  trigger: '触发方式',
  format: '备份格式',
  schemaVersion: 'Schema 版本',
  appVersion: '应用版本',
  postgresVersion: 'PostgreSQL 版本',
  manifest: '备份清单',
  locked: '保留锁',
  localAvailable: '本地副本',
  startedAt: '开始时间',
  completedAt: '完成时间',
  cloudUploadedAt: '云端上传时间',
  restoredAt: '恢复时间',
  errorMessage: '错误信息',
  fileAsset: '存储文件',
  product: '商品',
  sku: 'SKU',
  location: '仓库',
  supplier: '供应商',
  customer: '客户',
  salesChannel: '销售渠道',
  purchaseChannel: '采购渠道',
  provider: '存储位置',
  verifiedAt: '校验时间',
  sha256: 'SHA-256',
  size: '文件大小',
  fileSize: '文件大小',
  fileName: '文件名',
  status: '状态',
  type: '类型',
  code: '编号',
  name: '名称',
  orderNo: '订单编号',
  receiptNo: '收货编号',
  returnNo: '退货编号',
  payableNo: '应付编号',
  creditNo: '供应商退款编号',
  issueNo: '出库编号',
  receivableNo: '应收编号',
  refundNo: '客户退款编号',
  inspectionNo: '质检编号',
  claimNo: '索赔编号',
  settlementNo: '处理编号',
  paymentNo: '付款编号',
  transactionNo: '流水编号',
  adjustmentNo: '调整编号',
  batchNo: '批次号',
  purchaseOrder: '采购订单',
  salesOrder: '销售订单',
  purchaseReceipt: '采购收货',
  purchaseReturn: '采购退货',
  salesIssue: '销售出库',
  salesReturn: '销售退货',
  payable: '应付',
  receivable: '应收',
  supplierCredit: '供应商退款',
  supplierClaim: '供应商索赔',
  supplierClaimSettlement: '索赔处理',
  batch: '库存批次',
  buyer: '采购员',
  account: '资金账户',
  baseUnit: '基础单位',
  qcLocation: '质检地点',
  parent: '上级地点',
  items: '明细',
  lines: '明细数量',
  allocations: '分配明细',
  batchAllocations: '批次分配',
  inventoryTransactionLine: '库存流水明细',
  transactionLine: '库存流水明细',
  _count: '明细统计',
  recordCounts: '业务记录统计',
  catalogEntries: '数据库目录项',
  currency: '币种',
  remark: '备注',
  reason: '业务原因',
  sourceType: '业务来源',
  direction: '资金方向',
  category: '商品类目',
  brand: '品牌',
  responsibility: '责任判定',
  resolutionType: '处理方式',
  expenseCategory: '开销类别',
  payee: '收款方',
  stockStatus: '库存状态',
  inventoryMode: '库存模式',
  isLeaf: '末级地点',
  barcode: '条码',
  attributes: 'SKU 属性',
  weight: '重量',
  decimalScale: '数量精度',
  phone: '联系电话',
  contactName: '联系人',
  taxNo: '税号',
  quantity: '数量',
  minQuantity: '起订量',
  onHandQuantity: '在库数量',
  reservedQuantity: '预留数量',
  availableQuantity: '可用数量',
  receivedQuantity: '收货数量',
  remainingQuantity: '剩余数量',
  returnedQuantity: '已退数量',
  issuedQuantity: '已出库数量',
  price: '价格',
  unitPrice: '单价',
  unitCost: '单位成本',
  lineAmount: '小计',
  totalAmount: '总金额',
  originalAmount: '原始金额',
  adjustedAmount: '调整金额',
  paidAmount: '已付金额',
  creditedAmount: '已抵扣金额',
  receivedAmount: '已收金额',
  appliedAmount: '已使用金额',
  outstandingAmount: '未结金额',
  outstanding: '未结金额',
  averageCost: '移动平均成本',
  inventoryValue: '库存金额',
  amount: '金额',
  totalRevenue: '销售收入',
  totalCost: '销售成本',
  totalRefund: '退款金额',
  revenueAmount: '收入金额',
  costAmount: '成本金额',
  estimatedLoss: '预计损失',
  claimedAmount: '索赔金额',
  settledAmount: '已处理金额',
  effectiveFrom: '生效日期',
  effectiveTo: '失效日期',
  orderDate: '下单日期',
  expectedAt: '预计到货日期',
  occurredAt: '业务日期',
  receivedAt: '收货日期',
  inspectedAt: '质检日期',
  dueAt: '到期日期',
  submittedAt: '提交日期',
  settlementPeriod: '结算期间',
  skus: 'SKU',
  files: '备份文件',
  sales: '销售单据',
  balances: '库存余额',
  products: '商品',
  purchases: '采购单据',
  transactions: '库存流水',
  qualityIssues: '质量问题',
}

const DETAIL_EXTRA_KEYS = new Set([
  'after',
  'before',
  'currency',
  'errorMessage',
  'fileAsset',
  'items',
  'lines',
  'localAvailable',
  'manifest',
  'remark',
  'restoredAt',
  'schemaVersion',
  'sha256',
  'startedAt',
  'verifiedAt',
  'cloudUploadedAt',
  'appVersion',
  'postgresVersion',
])

const COMPACT_REFERENCE_KEYS = new Set([
  'account',
  'baseUnit',
  'buyer',
  'customer',
  'location',
  'parent',
  'product',
  'purchaseChannel',
  'qcLocation',
  'salesChannel',
  'sku',
  'supplier',
])

const DATE_ONLY_KEYS = new Set([
  'dueAt',
  'effectiveFrom',
  'effectiveTo',
  'expectedAt',
  'inspectedAt',
  'occurredAt',
  'orderDate',
  'receivedAt',
  'submittedAt',
])

const MONEY_KEYS = new Set([
  'adjustedAmount',
  'amount',
  'appliedAmount',
  'averageCost',
  'balance',
  'claimedAmount',
  'costAmount',
  'creditedAmount',
  'estimatedLoss',
  'inventoryValue',
  'lineAmount',
  'originalAmount',
  'outstanding',
  'outstandingAmount',
  'paidAmount',
  'price',
  'receivedAmount',
  'revenueAmount',
  'settledAmount',
  'totalAmount',
  'totalCost',
  'totalRefund',
  'totalRevenue',
  'unitCost',
  'unitPrice',
])

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface DataTableColumn {
  key: string
  label: string
  sortable?: boolean
  render?: (row: MasterRow) => ReactNode
}

function deepValue(row: MasterRow, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[part]
    return undefined
  }, row)
}

function displayValue(value: unknown): ReactNode {
  if (value == null || value === '') return <span className="muted">—</span>
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'object' && item && 'purchaseChannel' in item
          ? String((item as { purchaseChannel: { name: string } }).purchaseChannel.name)
          : String(item),
      )
      .join('、')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatDate(value)
  }
  return enumLabel(value)
}

function detailLabel(key: string, labels?: Record<string, string>): string {
  return labels?.[key] ?? DETAIL_LABELS[key] ?? key
}

function isHiddenDetailKey(key: string, value: unknown): boolean {
  return (
    key === 'id' ||
    key === 'idempotencyKey' ||
    key === 'version' ||
    key.endsWith('Id') ||
    (typeof value === 'string' && UUID_PATTERN.test(value))
  )
}

function compactReference(value: Record<string, unknown>): ReactNode {
  const parts = [value.code, value.name].filter(Boolean).map(String)
  return parts.length ? (
    <span className="record-detail-reference">{[...new Set(parts)].join(' · ')}</span>
  ) : (
    <span className="muted">—</span>
  )
}

function detailEntries(value: Record<string, unknown>) {
  return Object.entries(value).filter(
    ([key, item]) =>
      !isHiddenDetailKey(key, item) &&
      !['createdAt', 'updatedAt'].includes(key) &&
      item != null &&
      item !== '' &&
      (!Array.isArray(item) || item.length > 0),
  )
}

function detailValue(value: unknown, key?: string): ReactNode {
  if (value == null || value === '') return <span className="muted">—</span>
  if (Array.isArray(value)) {
    if (!value.length) return <span className="muted">—</span>
    return (
      <ol className="record-detail-array">
        {value.map((item, index) => (
          <li key={index}>{detailValue(item, key)}</li>
        ))}
      </ol>
    )
  }
  if (typeof value === 'object') {
    if (key === 'batch' && 'batchNo' in value) {
      return <span className="record-detail-reference">{String(value.batchNo)}</span>
    }
    if (key && COMPACT_REFERENCE_KEYS.has(key)) {
      return compactReference(value as Record<string, unknown>)
    }
    return (
      <dl className="record-detail-nested">
        {detailEntries(value as Record<string, unknown>).map(([key, item]) => (
          <Fragment key={key}>
            <dt>{detailLabel(key)}</dt>
            <dd>{detailValue(item, key)}</dd>
          </Fragment>
        ))}
      </dl>
    )
  }
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (key === 'action') return auditActionLabel(value)
  if (key && DATE_ONLY_KEYS.has(key)) {
    return formatDate(value)
  }
  if (key && MONEY_KEYS.has(key) && !Number.isNaN(Number(value))) {
    const amount = Number(value)
    return `${amount < 0 ? '-' : ''}¥${Math.abs(amount).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
  if (key === 'weight' && !Number.isNaN(Number(value))) return `${value} g`
  if ((key === 'size' || key === 'fileSize') && !Number.isNaN(Number(value))) {
    return `${(Number(value) / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} KB`
  }
  return displayValue(value)
}

function DefaultDetail({
  row,
  columns,
  hiddenKeys = [],
}: {
  row: MasterRow
  columns: DataTableColumn[]
  hiddenKeys?: string[]
}) {
  const labels = Object.fromEntries(columns.map((column) => [column.key, column.label]))
  const visibleKeys = new Set([
    ...columns.map((column) => column.key.split('.')[0]),
    ...DETAIL_EXTRA_KEYS,
  ])
  if ('account' in row && 'allocations' in row) visibleKeys.add('allocations')
  const entries = Object.entries(row).filter(
    ([key, value]) =>
      visibleKeys.has(key) &&
      !hiddenKeys.includes(key) &&
      !isHiddenDetailKey(key, value) &&
      value != null &&
      value !== '' &&
      (!Array.isArray(value) || value.length > 0),
  )
  const scalarEntries = entries.filter(
    ([, value]) => !Array.isArray(value) && typeof value !== 'object',
  )
  const nestedEntries = entries.filter(
    ([, value]) => Array.isArray(value) || typeof value === 'object',
  )

  return (
    <div className="record-detail-layout">
      {scalarEntries.length ? (
        <dl className="record-detail-grid">
          {scalarEntries.map(([key, value]) => (
            <div key={key}>
              <dt>{detailLabel(key, labels)}</dt>
              <dd>{detailValue(value, key)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {nestedEntries.map(([key, value]) => (
        <section className="record-detail-section" key={key}>
          <h3>{detailLabel(key, labels)}</h3>
          {detailValue(value, key)}
        </section>
      ))}
    </div>
  )
}

export function DataTable({
  rows,
  columns,
  meta,
  loading,
  error,
  sortBy,
  sortOrder,
  onSort,
  onPageChange,
  onPageSizeChange,
  onSelectionChange,
  actions,
  onRowClick,
  activeRowId,
  renderDetail,
  detailHiddenKeys,
}: {
  rows: MasterRow[]
  columns: DataTableColumn[]
  meta?: PageMeta
  loading: boolean
  error?: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (key: string) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onSelectionChange?: (ids: string[]) => void
  actions?: (row: MasterRow) => ReactNode
  onRowClick?: (row: MasterRow) => void
  activeRowId?: string
  renderDetail?: (row: MasterRow, close: () => void) => ReactNode
  detailHiddenKeys?: string[]
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [detailRow, setDetailRow] = useState<MasterRow>()
  const detailHeading = detailRow
    ? [
        UUID_PATTERN.test(String(detailRow.code))
          ? undefined
          : /^[A-Z_]+$/.test(String(detailRow.code))
            ? auditActionLabel(detailRow.code)
            : detailRow.code,
        enumLabel(detailRow.name),
      ]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(' · ')
    : ''
  const tableColumns: ColumnDef<MasterRow>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          aria-label="选择当前页"
          checked={table.getIsAllPageRowsSelected()}
          className="table-checkbox"
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          type="checkbox"
        />
      ),
      cell: ({ row }) => (
        <input
          aria-label={`选择 ${row.original.name}`}
          checked={row.getIsSelected()}
          className="table-checkbox"
          onChange={row.getToggleSelectedHandler()}
          type="checkbox"
        />
      ),
      enableHiding: false,
    },
    ...columns.map<ColumnDef<MasterRow>>((column) => ({
      id: column.key,
      accessorFn: (row) => deepValue(row, column.key),
      header: () =>
        column.sortable === false ? (
          column.label
        ) : (
          <button className="table-sort" onClick={() => onSort(column.key)} type="button">
            {column.label}
            {sortBy === column.key ? (
              sortOrder === 'asc' ? (
                <ChevronUp size={13} />
              ) : (
                <ChevronDown size={13} />
              )
            ) : null}
          </button>
        ),
      cell: ({ row, getValue }) =>
        column.render ? (
          column.render(row.original)
        ) : column.key === 'status' ? (
          <span
            className={`status-pill ${
              getValue() === 'ACTIVE'
                ? 'status-active'
                : getValue() === 'INACTIVE'
                  ? 'status-inactive'
                  : ''
            }`}
          >
            {enumLabel(getValue())}
          </span>
        ) : column.key === 'action' ? (
          auditActionLabel(getValue())
        ) : (
          displayValue(getValue())
        ),
    })),
    {
      id: 'actions',
      header: '操作',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="row-actions">
          <button
            aria-label={`查看 ${row.original.name}`}
            onClick={(event) => {
              event.stopPropagation()
              setDetailRow(row.original)
            }}
            type="button"
          >
            <Eye size={16} />
          </button>
          {actions?.(row.original)}
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    pageCount: meta?.totalPages ?? 0,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: { columnVisibility, rowSelection },
  })

  useEffect(() => {
    onSelectionChange?.(Object.keys(rowSelection).filter((id) => rowSelection[id]))
  }, [onSelectionChange, rowSelection])

  const rowIds = rows.map((row) => row.id).join('\u0000')
  useEffect(() => {
    setRowSelection((current) => (Object.keys(current).length ? {} : current))
  }, [meta?.page, rowIds])

  return (
    <div className="data-table-shell">
      <div className="table-utility-row">
        <span>共 {meta?.total ?? 0} 条数据</span>
        <details className="column-menu">
          <summary>
            <Columns3 size={15} /> 列设置
          </summary>
          <div>
            {table
              .getAllLeafColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <label key={column.id}>
                  <input
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                    type="checkbox"
                  />
                  {columns.find((item) => item.key === column.id)?.label ?? column.id}
                </label>
              ))}
          </div>
        </details>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }, (_, index) => (
                  <tr className="skeleton-row" key={index}>
                    {tableColumns.map((_, cell) => (
                      <td key={cell}>
                        <span />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map((row) => (
                  <tr
                    aria-selected={row.getIsSelected() || row.original.id === activeRowId}
                    className={
                      row.getIsSelected() || row.original.id === activeRowId
                        ? 'selected-row'
                        : undefined
                    }
                    key={row.id}
                    onKeyDown={(event) => {
                      if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) return
                      event.preventDefault()
                      onRowClick(row.original)
                    }}
                    onClick={() => onRowClick?.(row.original)}
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && error ? (
          <div className="table-state table-error">
            <RotateCcw aria-hidden />
            <strong>数据加载失败</strong>
            <span>{error}</span>
          </div>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <div className="table-state">
            <Eye aria-hidden />
            <strong>暂无数据</strong>
            <span>调整筛选条件，或创建第一条记录。</span>
          </div>
        ) : null}
      </div>

      <Dialog.Root
        onOpenChange={(open) => !open && setDetailRow(undefined)}
        open={Boolean(detailRow)}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Viewport className="dialog-viewport">
            <Dialog.Popup className="dialog-popup data-table-detail-dialog">
              <header className="dialog-header">
                <div>
                  <Dialog.Title>查看详情</Dialog.Title>
                  <Dialog.Description>{detailHeading}</Dialog.Description>
                </div>
                <Dialog.Close aria-label="关闭" className="icon-button">
                  ×
                </Dialog.Close>
              </header>
              <div className="data-table-detail-content">
                {detailRow
                  ? (renderDetail?.(detailRow, () => setDetailRow(undefined)) ?? (
                      <DefaultDetail
                        columns={columns}
                        hiddenKeys={detailHiddenKeys}
                        row={detailRow}
                      />
                    ))
                  : null}
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>

      <footer className="table-pagination">
        <label>
          每页显示
          <Select
            value={meta?.pageSize ?? 20}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>
        <span>
          第 {meta?.page ?? 1} / {Math.max(meta?.totalPages ?? 0, 1)} 页
        </span>
        <Button
          disabled={!meta?.hasPreviousPage}
          onClick={() => onPageChange((meta?.page ?? 1) - 1)}
          variant="ghost"
        >
          <ChevronLeft size={15} /> 上一页
        </Button>
        <Button
          disabled={!meta?.hasNextPage}
          onClick={() => onPageChange((meta?.page ?? 1) + 1)}
          variant="ghost"
        >
          下一页 <ChevronRight size={15} />
        </Button>
      </footer>
    </div>
  )
}

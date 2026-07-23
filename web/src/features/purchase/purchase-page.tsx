import {
  ClipboardCheck,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import type { MasterRow } from '@/features/master-data/api';
import { useListUrlState } from '@/features/master-data/use-list-url-state';
import { apiErrorMessage } from '@/lib/api-error';
import { formatDate } from '@/lib/date';
import { enumLabel } from '@/lib/enum-label';
import type { PurchaseView } from './api';
import { PurchaseDialogs, type PurchaseDialogKind } from './purchase-dialogs';
import { usePurchaseList, usePurchaseMutations } from './use-purchase';

const views: Array<{ id: PurchaseView; label: string }> = [
  { id: 'orders', label: '采购订单' },
  { id: 'receipts', label: '采购收货' },
  { id: 'returns', label: '采购退货' },
  { id: 'prices', label: '采购报价' },
  { id: 'payables', label: '应付' },
  { id: 'credits', label: '供应商退款' },
];

const sortConfig: Record<PurchaseView, { fallback: string; allowed: string[] }> = {
  prices: {
    fallback: 'effectiveFrom',
    allowed: ['createdAt', 'effectiveFrom', 'price', 'minQuantity'],
  },
  orders: { fallback: 'orderDate', allowed: ['createdAt', 'orderDate', 'orderNo', 'totalAmount'] },
  receipts: { fallback: 'occurredAt', allowed: ['createdAt', 'occurredAt', 'totalAmount'] },
  returns: { fallback: 'occurredAt', allowed: ['createdAt', 'occurredAt', 'totalAmount'] },
  payables: {
    fallback: 'occurredAt',
    allowed: ['createdAt', 'occurredAt', 'outstandingAmount', 'originalAmount'],
  },
  credits: { fallback: 'createdAt', allowed: ['createdAt', 'amount', 'appliedAmount'] },
};

const statusText: Record<string, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PARTIALLY_RECEIVED: '部分收货',
  RECEIVED: '已收货',
  POSTED: '已过账',
  CANCELLED: '已取消',
  ACTIVE: '生效中',
  INACTIVE: '已停用',
  OPEN: '待处理',
  PARTIALLY_PAID: '部分付款',
  SETTLED: '已结清',
  VOID: '已作废',
  PARTIALLY_APPLIED: '部分抵扣',
  APPLIED: '已抵扣',
};

function money(value: unknown) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sumPurchaseQuantity(row: MasterRow) {
  return (Array.isArray(row.items) ? row.items : []).reduce((total, item) => {
    if (!item || typeof item !== 'object') return total;
    const value = Number((item as { quantity?: unknown }).quantity ?? 0);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

type PurchaseItem = { sku?: { code?: unknown; name?: unknown } };

function purchaseSku(row: MasterRow) {
  const items = [
    row.items,
    (row.purchaseReceipt as { items?: unknown } | undefined)?.items,
    (row.purchaseReturn as { items?: unknown } | undefined)?.items,
  ].find(Array.isArray) as PurchaseItem[] | undefined;
  const labels = items
    ? items
        .map((item) =>
          [String(item.sku?.code ?? ''), String(item.sku?.name ?? '')].filter(Boolean).join(' · '),
        )
        .filter(Boolean)
    : row.sku && typeof row.sku === 'object'
      ? [reference(row.sku)]
      : [];
  return labels.length ? (
    <div className="business-sku-summary">
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  ) : (
    '—'
  );
}

function quantity(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
}

function status(row: MasterRow) {
  const value = String(row.status);
  return (
    <span className={`business-status business-${value.toLowerCase()}`}>
      {statusText[value] ?? enumLabel(value)}
    </span>
  );
}

function reference(value: unknown) {
  if (!value || typeof value !== 'object') return '—';
  const item = value as { code?: unknown; name?: unknown };
  return [item.code, item.name].filter(Boolean).join(' · ') || '—';
}

function orderCanEdit(row: MasterRow) {
  if (!['DRAFT', 'CONFIRMED'].includes(String(row.status))) return false;
  const items = Array.isArray(row.items) ? (row.items as MasterRow[]) : [];
  return items.length === 1 && !items.some((item) => Number(item.receivedQuantity ?? 0) > 0);
}

function PurchaseOrderDetails({ row, onEdit }: { row: MasterRow; onEdit?: () => void }) {
  const items = (row.items as MasterRow[] | undefined) ?? [];
  return (
    <div className="purchase-detail">
      <section>
        <header className="purchase-detail-header">
          <div>
            <h3>采购订单</h3>
            <span>{String(row.orderNo ?? row.code)}</span>
          </div>
          {onEdit ? (
            <Button onClick={onEdit} variant="ghost">
              <Pencil size={15} /> 编辑订单
            </Button>
          ) : (
            <span className="muted">已有收货或订单已结束，不能直接修改。</span>
          )}
        </header>
        <dl className="record-detail-grid">
          <div>
            <dt>状态</dt>
            <dd>{status(row)}</dd>
          </div>
          <div>
            <dt>供应商</dt>
            <dd>{reference(row.supplier)}</dd>
          </div>
          <div>
            <dt>采购渠道</dt>
            <dd>{reference(row.purchaseChannel)}</dd>
          </div>
          <div>
            <dt>采购员</dt>
            <dd>{reference(row.buyer)}</dd>
          </div>
          <div>
            <dt>下单日期</dt>
            <dd>{formatDate(row.orderDate)}</dd>
          </div>
          <div>
            <dt>预计到货</dt>
            <dd>{formatDate(row.expectedAt)}</dd>
          </div>
          <div>
            <dt>订单金额</dt>
            <dd>{money(row.totalAmount)}</dd>
          </div>
          <div>
            <dt>币种</dt>
            <dd>{enumLabel(row.currency ?? 'CNY')}</dd>
          </div>
          <div>
            <dt>备注</dt>
            <dd>{String(row.remark ?? '—')}</dd>
          </div>
        </dl>
      </section>
      <section className="purchase-detail-lines">
        <h3>采购明细</h3>
        {items.map((item) => (
          <article key={item.id}>
            <strong>{reference(item.sku)}</strong>
            <dl>
              <div>
                <dt>采购数量</dt>
                <dd>{String(item.quantity ?? '—')}</dd>
              </div>
              <div>
                <dt>已收数量</dt>
                <dd>{String(item.receivedQuantity ?? '0')}</dd>
              </div>
              <div>
                <dt>成交单价</dt>
                <dd>{money(item.unitPrice)}</dd>
              </div>
              <div>
                <dt>小计</dt>
                <dd>{money(item.lineAmount)}</dd>
              </div>
              {item.remark ? (
                <div>
                  <dt>明细备注</dt>
                  <dd>{String(item.remark)}</dd>
                </div>
              ) : null}
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}

function columns(view: PurchaseView): DataTableColumn[] {
  if (view === 'prices')
    return [
      { key: 'skuSummary', label: 'SKU · 名称', render: purchaseSku, sortable: false },
      { key: 'supplier.name', label: '供应商', sortable: false },
      { key: 'purchaseChannel.name', label: '采购渠道', sortable: false },
      { key: 'buyer.name', label: '采购员', sortable: false },
      { key: 'price', label: '报价', render: (row) => money(row.price) },
      { key: 'minQuantity', label: '起订量' },
      { key: 'effectiveFrom', label: '生效时间' },
      { key: 'effectiveTo', label: '失效时间', sortable: false },
      { key: 'status', label: '状态', render: status, sortable: false },
    ];
  if (view === 'orders')
    return [
      { key: 'orderNo', label: '采购单号' },
      { key: 'skuSummary', label: 'SKU · 名称', render: purchaseSku, sortable: false },
      { key: 'supplier.name', label: '供应商', sortable: false },
      { key: 'purchaseChannel.name', label: '采购渠道', sortable: false },
      { key: 'buyer.name', label: '采购员', sortable: false },
      {
        key: 'items',
        label: '采购数量',
        render: (row) => quantity(sumPurchaseQuantity(row)),
        sortable: false,
      },
      { key: 'totalAmount', label: '订单金额', render: (row) => money(row.totalAmount) },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'orderDate', label: '下单时间' },
    ];
  if (view === 'receipts')
    return [
      { key: 'receiptNo', label: '收货单号', sortable: false },
      { key: 'skuSummary', label: 'SKU · 名称', render: purchaseSku, sortable: false },
      { key: 'purchaseOrder.orderNo', label: '采购订单', sortable: false },
      { key: 'purchaseOrder.supplier.name', label: '供应商', sortable: false },
      { key: 'location.name', label: '收货地点', sortable: false },
      {
        key: 'items',
        label: '收货数量',
        render: (row) => quantity(sumPurchaseQuantity(row)),
        sortable: false,
      },
      { key: 'totalAmount', label: '应付金额', render: (row) => money(row.totalAmount) },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '收货时间' },
    ];
  if (view === 'returns')
    return [
      { key: 'returnNo', label: '退货单号', sortable: false },
      { key: 'skuSummary', label: 'SKU · 名称', render: purchaseSku, sortable: false },
      { key: 'supplier.name', label: '供应商', sortable: false },
      { key: 'location.name', label: '退货地点', sortable: false },
      {
        key: 'items',
        label: '退货数量',
        render: (row) => quantity(sumPurchaseQuantity(row)),
        sortable: false,
      },
      { key: 'reason', label: '退货原因', sortable: false },
      { key: 'totalAmount', label: '退货金额', render: (row) => money(row.totalAmount) },
      {
        key: 'supplierCredit.amount',
        label: '退款应收',
        render: (row) => money((row.supplierCredit as { amount?: unknown })?.amount),
        sortable: false,
      },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '退货时间' },
    ];
  if (view === 'payables')
    return [
      { key: 'payableNo', label: '应付编号', sortable: false },
      { key: 'skuSummary', label: 'SKU · 名称', render: purchaseSku, sortable: false },
      { key: 'supplier.name', label: '供应商', sortable: false },
      { key: 'purchaseChannel.name', label: '采购渠道', sortable: false },
      { key: 'buyer.name', label: '采购员', sortable: false },
      { key: 'originalAmount', label: '原始应付', render: (row) => money(row.originalAmount) },
      {
        key: 'adjustedAmount',
        label: '退货调整',
        render: (row) => money(row.adjustedAmount),
        sortable: false,
      },
      { key: 'paidAmount', label: '已付', render: (row) => money(row.paidAmount), sortable: false },
      {
        key: 'outstandingAmount',
        label: '未付',
        render: (row) => <strong>{money(row.outstandingAmount)}</strong>,
      },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '发生时间' },
    ];
  return [
    { key: 'creditNo', label: '退款应收编号', sortable: false },
    { key: 'skuSummary', label: 'SKU · 名称', render: purchaseSku, sortable: false },
    { key: 'supplier.name', label: '供应商', sortable: false },
    { key: 'purchaseReturn.returnNo', label: '采购退货单', sortable: false },
    { key: 'amount', label: '应退金额', render: (row) => money(row.amount) },
    { key: 'appliedAmount', label: '已抵扣/已退', render: (row) => money(row.appliedAmount) },
    { key: 'status', label: '状态', render: status, sortable: false },
    { key: 'createdAt', label: '创建时间' },
  ];
}

export function PurchasePage() {
  const { params, keyword, setKeyword, setParam } = useListUrlState();
  const pageSearch = new URLSearchParams(window.location.search);
  const rawView = pageSearch.get('view');
  const view: PurchaseView = views.some((item) => item.id === rawView)
    ? (rawView as PurchaseView)
    : 'orders';
  const rawSortBy = pageSearch.get('sortBy');
  const defaultSort = sortConfig[view];
  const sortBy =
    rawSortBy && defaultSort.allowed.includes(rawSortBy) ? rawSortBy : defaultSort.fallback;
  const queryParams = useMemo(
    () => ({
      ...params,
      sortBy,
      sortOrder: sortBy === rawSortBy ? params.sortOrder : 'desc',
    }),
    [params, rawSortBy, sortBy],
  );
  const list = usePurchaseList(view, queryParams);
  const mutations = usePurchaseMutations();
  const [dialog, setDialog] = useState<PurchaseDialogKind>();
  const [editingOrder, setEditingOrder] = useState<MasterRow>();
  const rows = list.data?.data ?? [];
  const total = rows.reduce(
    (sum, row) => sum + Number(row.totalAmount ?? row.originalAmount ?? row.amount ?? 0),
    0,
  );
  const outstanding = rows.reduce((sum, row) => sum + Number(row.outstandingAmount ?? 0), 0);
  const actionForView: Partial<Record<PurchaseView, PurchaseDialogKind>> = {
    prices: 'price',
    orders: 'order',
    receipts: 'receipt',
    returns: 'return',
  };
  return (
    <section className="page-section business-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">采购中心</span>
          <h1>采购与收货</h1>
          <p>报价只作推荐；订单锁定成交价，收货同时生成库存批次与应付。</p>
        </div>
        {actionForView[view] ? (
          <Button
            onClick={() => {
              setEditingOrder(undefined);
              setDialog(actionForView[view]);
            }}
          >
            <Plus size={17} />{' '}
            {view === 'orders'
              ? '新建采购订单'
              : view === 'receipts'
                ? '采购收货'
                : view === 'returns'
                  ? '采购退货'
                  : '新增报价'}
          </Button>
        ) : null}
      </header>
      <nav className="inventory-tabs" aria-label="采购视图">
        {views.map((item) => (
          <button
            className={item.id === view ? 'active' : undefined}
            key={item.id}
            onClick={() => setParam('view', item.id)}
            type="button"
          >
            <ShoppingCart size={15} />
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
          <span>当前页未付金额</span>
          <strong>{money(outstanding)}</strong>
          <small>应付余额实时汇总</small>
        </article>
        <article>
          <span>采购闭环</span>
          <strong>
            {view === 'orders' ? '订单 → 收货' : view === 'returns' ? '退货 → 调整' : '库存 + 应付'}
          </strong>
          <small>单据状态与库存同步</small>
        </article>
      </div>
      <div className="list-card">
        <div className="filter-bar">
          <label className="search-box">
            <Search size={17} />
            <Input
              aria-label="采购关键字搜索"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索单号、SKU 或供应商"
              value={keyword}
            />
          </label>
          {view !== 'prices' ? (
            <Select
              aria-label="采购状态筛选"
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
              {view === 'orders' && orderCanEdit(row) ? (
                <button
                  aria-label={`编辑 ${row.orderNo}`}
                  onClick={() => {
                    setEditingOrder(row);
                    setDialog('order');
                  }}
                  title="编辑订单"
                  type="button"
                >
                  <Pencil size={16} />
                </button>
              ) : null}
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
              {view === 'receipts' && row.status === 'DRAFT' ? (
                <button
                  aria-label={`过账 ${row.code}`}
                  onClick={() =>
                    mutations.transition.mutate({ kind: 'receipts', id: row.id, action: 'post' })
                  }
                  type="button"
                >
                  <PackagePlus size={16} />
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
            setParam('sortBy', key);
            setParam(
              'sortOrder',
              queryParams.sortBy === key && queryParams.sortOrder === 'asc' ? 'desc' : 'asc',
            );
          }}
          renderDetail={
            view === 'orders'
              ? (row, close) => (
                  <PurchaseOrderDetails
                    onEdit={
                      orderCanEdit(row)
                        ? () => {
                            close();
                            setEditingOrder(row);
                            setDialog('order');
                          }
                        : undefined
                    }
                    row={row}
                  />
                )
              : undefined
          }
          rows={rows}
          sortBy={queryParams.sortBy}
          sortOrder={queryParams.sortOrder}
        />
      </div>
      <PurchaseDialogs
        active={dialog}
        onOpenChange={(next) => {
          setDialog(next);
          if (!next) setEditingOrder(undefined);
        }}
        order={editingOrder}
      />
    </section>
  );
}

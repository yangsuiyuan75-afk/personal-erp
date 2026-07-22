import { ClipboardCheck, PackagePlus, Plus, RotateCcw, Search, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import type { MasterRow } from '@/features/master-data/api';
import { useListUrlState } from '@/features/master-data/use-list-url-state';
import { apiErrorMessage } from '@/lib/api-error';
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

function status(row: MasterRow) {
  const value = String(row.status);
  return (
    <span className={`business-status business-${value.toLowerCase()}`}>
      {statusText[value] ?? value}
    </span>
  );
}

function columns(view: PurchaseView): DataTableColumn[] {
  if (view === 'prices')
    return [
      { key: 'sku.code', label: 'SKU', sortable: false },
      { key: 'sku.name', label: '商品', sortable: false },
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
      { key: 'supplier.name', label: '供应商', sortable: false },
      { key: 'purchaseChannel.name', label: '采购渠道', sortable: false },
      { key: 'buyer.name', label: '采购员', sortable: false },
      {
        key: 'items',
        label: 'SKU 行数',
        render: (row) => String((row.items as unknown[] | undefined)?.length ?? 0),
        sortable: false,
      },
      { key: 'totalAmount', label: '订单金额', render: (row) => money(row.totalAmount) },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'orderDate', label: '下单时间' },
    ];
  if (view === 'receipts')
    return [
      { key: 'receiptNo', label: '收货单号', sortable: false },
      { key: 'purchaseOrder.orderNo', label: '采购订单', sortable: false },
      { key: 'purchaseOrder.supplier.name', label: '供应商', sortable: false },
      { key: 'location.name', label: '收货地点', sortable: false },
      {
        key: 'items',
        label: '明细行',
        render: (row) => String((row.items as unknown[] | undefined)?.length ?? 0),
        sortable: false,
      },
      { key: 'totalAmount', label: '应付金额', render: (row) => money(row.totalAmount) },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '收货时间' },
    ];
  if (view === 'returns')
    return [
      { key: 'returnNo', label: '退货单号', sortable: false },
      { key: 'supplier.name', label: '供应商', sortable: false },
      { key: 'location.name', label: '退货地点', sortable: false },
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
  const rawView = new URLSearchParams(window.location.search).get('view');
  const view: PurchaseView = views.some((item) => item.id === rawView)
    ? (rawView as PurchaseView)
    : 'orders';
  const queryParams = useMemo(
    () => ({
      ...params,
      sortBy: sortConfig[view].allowed.includes(params.sortBy)
        ? params.sortBy
        : sortConfig[view].fallback,
    }),
    [params, view],
  );
  const list = usePurchaseList(view, queryParams);
  const mutations = usePurchaseMutations();
  const [dialog, setDialog] = useState<PurchaseDialogKind>();
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
          <Button onClick={() => setDialog(actionForView[view])}>
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
          rows={rows}
          sortBy={queryParams.sortBy}
          sortOrder={queryParams.sortOrder}
        />
      </div>
      <PurchaseDialogs active={dialog} onOpenChange={setDialog} />
    </section>
  );
}

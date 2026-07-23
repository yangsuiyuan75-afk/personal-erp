import {
  ArrowDownToLine,
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  MapPin,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Warehouse,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { DateRangePickerInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/field';
import { apiErrorMessage } from '@/lib/api-error';
import { enumLabel } from '@/lib/enum-label';
import type { MasterRow } from '@/features/master-data/api';
import { useListUrlState } from '@/features/master-data/use-list-url-state';
import { useMasterOptions } from '@/features/master-data/use-master-data';
import type { InventoryBalanceRow } from './api';
import { InventoryDialogs, type InventoryDialogKind } from './inventory-dialogs';
import { useInventoryList, useSkuInventory } from './use-inventory';

type InventoryView = 'balances' | 'transactions' | 'locations' | 'batches';

const views: Array<{ id: InventoryView; label: string; icon: typeof Boxes }> = [
  { id: 'balances', label: '库存余额', icon: Boxes },
  { id: 'transactions', label: '库存流水', icon: ClipboardList },
  { id: 'locations', label: '库存地点', icon: Warehouse },
  { id: 'batches', label: '批次追溯', icon: PackageCheck },
];

const viewSort: Record<InventoryView, { allowed: string[]; fallback: string }> = {
  balances: {
    allowed: ['updatedAt', 'onHandQuantity', 'averageCost', 'inventoryValue'],
    fallback: 'updatedAt',
  },
  transactions: {
    allowed: ['occurredAt', 'postedAt', 'transactionNo'],
    fallback: 'occurredAt',
  },
  locations: { allowed: ['createdAt', 'code', 'name', 'updatedAt'], fallback: 'createdAt' },
  batches: {
    allowed: ['receivedAt', 'batchNo', 'remainingQuantity'],
    fallback: 'receivedAt',
  },
};

const statusLabels: Record<string, string> = {
  AVAILABLE: '可售',
  QC_PENDING: '待质检',
  DEFECTIVE: '不良品',
  SUPPLIER_CLAIM: '供应商索赔',
  SCRAPPED: '已报废',
};

const transactionLabels: Record<string, string> = {
  OPENING_IN: '期初入库',
  ADJUSTMENT_IN: '库存调增',
  ADJUSTMENT_OUT: '库存调减',
  TRANSFER_OUT: '仓库调拨',
  PURCHASE_RECEIPT: '采购收货',
  PURCHASE_RETURN: '采购退货',
  SALES_ISSUE: '销售出库',
  SALES_RETURN_QC: '销售退货待质检',
};

function money(value: unknown): string {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function quantity(value: unknown): string {
  return Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
}

function columnsFor(view: InventoryView): DataTableColumn[] {
  if (view === 'balances')
    return [
      { key: 'sku.code', label: 'SKU', sortable: false },
      { key: 'sku.name', label: '商品名称', sortable: false },
      { key: 'location.name', label: '库存地点', sortable: false },
      {
        key: 'stockStatus',
        label: '库存状态',
        render: (row) => (
          <span className={`stock-pill stock-${String(row.stockStatus).toLowerCase()}`}>
            {statusLabels[String(row.stockStatus)] ?? enumLabel(row.stockStatus)}
          </span>
        ),
        sortable: false,
      },
      { key: 'onHandQuantity', label: '在手', render: (row) => quantity(row.onHandQuantity) },
      {
        key: 'reservedQuantity',
        label: '已预留',
        render: (row) => quantity(row.reservedQuantity),
      },
      {
        key: 'availableQuantity',
        label: '可用',
        render: (row) => <strong>{quantity(row.availableQuantity)}</strong>,
        sortable: false,
      },
      { key: 'averageCost', label: '移动均价', render: (row) => money(row.averageCost) },
      { key: 'inventoryValue', label: '库存金额', render: (row) => money(row.inventoryValue) },
      { key: 'updatedAt', label: '更新时间' },
    ];
  if (view === 'transactions')
    return [
      { key: 'transactionNo', label: '流水号' },
      {
        key: 'type',
        label: '业务类型',
        render: (row) => transactionLabels[String(row.type)] ?? enumLabel(row.type),
        sortable: false,
      },
      { key: 'sourceType', label: '来源单据', sortable: false },
      { key: 'sourceId', label: '来源 ID', sortable: false },
      { key: '_count.lines', label: '明细行', sortable: false },
      { key: 'occurredAt', label: '业务时间' },
      { key: 'postedAt', label: '过账时间' },
    ];
  if (view === 'locations')
    return [
      { key: 'code', label: '地点代码' },
      { key: 'name', label: '地点名称' },
      { key: 'type', label: '类型', render: (row) => enumLabel(row.type), sortable: false },
      { key: 'salesChannel.name', label: '销售渠道', sortable: false },
      { key: 'parent.name', label: '上级地点', sortable: false },
      {
        key: 'isLeaf',
        label: '可记账',
        render: (row) => (row.isLeaf ? '是' : '否'),
        sortable: false,
      },
      { key: 'status', label: '状态', sortable: false },
      { key: 'updatedAt', label: '更新时间' },
    ];
  return [
    { key: 'batchNo', label: '批次号' },
    { key: 'sku.code', label: 'SKU', sortable: false },
    { key: 'sku.name', label: '商品名称', sortable: false },
    { key: 'supplier.name', label: '来源供应商', sortable: false },
    { key: 'receivedQuantity', label: '入库数量', sortable: false },
    { key: 'remainingQuantity', label: '剩余数量' },
    { key: 'unitCost', label: '批次成本', render: (row) => money(row.unitCost), sortable: false },
    { key: 'receivedAt', label: '入库时间' },
  ];
}

export function InventoryPage() {
  const { params, keyword, setKeyword, setParam, setDateRange, clearParams } = useListUrlState();
  const rawView = new URLSearchParams(window.location.search).get('view');
  const view: InventoryView = views.some((item) => item.id === rawView)
    ? (rawView as InventoryView)
    : 'balances';
  const normalizedParams = useMemo(
    () => ({
      ...params,
      sortBy: viewSort[view].allowed.includes(params.sortBy)
        ? params.sortBy
        : viewSort[view].fallback,
    }),
    [params, view],
  );
  const list = useInventoryList(view, normalizedParams);
  const locationOptions = useInventoryList('locations', {
    page: 1,
    pageSize: 100,
    status: 'ACTIVE',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const categoryOptions = useMasterOptions('categories');
  const [selected, setSelected] = useState<InventoryBalanceRow>();
  const [dialog, setDialog] = useState<InventoryDialogKind>();
  const selectedInventory = useSkuInventory(selected?.skuId);
  const rows = list.data?.data ?? [];

  return (
    <section className="page-section inventory-page inventory-center-page">
      <div className="list-card inventory-surface">
        <div className="filter-bar inventory-filter-bar">
          <label className="search-box">
            <Search aria-hidden size={17} />
            <Input
              aria-label="库存关键字搜索"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={view === 'balances' ? '搜索 SKU、条码、商品或地点' : '搜索编号或名称'}
              value={keyword}
            />
          </label>
          {view === 'balances' ? (
            <>
              <Select
                aria-label="库存地点筛选"
                onChange={(event) => setParam('locationId', event.target.value || undefined)}
                value={params.locationId ?? ''}
              >
                <option value="">全部仓库</option>
                {locationOptions.data?.data.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="库存状态筛选"
                onChange={(event) => setParam('stockStatus', event.target.value || undefined)}
                value={params.stockStatus ?? ''}
              >
                <option value="">全部库存状态</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="商品类目筛选"
                onChange={(event) => setParam('categoryId', event.target.value || undefined)}
                value={params.categoryId ?? ''}
              >
                <option value="">全部商品类目</option>
                {categoryOptions.data?.data.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </>
          ) : view === 'transactions' ? (
            <>
              <Select
                aria-label="库存状态筛选"
                onChange={(event) => setParam('stockStatus', event.target.value || undefined)}
                value={params.stockStatus ?? ''}
              >
                <option value="">全部库存状态</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="流水类型筛选"
                onChange={(event) => setParam('transactionType', event.target.value || undefined)}
                value={params.transactionType ?? ''}
              >
                <option value="">全部业务类型</option>
                {Object.entries(transactionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </>
          ) : null}
          <DateRangePickerInput
            aria-label="库存日期范围"
            onChange={setDateRange}
            value={[params.createdFrom, params.createdTo]}
          />
          <Button
            onClick={() =>
              clearParams([
                'keyword',
                'locationId',
                'stockStatus',
                'categoryId',
                'transactionType',
                'createdFrom',
                'createdTo',
              ])
            }
            variant="ghost"
          >
            <RotateCcw size={16} /> 重置
          </Button>
          <div className="inventory-toolbar-actions">
            {view === 'locations' ? (
              <Button onClick={() => setDialog('location')}>
                <Plus size={16} /> 新增地点
              </Button>
            ) : (
              <>
                <details className="inventory-actions-menu">
                  <summary>
                    <ClipboardList size={16} /> 业务操作
                  </summary>
                  <div>
                    <button
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                        setDialog('opening');
                      }}
                      type="button"
                    >
                      <ArrowDownToLine size={16} /> 期初库存
                    </button>
                    <button
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                        setDialog('adjustment');
                      }}
                      type="button"
                    >
                      <Plus size={16} /> 库存调整
                    </button>
                  </div>
                </details>
                <Button onClick={() => setDialog('transfer')}>
                  <ArrowLeftRight size={16} /> 发起调拨
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="inventory-view-row">
          <nav aria-label="库存视图" className="inventory-tabs">
            {views.map(({ id, label, icon: Icon }) => (
              <button
                className={view === id ? 'active' : undefined}
                key={id}
                onClick={() => setParam('view', id)}
                type="button"
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>
        </div>

        <div className={`inventory-workspace ${view !== 'balances' ? 'without-rail' : ''}`}>
          <div className="inventory-list-card">
            <DataTable
              activeRowId={selected?.id}
              columns={columnsFor(view)}
              error={list.error ? apiErrorMessage(list.error) : undefined}
              loading={list.isLoading}
              meta={list.data?.meta}
              onPageChange={(page) => setParam('page', String(page), false)}
              onPageSizeChange={(size) => setParam('pageSize', String(size))}
              onRowClick={
                view === 'balances' ? (row) => setSelected(row as InventoryBalanceRow) : undefined
              }
              onSort={(key) => {
                setParam('sortBy', key);
                setParam(
                  'sortOrder',
                  normalizedParams.sortBy === key && normalizedParams.sortOrder === 'asc'
                    ? 'desc'
                    : 'asc',
                );
              }}
              rows={rows}
              sortBy={normalizedParams.sortBy}
              sortOrder={normalizedParams.sortOrder}
            />
          </div>

          {view === 'balances' ? (
            <InventoryContextRail
              balanceRows={selectedInventory.balances.data?.data ?? []}
              batchRows={selectedInventory.batches.data?.data ?? []}
              onTransfer={() => setDialog('transfer')}
              selected={selected}
            />
          ) : null}
        </div>
      </div>
      <InventoryDialogs active={dialog} onOpenChange={setDialog} />
    </section>
  );
}

function InventoryContextRail({
  selected,
  balanceRows,
  batchRows,
  onTransfer,
}: {
  selected?: InventoryBalanceRow;
  balanceRows: MasterRow[];
  batchRows: MasterRow[];
  onTransfer: () => void;
}) {
  if (!selected)
    return (
      <aside className="inventory-context empty">
        <MapPin size={24} />
        <strong>选择一条库存余额</strong>
        <p>这里会显示该 SKU 的地点分布、移动平均成本和最早可用批次。</p>
      </aside>
    );
  const total = balanceRows.reduce((sum, row) => sum + Number(row.onHandQuantity ?? 0), 0);
  return (
    <aside className="inventory-context">
      <header>
        <span className="stock-pill stock-available">{statusLabels[selected.stockStatus]}</span>
        <h2>{selected.sku.name}</h2>
        <p>
          {selected.sku.code}
          {selected.sku.barcode ? ` · ${selected.sku.barcode}` : ''}
        </p>
      </header>
      <section className="context-cost">
        <div>
          <span>当前地点可用</span>
          <strong>{quantity(selected.availableQuantity)}</strong>
        </div>
        <div>
          <span>移动平均成本</span>
          <strong>{money(selected.averageCost)}</strong>
        </div>
      </section>
      <section>
        <h3>库存地点分布</h3>
        <div className="location-distribution">
          {balanceRows.map((row) => {
            const current = Number(row.onHandQuantity ?? 0);
            return (
              <article key={row.id}>
                <div>
                  <strong>
                    {String((row.location as { name?: string } | undefined)?.name ?? '库存地点')}
                  </strong>
                  <span>{quantity(current)}</span>
                </div>
                <i style={{ width: `${Math.max(4, total ? (current / total) * 100 : 0)}%` }} />
              </article>
            );
          })}
        </div>
      </section>
      <section>
        <h3>FIFO 批次追溯</h3>
        <div className="batch-stack">
          {batchRows.slice(0, 4).map((row) => (
            <article key={row.id}>
              <div>
                <strong>{String(row.batchNo)}</strong>
                <span>剩余 {quantity(row.remainingQuantity)}</span>
              </div>
              <small>
                {new Date(String(row.receivedAt)).toLocaleDateString('zh-CN')} ·{' '}
                {money(row.unitCost)}
              </small>
            </article>
          ))}
          {!batchRows.length ? <p className="muted">暂无可追溯批次</p> : null}
        </div>
      </section>
      <section className="context-recommendation">
        <h3>推荐操作</h3>
        <p>
          {selected.stockStatus === 'AVAILABLE'
            ? '当前为可售库存，可结合各渠道仓分布发起真实库存调拨。'
            : '当前库存不可直接销售，请先完成对应质检或处置流程。'}
        </p>
        {selected.stockStatus === 'AVAILABLE' ? (
          <Button onClick={onTransfer}>
            <ArrowLeftRight size={15} /> 发起调拨建议
          </Button>
        ) : null}
      </section>
    </aside>
  );
}

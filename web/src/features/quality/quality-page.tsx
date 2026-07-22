import {
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  ClipboardCheck,
  HandCoins,
  PackageSearch,
  Plus,
  Search,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { DateRangePickerInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/field';
import type { ListParams, MasterRow } from '@/features/master-data/api';
import { useListUrlState } from '@/features/master-data/use-list-url-state';
import { apiErrorMessage } from '@/lib/api-error';
import type { QualityAnalytics, QualityView } from './api';
import { QualityDialogs, type QualityDialogKind } from './quality-dialogs';
import { useQualityAnalytics, useQualityList } from './use-quality';

const views: Array<{ id: QualityView; label: string; icon: typeof ShieldCheck }> = [
  { id: 'pending', label: '待质检退货', icon: Undo2 },
  { id: 'inspections', label: '质检单', icon: ClipboardCheck },
  { id: 'issues', label: '质量问题', icon: AlertTriangle },
  { id: 'claims', label: '供应商索赔', icon: HandCoins },
  { id: 'settlements', label: '索赔处理', icon: ShieldCheck },
  { id: 'stock', label: '质量库存', icon: PackageSearch },
  { id: 'compensation', label: '供应商赔付', icon: BadgeDollarSign },
  { id: 'analytics', label: '质量分析', icon: BarChart3 },
];

const sortConfig: Record<
  Exclude<QualityView, 'analytics'>,
  { fallback: string; allowed: string[] }
> = {
  pending: { fallback: 'occurredAt', allowed: ['createdAt', 'occurredAt', 'totalRefund'] },
  inspections: {
    fallback: 'inspectedAt',
    allowed: ['createdAt', 'inspectedAt', 'inspectionNo'],
  },
  issues: {
    fallback: 'createdAt',
    allowed: ['createdAt', 'estimatedLoss', 'quantity', 'issueNo'],
  },
  claims: {
    fallback: 'submittedAt',
    allowed: ['createdAt', 'submittedAt', 'claimedAmount', 'settledAmount'],
  },
  settlements: {
    fallback: 'occurredAt',
    allowed: ['createdAt', 'occurredAt', 'amount', 'quantity'],
  },
  stock: {
    fallback: 'updatedAt',
    allowed: ['updatedAt', 'onHandQuantity', 'inventoryValue'],
  },
  compensation: {
    fallback: 'occurredAt',
    allowed: ['createdAt', 'occurredAt', 'outstandingAmount', 'originalAmount'],
  },
};

const statusText: Record<string, string> = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  OPEN: '待处理',
  CLAIM_CREATED: '已生成索赔',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
  SUBMITTED: '已提交',
  PARTIALLY_SETTLED: '部分处理',
  SETTLED: '已结清',
  REJECTED: '已拒赔',
  POSTED: '已过账',
  PARTIALLY_RECEIVED: '部分收款',
};

const responsibilityText: Record<string, string> = {
  UNKNOWN: '待确认',
  SUPPLIER: '供应商',
  CUSTOMER: '客户',
  LOGISTICS: '物流',
  INTERNAL: '内部',
};

const resolutionText: Record<string, string> = {
  REPLACEMENT: '供应商换货',
  CASH_COMPENSATION: '现金赔付',
  CREDIT_COMPENSATION: '下次抵扣',
  SCRAP: '索赔品报废',
  REJECTED: '供应商拒赔',
  SELF_BEAR: '自行承担',
};

const stockText: Record<string, string> = {
  QC_PENDING: '待质检',
  DEFECTIVE: '不良品',
  SUPPLIER_CLAIM: '供应商索赔',
  SCRAPPED: '已报废',
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

function status(row: MasterRow) {
  const value = String(row.status);
  return (
    <span className={`business-status business-${value.toLowerCase()}`}>
      {statusText[value] ?? value}
    </span>
  );
}

function columns(view: Exclude<QualityView, 'analytics'>): DataTableColumn[] {
  if (view === 'pending')
    return [
      { key: 'returnNo', label: '销售退货单' },
      { key: 'customer.name', label: '客户', sortable: false },
      { key: 'salesChannel.name', label: '销售渠道', sortable: false },
      { key: 'qcLocation.name', label: '待检地点', sortable: false },
      {
        key: 'items',
        label: 'SKU 行数',
        render: (row) => String((row.items as unknown[] | undefined)?.length ?? 0),
        sortable: false,
      },
      { key: 'totalRefund', label: '退货金额', render: (row) => money(row.totalRefund) },
      { key: 'occurredAt', label: '接收时间' },
    ];
  if (view === 'inspections')
    return [
      { key: 'inspectionNo', label: '质检单号' },
      { key: 'salesReturn.returnNo', label: '销售退货单', sortable: false },
      { key: 'salesReturn.customer.name', label: '客户', sortable: false },
      {
        key: 'items',
        label: '质检明细',
        render: (row) => String((row.items as unknown[] | undefined)?.length ?? 0),
        sortable: false,
      },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'inspectedAt', label: '质检时间' },
      { key: 'confirmedAt', label: '确认时间', sortable: false },
    ];
  if (view === 'issues')
    return [
      { key: 'issueNo', label: '问题编号' },
      { key: 'sku.code', label: 'SKU', sortable: false },
      { key: 'sku.name', label: '商品', sortable: false },
      { key: 'supplier.name', label: '责任供应商', sortable: false },
      {
        key: 'responsibility',
        label: '责任判定',
        render: (row) =>
          responsibilityText[String(row.responsibility)] ?? String(row.responsibility),
        sortable: false,
      },
      { key: 'quantity', label: '问题数量', render: (row) => quantity(row.quantity) },
      { key: 'estimatedLoss', label: '预计损失', render: (row) => money(row.estimatedLoss) },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'createdAt', label: '发现时间' },
    ];
  if (view === 'claims')
    return [
      { key: 'claimNo', label: '索赔单号', sortable: false },
      { key: 'supplier.name', label: '供应商', sortable: false },
      {
        key: 'items',
        label: '索赔明细',
        render: (row) => String((row.items as unknown[] | undefined)?.length ?? 0),
        sortable: false,
      },
      { key: 'claimedAmount', label: '索赔金额', render: (row) => money(row.claimedAmount) },
      { key: 'settledAmount', label: '已处理', render: (row) => money(row.settledAmount) },
      {
        key: 'outstanding',
        label: '待处理',
        render: (row) => (
          <strong>{money(Number(row.claimedAmount) - Number(row.settledAmount))}</strong>
        ),
        sortable: false,
      },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'submittedAt', label: '提交时间' },
    ];
  if (view === 'settlements')
    return [
      { key: 'settlementNo', label: '处理单号', sortable: false },
      { key: 'supplierClaim.claimNo', label: '索赔单', sortable: false },
      { key: 'supplierClaim.supplier.name', label: '供应商', sortable: false },
      {
        key: 'resolutionType',
        label: '处理方式',
        render: (row) => resolutionText[String(row.resolutionType)] ?? String(row.resolutionType),
        sortable: false,
      },
      { key: 'quantity', label: '数量', render: (row) => quantity(row.quantity) },
      { key: 'amount', label: '金额', render: (row) => money(row.amount) },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '处理时间' },
    ];
  if (view === 'stock')
    return [
      { key: 'sku.code', label: 'SKU', sortable: false },
      { key: 'sku.name', label: '商品', sortable: false },
      { key: 'location.name', label: '库存地点', sortable: false },
      {
        key: 'stockStatus',
        label: '质量状态',
        render: (row) => (
          <span className={`stock-pill stock-${String(row.stockStatus).toLowerCase()}`}>
            {stockText[String(row.stockStatus)] ?? String(row.stockStatus)}
          </span>
        ),
        sortable: false,
      },
      { key: 'onHandQuantity', label: '在手数量', render: (row) => quantity(row.onHandQuantity) },
      {
        key: 'averageCost',
        label: '移动均价',
        render: (row) => money(row.averageCost),
        sortable: false,
      },
      { key: 'inventoryValue', label: '库存金额', render: (row) => money(row.inventoryValue) },
      { key: 'updatedAt', label: '更新时间' },
    ];
  return [
    { key: 'receivableNo', label: '赔付应收编号', sortable: false },
    { key: 'supplier.name', label: '供应商', sortable: false },
    { key: 'supplierClaimSettlement.supplierClaim.claimNo', label: '索赔单', sortable: false },
    { key: 'originalAmount', label: '原始应收', render: (row) => money(row.originalAmount) },
    {
      key: 'receivedAmount',
      label: '已收金额',
      render: (row) => money(row.receivedAmount),
      sortable: false,
    },
    {
      key: 'outstandingAmount',
      label: '未收金额',
      render: (row) => <strong>{money(row.outstandingAmount)}</strong>,
    },
    { key: 'status', label: '状态', render: status, sortable: false },
    { key: 'occurredAt', label: '发生时间' },
  ];
}

function QualityFilters({
  view,
  params,
  keyword,
  setKeyword,
  setParam,
  setDateRange,
}: {
  view: Exclude<QualityView, 'analytics'>;
  params: ListParams;
  keyword: string;
  setKeyword: (value: string) => void;
  setParam: (key: string, value?: string, resetPage?: boolean) => void;
  setDateRange: (from?: string, to?: string) => void;
}) {
  return (
    <div className="filter-bar inventory-filter-bar">
      <label className="search-box">
        <Search aria-hidden size={17} />
        <Input
          aria-label="质量业务关键字搜索"
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索单号、SKU、客户或供应商"
          value={keyword}
        />
      </label>
      {view === 'issues' ? (
        <Select
          aria-label="质量责任筛选"
          onChange={(event) => setParam('responsibility', event.target.value || undefined)}
          value={String(params.responsibility ?? '')}
        >
          <option value="">全部责任</option>
          {Object.entries(responsibilityText).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      ) : null}
      {view === 'settlements' ? (
        <Select
          aria-label="索赔处理方式筛选"
          onChange={(event) => setParam('resolutionType', event.target.value || undefined)}
          value={String(params.resolutionType ?? '')}
        >
          <option value="">全部处理方式</option>
          {Object.entries(resolutionText).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      ) : null}
      {['inspections', 'issues', 'claims', 'settlements'].includes(view) ? (
        <Select
          aria-label="质量业务状态筛选"
          onChange={(event) => setParam('documentStatus', event.target.value || undefined)}
          value={params.documentStatus ?? ''}
        >
          <option value="">全部状态</option>
          {Object.entries(statusText).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      ) : null}
      <DateRangePickerInput
        aria-label="质量日期范围"
        onChange={setDateRange}
        value={[params.createdFrom, params.createdTo]}
      />
    </div>
  );
}

function ListContent({
  view,
  params,
  keyword,
  setKeyword,
  setParam,
  setDateRange,
  onSettle,
}: {
  view: Exclude<QualityView, 'analytics'>;
  params: ListParams;
  keyword: string;
  setKeyword: (value: string) => void;
  setParam: (key: string, value?: string, resetPage?: boolean) => void;
  setDateRange: (from?: string, to?: string) => void;
  onSettle: () => void;
}) {
  const normalizedParams = useMemo(
    () => ({
      ...params,
      sortBy: sortConfig[view].allowed.includes(params.sortBy)
        ? params.sortBy
        : sortConfig[view].fallback,
    }),
    [params, view],
  );
  const list = useQualityList(view, normalizedParams);
  const rows = list.data?.data ?? [];
  const [selected, setSelected] = useState<MasterRow>();
  const pageQuantity = rows.reduce(
    (sum, row) => sum + Number(row.quantity ?? row.onHandQuantity ?? 0),
    0,
  );
  const pageAmount = rows.reduce(
    (sum, row) =>
      sum +
      Number(
        row.estimatedLoss ??
          row.claimedAmount ??
          row.amount ??
          row.inventoryValue ??
          row.originalAmount ??
          0,
      ),
    0,
  );

  return (
    <>
      <div className="inventory-kpis business-kpis quality-kpis">
        <article>
          <span>当前页业务数量</span>
          <strong>{quantity(pageQuantity)}</strong>
          <small>{rows.length} 条质量记录</small>
        </article>
        <article>
          <span>当前页涉及金额</span>
          <strong>{money(pageAmount)}</strong>
          <small>损失、索赔或质量库存价值</small>
        </article>
        <article>
          <span>质量闭环</span>
          <strong>待检 → 分流 → 索赔</strong>
          <small>退货不会直接回到可售库存</small>
        </article>
      </div>
      <div className="inventory-workspace quality-workspace">
        <div className="list-card inventory-list-card">
          <QualityFilters
            keyword={keyword}
            params={params}
            setKeyword={setKeyword}
            setParam={setParam}
            setDateRange={setDateRange}
            view={view}
          />
          <DataTable
            actions={(row) =>
              view === 'claims' &&
              ['SUBMITTED', 'PARTIALLY_SETTLED'].includes(String(row.status)) ? (
                <button aria-label={`处理 ${row.code}`} onClick={onSettle} type="button">
                  <HandCoins size={16} />
                </button>
              ) : null
            }
            activeRowId={selected?.id}
            columns={columns(view)}
            error={list.error ? apiErrorMessage(list.error) : undefined}
            loading={list.isLoading}
            meta={list.data?.meta}
            onPageChange={(page) => setParam('page', String(page), false)}
            onPageSizeChange={(size) => setParam('pageSize', String(size))}
            onRowClick={setSelected}
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
        <QualityContext row={selected} view={view} />
      </div>
    </>
  );
}

function QualityContext({
  row,
  view,
}: {
  row?: MasterRow;
  view: Exclude<QualityView, 'analytics'>;
}) {
  if (!row)
    return (
      <aside className="inventory-context empty">
        <ShieldCheck size={24} />
        <strong>选择一条质量记录</strong>
        <p>这里会集中显示状态、数量、金额与关联单据，方便在列表中完成判断。</p>
      </aside>
    );
  const detail = [
    ['业务编号', row.code],
    [
      '当前状态',
      statusText[String(row.status)] ?? stockText[String(row.stockStatus)] ?? row.status,
    ],
    ['数量', row.quantity ?? row.onHandQuantity],
    [
      '金额',
      row.estimatedLoss ??
        row.claimedAmount ??
        row.amount ??
        row.inventoryValue ??
        row.originalAmount,
    ],
    ['发生时间', row.occurredAt ?? row.inspectedAt ?? row.submittedAt ?? row.createdAt],
  ].filter(([, value]) => value != null && value !== '');
  return (
    <aside className="inventory-context quality-context">
      <header>
        <span className="eyebrow">{views.find((item) => item.id === view)?.label}</span>
        <h2>{row.name || row.code}</h2>
        <p>{row.code}</p>
      </header>
      <section>
        <h3>业务摘要</h3>
        <dl className="quality-detail-list">
          {detail.map(([label, value]) => (
            <div key={String(label)}>
              <dt>{String(label)}</dt>
              <dd>
                {label === '金额'
                  ? money(value)
                  : label === '数量'
                    ? quantity(value)
                    : label === '发生时间'
                      ? new Date(String(value)).toLocaleString('zh-CN')
                      : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="quality-rule-note">
        <h3>过账规则</h3>
        <p>质量库存只通过单据与库存流水变化，不能直接编辑余额。</p>
      </section>
    </aside>
  );
}

function AnalyticsContent({ params }: { params: ListParams }) {
  const query = useQualityAnalytics(params, true);
  const analytics = query.data;
  if (query.isLoading)
    return <div className="quality-analytics-state">正在汇总质量与索赔数据…</div>;
  if (query.error)
    return <div className="quality-analytics-state error">{apiErrorMessage(query.error)}</div>;
  if (!analytics) return null;
  return (
    <div className="quality-analytics">
      <AnalyticsSummary analytics={analytics} />
      <div className="quality-analytics-grid">
        <section className="list-card quality-ranking">
          <header>
            <div>
              <span className="eyebrow">供应商质量</span>
              <h2>索赔成功率与预计损失</h2>
            </div>
          </header>
          <div className="quality-ranking-list">
            {analytics.suppliers.map((supplier) => (
              <article key={supplier.supplierId}>
                <div>
                  <strong>{supplier.supplierName}</strong>
                  <span>
                    问题 {quantity(supplier.issueQuantity)} · 损失 {money(supplier.loss)}
                  </span>
                </div>
                <div className="quality-rate">
                  <strong>{Math.round(supplier.successRate * 100)}%</strong>
                  <i style={{ width: `${Math.min(100, supplier.successRate * 100)}%` }} />
                </div>
              </article>
            ))}
            {!analytics.suppliers.length ? <p className="muted">暂无供应商质量问题</p> : null}
          </div>
        </section>
        <section className="list-card quality-ranking">
          <header>
            <div>
              <span className="eyebrow">SKU 退货率</span>
              <h2>出库与退货数量对比</h2>
            </div>
          </header>
          <div className="quality-ranking-list">
            {analytics.skus
              .slice()
              .sort((a, b) => Number(b.returnRate) - Number(a.returnRate))
              .slice(0, 12)
              .map((sku) => (
                <article key={sku.skuId}>
                  <div>
                    <strong>
                      {sku.skuCode} · {sku.skuName}
                    </strong>
                    <span>
                      出库 {quantity(sku.issued)} · 退货 {quantity(sku.returned)}
                    </span>
                  </div>
                  <div className="quality-rate">
                    <strong>{(Number(sku.returnRate) * 100).toFixed(1)}%</strong>
                    <i style={{ width: `${Math.min(100, Number(sku.returnRate) * 100)}%` }} />
                  </div>
                </article>
              ))}
            {!analytics.skus.length ? <p className="muted">暂无 SKU 出库退货数据</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function AnalyticsSummary({ analytics }: { analytics: QualityAnalytics }) {
  const cards = [
    ['问题数量', quantity(analytics.summary.issueQuantity), '已确认质量异常'],
    ['预计损失', money(analytics.summary.estimatedLoss), '按批次成本计算'],
    ['索赔金额', money(analytics.summary.claimedAmount), '已向供应商提交'],
    ['已处理金额', money(analytics.summary.settledAmount), '换货、赔付与抵扣'],
  ];
  return (
    <div className="inventory-kpis quality-summary-kpis">
      {cards.map(([label, value, note]) => (
        <article key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{note}</small>
        </article>
      ))}
    </div>
  );
}

export function QualityPage() {
  const { params, keyword, setKeyword, setParam, setDateRange } = useListUrlState();
  const rawView = new URLSearchParams(window.location.search).get('view');
  const view: QualityView = views.some((item) => item.id === rawView)
    ? (rawView as QualityView)
    : 'pending';
  const [dialog, setDialog] = useState<QualityDialogKind>();
  return (
    <section className="page-section inventory-page quality-page">
      <header className="page-heading inventory-heading">
        <div>
          <span className="eyebrow">质量与退货</span>
          <h1>质量处置工作台</h1>
          <p>销售退货先质检再分流；供应商责任从问题、索赔到换货或赔付保持完整追溯。</p>
        </div>
        <div className="page-actions">
          <Button onClick={() => setDialog('settlement')} variant="ghost">
            <HandCoins size={17} /> 处理索赔
          </Button>
          <Button onClick={() => setDialog('inspection')}>
            <Plus size={17} /> 新建退货质检
          </Button>
        </div>
      </header>
      <nav aria-label="质量视图" className="inventory-tabs quality-tabs">
        {views.map(({ id, label, icon: Icon }) => (
          <button
            className={view === id ? 'active' : undefined}
            key={id}
            onClick={() => setParam('view', id)}
            type="button"
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>
      {view === 'analytics' ? (
        <AnalyticsContent params={params} />
      ) : (
        <ListContent
          keyword={keyword}
          onSettle={() => setDialog('settlement')}
          params={params}
          setKeyword={setKeyword}
          setParam={setParam}
          setDateRange={setDateRange}
          view={view}
        />
      )}
      <QualityDialogs active={dialog} onOpenChange={setDialog} />
    </section>
  );
}

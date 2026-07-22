import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CircleDollarSign,
  CreditCard,
  Landmark,
  ListFilter,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  WalletCards,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import type { ListParams, MasterRow } from '@/features/master-data/api';
import { useListUrlState } from '@/features/master-data/use-list-url-state';
import { useMasterOptions } from '@/features/master-data/use-master-data';
import { apiErrorMessage } from '@/lib/api-error';
import type { FinanceAnalytics, FinanceListView, FinanceView } from './api';
import { FinanceDialogs, type FinanceDialogKind } from './finance-dialogs';
import {
  useFinanceAnalytics,
  useFinanceList,
  useFinanceMutations,
  useFinanceOptions,
} from './use-finance';

const views: Array<{ id: FinanceView; label: string; icon: typeof Landmark }> = [
  { id: 'accounts', label: '资金账户', icon: Landmark },
  { id: 'payables', label: '应付', icon: ArrowUpCircle },
  { id: 'receivables', label: '应收', icon: ArrowDownCircle },
  { id: 'payments', label: '付款', icon: CreditCard },
  { id: 'receipts', label: '收款', icon: ReceiptText },
  { id: 'transactions', label: '资金流水', icon: WalletCards },
  { id: 'adjustments', label: '调整与费用', icon: ListFilter },
  { id: 'analytics', label: '月度分析', icon: BarChart3 },
];

const sortConfig: Record<FinanceListView, { fallback: string; allowed: string[] }> = {
  accounts: { fallback: 'code', allowed: ['createdAt', 'code', 'name', 'type', 'updatedAt'] },
  payables: {
    fallback: 'occurredAt',
    allowed: ['createdAt', 'occurredAt', 'originalAmount', 'outstandingAmount'],
  },
  receivables: {
    fallback: 'occurredAt',
    allowed: ['createdAt', 'occurredAt', 'originalAmount', 'outstandingAmount'],
  },
  payments: { fallback: 'occurredAt', allowed: ['createdAt', 'occurredAt', 'amount'] },
  receipts: { fallback: 'occurredAt', allowed: ['createdAt', 'occurredAt', 'amount'] },
  transactions: {
    fallback: 'occurredAt',
    allowed: ['createdAt', 'occurredAt', 'amount', 'transactionNo'],
  },
  adjustments: { fallback: 'occurredAt', allowed: ['createdAt', 'occurredAt', 'amount'] },
};

const statusText: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  OPEN: '待结算',
  PARTIALLY_PAID: '部分付款',
  PARTIALLY_RECEIVED: '部分收款',
  SETTLED: '已结清',
  VOID: '已作废',
  DRAFT: '草稿',
  POSTED: '已过账',
  CANCELLED: '已取消',
};

const categoryText: Record<string, string> = {
  SALES_RECEIPT: '销售回款',
  SUPPLIER_COMPENSATION: '供应商赔付',
  PURCHASE_PAYMENT: '采购付款',
  CUSTOMER_REFUND: '客户退款',
  PLATFORM_FEE: '平台费',
  LOGISTICS_FEE: '物流费',
  OTHER_INCOME: '其他收入',
  OTHER_EXPENSE: '其他费用',
  ACCOUNT_ADJUSTMENT: '账户调整',
};

const accountTypeText: Record<string, string> = {
  BANK: '银行卡',
  ALIPAY: '支付宝',
  PAYPAL: 'PayPal',
  PLATFORM_BALANCE: '平台余额',
  CASH: '现金',
  OTHER: '其他',
};

function money(value: unknown): string {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function status(row: MasterRow) {
  const value = String(row.status);
  return (
    <span className={`business-status business-${value.toLowerCase()}`}>
      {statusText[value] ?? value}
    </span>
  );
}

function columns(view: FinanceListView): DataTableColumn[] {
  if (view === 'accounts')
    return [
      { key: 'code', label: '账户代码' },
      { key: 'name', label: '账户名称' },
      {
        key: 'type',
        label: '账户类型',
        render: (row) => accountTypeText[String(row.type)] ?? String(row.type),
      },
      { key: 'currency', label: '币种', sortable: false },
      {
        key: 'balance',
        label: '当前余额',
        render: (row) => <strong>{money(row.balance)}</strong>,
        sortable: false,
      },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'updatedAt', label: '更新时间' },
    ];
  if (view === 'payables')
    return [
      { key: 'payableNo', label: '应付编号', sortable: false },
      { key: 'supplier.name', label: '供应商', sortable: false },
      { key: 'purchaseChannel.name', label: '采购渠道', sortable: false },
      { key: 'buyer.name', label: '采购员', sortable: false },
      { key: 'originalAmount', label: '原始应付', render: (row) => money(row.originalAmount) },
      {
        key: 'paidAmount',
        label: '现金已付',
        render: (row) => money(row.paidAmount),
        sortable: false,
      },
      {
        key: 'creditedAmount',
        label: '抵扣',
        render: (row) => money(row.creditedAmount),
        sortable: false,
      },
      {
        key: 'outstandingAmount',
        label: '未付',
        render: (row) => <strong>{money(row.outstandingAmount)}</strong>,
      },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '发生时间' },
    ];
  if (view === 'receivables')
    return [
      { key: 'receivableNo', label: '应收编号', sortable: false },
      { key: 'salesChannel.name', label: '销售渠道', sortable: false },
      { key: 'customer.name', label: '客户', sortable: false },
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
    ];
  if (view === 'payments' || view === 'receipts')
    return [
      {
        key: view === 'payments' ? 'paymentNo' : 'receiptNo',
        label: view === 'payments' ? '付款单号' : '收款单号',
        sortable: false,
      },
      { key: 'account.name', label: '资金账户', sortable: false },
      { key: 'supplier.name', label: '供应商', sortable: false },
      { key: 'customer.name', label: '客户', sortable: false },
      { key: 'salesChannel.name', label: '销售渠道', sortable: false },
      { key: 'amount', label: '实际金额', render: (row) => <strong>{money(row.amount)}</strong> },
      { key: 'settlementPeriod', label: '结算月份', sortable: false },
      { key: 'status', label: '状态', render: status, sortable: false },
      { key: 'occurredAt', label: '发生时间' },
    ];
  if (view === 'transactions')
    return [
      { key: 'transactionNo', label: '流水号' },
      { key: 'account.name', label: '资金账户', sortable: false },
      {
        key: 'direction',
        label: '方向',
        render: (row) => (
          <span className={`cash-direction cash-${String(row.direction).toLowerCase()}`}>
            {row.direction === 'IN' ? '流入' : '流出'}
          </span>
        ),
        sortable: false,
      },
      {
        key: 'category',
        label: '业务分类',
        render: (row) => categoryText[String(row.category)] ?? String(row.category),
        sortable: false,
      },
      { key: 'amount', label: '金额', render: (row) => <strong>{money(row.amount)}</strong> },
      { key: 'customer.name', label: '客户', sortable: false },
      { key: 'supplier.name', label: '供应商', sortable: false },
      { key: 'occurredAt', label: '入账时间' },
    ];
  return [
    { key: 'adjustmentNo', label: '调整单号', sortable: false },
    { key: 'account.name', label: '资金账户', sortable: false },
    {
      key: 'direction',
      label: '方向',
      render: (row) => (row.direction === 'IN' ? '流入' : '流出'),
      sortable: false,
    },
    {
      key: 'category',
      label: '业务分类',
      render: (row) => categoryText[String(row.category)] ?? String(row.category),
      sortable: false,
    },
    { key: 'amount', label: '金额', render: (row) => money(row.amount) },
    { key: 'reason', label: '原因', sortable: false },
    { key: 'status', label: '状态', render: status, sortable: false },
    { key: 'occurredAt', label: '发生时间' },
  ];
}

function FinanceFilters({
  params,
  keyword,
  setKeyword,
  setParam,
  searchable = true,
}: {
  params: ListParams;
  keyword: string;
  setKeyword: (value: string) => void;
  setParam: (key: string, value?: string, resetPage?: boolean) => void;
  searchable?: boolean;
}) {
  const accounts = useFinanceOptions('accounts');
  const salesChannels = useMasterOptions('sales-channels');
  const customers = useMasterOptions('customers');
  const suppliers = useMasterOptions('suppliers');
  const purchaseChannels = useMasterOptions('purchase-channels');
  const buyers = useMasterOptions('buyers');
  return (
    <div className="filter-bar inventory-filter-bar finance-filter-bar">
      {searchable ? (
        <label className="search-box">
          <Search aria-hidden size={17} />
          <Input
            aria-label="财务关键字搜索"
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索编号、账户、客户或供应商"
            value={keyword}
          />
        </label>
      ) : null}
      <Input
        aria-label="财务月份筛选"
        onChange={(event) => setParam('month', event.target.value || undefined)}
        type="month"
        value={String(params.month ?? '')}
      />
      <Select
        aria-label="资金账户筛选"
        onChange={(event) => setParam('accountId', event.target.value || undefined)}
        value={String(params.accountId ?? '')}
      >
        <option value="">全部账户</option>
        <Options rows={accounts.data?.data} />
      </Select>
      <details className="more-filters">
        <summary>
          <SlidersHorizontal size={16} /> 多维筛选
        </summary>
        <div className="finance-dimension-filters">
          {[
            ['salesChannelId', '销售渠道', salesChannels.data?.data],
            ['customerId', '客户', customers.data?.data],
            ['supplierId', '供应商', suppliers.data?.data],
            ['purchaseChannelId', '采购渠道', purchaseChannels.data?.data],
            ['buyerId', '采购员', buyers.data?.data],
          ].map(([key, label, rows]) => (
            <label key={String(key)}>
              {String(label)}
              <Select
                onChange={(event) => setParam(String(key), event.target.value || undefined)}
                value={String(params[String(key)] ?? '')}
              >
                <option value="">全部</option>
                <Options rows={rows as MasterRow[] | undefined} />
              </Select>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function Options({ rows }: { rows?: MasterRow[] }) {
  return rows?.map((row) => (
    <option key={row.id} value={row.id}>
      {row.code} · {row.name}
    </option>
  ));
}

function FinanceContext({ row, view }: { row?: MasterRow; view: FinanceListView }) {
  if (!row)
    return (
      <aside className="inventory-context empty">
        <CircleDollarSign size={24} />
        <strong>选择一条财务记录</strong>
        <p>右侧会展示资金方向、结算进度和关联维度，列表仍是主要工作面。</p>
      </aside>
    );
  const amount = row.balance ?? row.outstandingAmount ?? row.amount ?? row.originalAmount;
  const details = [
    ['业务编号', row.code],
    ['状态', statusText[String(row.status)] ?? row.status],
    ['金额', amount],
    ['账户', (row.account as { name?: string } | undefined)?.name],
    ['发生时间', row.occurredAt ?? row.createdAt],
  ].filter(([, value]) => value != null && value !== '');
  return (
    <aside className="inventory-context finance-context">
      <header>
        <span className="eyebrow">{views.find((item) => item.id === view)?.label}</span>
        <h2>{row.name || row.code}</h2>
        <p>{row.code}</p>
      </header>
      <section>
        <h3>财务摘要</h3>
        <dl className="quality-detail-list">
          {details.map(([label, value]) => (
            <div key={String(label)}>
              <dt>{String(label)}</dt>
              <dd>
                {label === '金额'
                  ? money(value)
                  : label === '发生时间'
                    ? new Date(String(value)).toLocaleString('zh-CN')
                    : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="finance-rule-note">
        <h3>资金真实性</h3>
        <p>
          账户余额只汇总已过账 FinancialTransaction；草稿单据和 Supplier Credit 不改变现金余额。
        </p>
      </section>
    </aside>
  );
}

function ListContent({
  view,
  params,
  keyword,
  setKeyword,
  setParam,
}: {
  view: FinanceListView;
  params: ListParams;
  keyword: string;
  setKeyword: (value: string) => void;
  setParam: (key: string, value?: string, resetPage?: boolean) => void;
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
  const query = useFinanceList(view, normalizedParams);
  const mutations = useFinanceMutations();
  const [selected, setSelected] = useState<MasterRow>();
  const rows = query.data?.data ?? [];
  const incoming = rows.reduce(
    (sum, row) =>
      sum + (row.direction === 'IN' || view === 'receipts' ? Number(row.amount ?? 0) : 0),
    0,
  );
  const outgoing = rows.reduce(
    (sum, row) =>
      sum + (row.direction === 'OUT' || view === 'payments' ? Number(row.amount ?? 0) : 0),
    0,
  );
  const outstanding = rows.reduce((sum, row) => sum + Number(row.outstandingAmount ?? 0), 0);
  return (
    <>
      <div className="inventory-kpis business-kpis finance-kpis">
        <article>
          <span>当前页流入</span>
          <strong>{money(incoming)}</strong>
          <small>仅显示真实收款与流入流水</small>
        </article>
        <article>
          <span>当前页流出</span>
          <strong>{money(outgoing)}</strong>
          <small>Supplier Credit 不计入现金流出</small>
        </article>
        <article>
          <span>当前页未结余额</span>
          <strong>{money(outstanding)}</strong>
          <small>应收应付支持多次部分结算</small>
        </article>
      </div>
      <div className="inventory-workspace finance-workspace">
        <div className="list-card inventory-list-card">
          <FinanceFilters
            keyword={keyword}
            params={params}
            setKeyword={setKeyword}
            setParam={setParam}
          />
          <DataTable
            actions={(row) =>
              row.status === 'DRAFT' && ['payments', 'receipts', 'adjustments'].includes(view) ? (
                <button
                  aria-label={`过账 ${row.code}`}
                  onClick={() =>
                    mutations.post.mutate({
                      kind: view as 'payments' | 'receipts' | 'adjustments',
                      id: row.id,
                    })
                  }
                  type="button"
                >
                  <CircleDollarSign size={16} />
                </button>
              ) : null
            }
            activeRowId={selected?.id}
            columns={columns(view)}
            error={query.error ? apiErrorMessage(query.error) : undefined}
            loading={query.isLoading}
            meta={query.data?.meta}
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
        <FinanceContext row={selected} view={view} />
      </div>
    </>
  );
}

function AnalyticsContent({
  params,
  keyword,
  setKeyword,
  setParam,
}: {
  params: ListParams;
  keyword: string;
  setKeyword: (value: string) => void;
  setParam: (key: string, value?: string, resetPage?: boolean) => void;
}) {
  const query = useFinanceAnalytics(params);
  if (query.isLoading)
    return <div className="quality-analytics-state">正在汇总月度资金与经营数据…</div>;
  if (query.error)
    return <div className="quality-analytics-state error">{apiErrorMessage(query.error)}</div>;
  if (!query.data) return null;
  const data = query.data;
  return (
    <div className="finance-analytics">
      <div className="list-card finance-analytics-filter">
        <FinanceFilters
          keyword={keyword}
          params={params}
          searchable={false}
          setKeyword={setKeyword}
          setParam={setParam}
        />
      </div>
      <FinanceSummary data={data} />
      <div className="finance-analytics-grid">
        <section className="list-card finance-monthly-card">
          <header>
            <span className="eyebrow">月度趋势</span>
            <h2>收入、支出与经营结果</h2>
          </header>
          <div className="finance-monthly-table">
            <div className="finance-monthly-head">
              <span>月份</span>
              <span>流入</span>
              <span>流出</span>
              <span>净现金流</span>
              <span>销售毛利</span>
              <span>质量损失</span>
            </div>
            {data.monthly.map((row) => (
              <div key={row.month}>
                <strong>{row.month}</strong>
                <span>{money(row.income)}</span>
                <span>{money(row.outflow)}</span>
                <strong>{money(row.netCashFlow)}</strong>
                <span>{money(row.grossProfit)}</span>
                <span>{money(row.qualityLoss)}</span>
              </div>
            ))}
            {!data.monthly.length ? <p className="muted">当前条件暂无月度数据</p> : null}
          </div>
        </section>
        <section className="list-card finance-dimension-card">
          <header>
            <span className="eyebrow">业务维度</span>
            <h2>渠道、客户、供应商与采购归属</h2>
          </header>
          <div className="finance-dimension-grid">
            {[
              ['销售渠道入账', data.dimensions.salesChannels],
              ['客户入账', data.dimensions.customers],
              ['供应商支出', data.dimensions.suppliers],
              ['采购渠道支出', data.dimensions.purchaseChannels],
              ['采购员支出', data.dimensions.buyers],
            ].map(([label, rows]) => (
              <section key={String(label)}>
                <h3>{String(label)}</h3>
                {(rows as Array<{ id: string; name: string; amount: string }>)
                  .slice(0, 5)
                  .map((row) => (
                    <div key={row.id}>
                      <span>{row.name}</span>
                      <strong>{money(row.amount)}</strong>
                    </div>
                  ))}
                {!(rows as unknown[]).length ? <p className="muted">暂无数据</p> : null}
              </section>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function FinanceSummary({ data }: { data: FinanceAnalytics }) {
  const cards = [
    ['实际入账', data.summary.income, '已过账资金流入'],
    ['实际支出', data.summary.outflow, '已过账资金流出'],
    ['净现金流', data.summary.netCashFlow, '流入减流出'],
    ['销售毛利', data.summary.grossProfit, '销售收入减出库成本'],
    ['经营结果', data.summary.operatingResult, '扣除费用与质量损失'],
    ['质量损失', data.summary.qualityLoss, '按问题批次成本'],
    ['未收应收', data.summary.outstandingReceivable, '期末应收余额'],
    ['未付应付', data.summary.outstandingPayable, '期末应付余额'],
  ];
  return (
    <div className="finance-summary-grid">
      {cards.map(([label, value, note]) => (
        <article key={label}>
          <span>{label}</span>
          <strong>{money(value)}</strong>
          <small>{note}</small>
        </article>
      ))}
    </div>
  );
}

export function FinancePage() {
  const { params, keyword, setKeyword, setParam } = useListUrlState();
  const rawView = new URLSearchParams(window.location.search).get('view');
  const view: FinanceView = views.some((item) => item.id === rawView)
    ? (rawView as FinanceView)
    : 'accounts';
  const [dialog, setDialog] = useState<FinanceDialogKind>();
  return (
    <section className="page-section inventory-page finance-page">
      <header className="page-heading inventory-heading">
        <div>
          <span className="eyebrow">业务财务</span>
          <h1>资金与经营分析中心</h1>
          <p>
            应收应付与真实资金流分离；按月份、渠道、客户、供应商、采购渠道和采购员追踪经营结果。
          </p>
        </div>
        <div className="page-actions">
          <Button onClick={() => setDialog('payment')} variant="ghost">
            <ArrowUpCircle size={17} /> 付款
          </Button>
          <Button onClick={() => setDialog('receipt')} variant="ghost">
            <ArrowDownCircle size={17} /> 收款
          </Button>
          <Button onClick={() => setDialog('adjustment')} variant="ghost">
            <ListFilter size={17} /> 调整/费用
          </Button>
          <Button onClick={() => setDialog('account')}>
            <Plus size={17} /> 资金账户
          </Button>
        </div>
      </header>
      <nav aria-label="财务视图" className="inventory-tabs quality-tabs">
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
        <AnalyticsContent
          keyword={keyword}
          params={params}
          setKeyword={setKeyword}
          setParam={setParam}
        />
      ) : (
        <ListContent
          key={view}
          keyword={keyword}
          params={params}
          setKeyword={setKeyword}
          setParam={setParam}
          view={view}
        />
      )}
      <FinanceDialogs active={dialog} onOpenChange={setDialog} />
    </section>
  );
}

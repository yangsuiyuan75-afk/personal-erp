import { ArrowRight, CircleDollarSign, ReceiptText, Search, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { DatePickerInput, thisMonth } from '@/components/ui/date-picker'
import { Input, Select } from '@/components/ui/field'
import type { ListParams, MasterRow } from '@/features/master-data/api'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDate } from '@/lib/date'
import { enumLabel } from '@/lib/enum-label'
import { useExpenseBills, useFinanceMutations, useFinanceOptions } from './use-finance'

const categoryText: Record<string, string> = {
  OFFICE_SUPPLIES: '办公耗材',
  QUALIFICATION: '资质办理',
  PREMISES: '店铺费用',
  UTILITIES: '通讯水电',
  TRAVEL: '差旅交通',
  OTHER: '其他开销',
}

function money(value: unknown) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function status(row: MasterRow) {
  const posted = row.status === 'POSTED'
  return (
    <span className={`business-status business-${posted ? 'posted' : 'draft'}`}>
      {posted ? '已过账' : '草稿'}
    </span>
  )
}

const columns: DataTableColumn[] = [
  { key: 'adjustmentNo', label: '账单号', sortable: false },
  { key: 'occurredAt', label: '开销日期' },
  {
    key: 'expenseCategory',
    label: '类别',
    render: (row) => categoryText[String(row.expenseCategory)] ?? enumLabel(row.expenseCategory),
    sortable: false,
  },
  { key: 'reason', label: '开销事项', sortable: false },
  { key: 'payee', label: '收款方', sortable: false },
  { key: 'account.name', label: '资金账户', sortable: false },
  { key: 'amount', label: '金额', render: (row) => <strong>{money(row.amount)}</strong> },
  { key: 'status', label: '状态', render: status, sortable: false },
]

function ExpenseContext({ row }: { row?: MasterRow }) {
  if (!row)
    return (
      <aside className="inventory-context expense-context empty">
        <ReceiptText size={24} />
        <strong>选择一张开销账单</strong>
        <p>右侧会展示账单摘要和财务汇总状态。</p>
      </aside>
    )
  const posted = row.status === 'POSTED'
  return (
    <aside className="inventory-context expense-context">
      <header>
        <span className="eyebrow">账单摘要</span>
        <h2>{String(row.adjustmentNo)}</h2>
        <p>{String(row.reason)}</p>
      </header>
      <section>
        <dl className="quality-detail-list">
          {[
            ['开销日期', formatDate(row.occurredAt)],
            ['类别', categoryText[String(row.expenseCategory)]],
            ['收款方', row.payee],
            ['资金账户', (row.account as { name?: string } | undefined)?.name],
            ['金额', money(row.amount)],
            ['状态', posted ? '已过账' : '草稿'],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt>{String(label)}</dt>
              <dd>{String(value ?? '—')}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="expense-flow">
        <h3>资金流向</h3>
        <div>
          <span>
            <ReceiptText size={16} /> 开销账单
          </span>
          <ArrowRight aria-hidden size={14} />
          <span>
            <WalletCards size={16} /> 资金流水
          </span>
          <ArrowRight aria-hidden size={14} />
          <span>
            <CircleDollarSign size={16} /> 月度汇总
          </span>
        </div>
        <p>
          {posted ? '已生成资金流出并计入月度经营结果。' : '草稿不会影响财务汇总，确认后请过账。'}
        </p>
      </section>
    </aside>
  )
}

export function ExpenseContent({
  params,
  keyword,
  setKeyword,
  setParam,
}: {
  params: ListParams
  keyword: string
  setKeyword: (value: string) => void
  setParam: (key: string, value?: string, resetPage?: boolean) => void
}) {
  const normalizedParams = useMemo(
    () => ({
      ...params,
      month: String(params.month ?? thisMonth()),
      sortBy: ['createdAt', 'occurredAt', 'amount'].includes(params.sortBy)
        ? params.sortBy
        : 'occurredAt',
    }),
    [params],
  )
  const query = useExpenseBills(normalizedParams)
  const accounts = useFinanceOptions('accounts')
  const mutations = useFinanceMutations()
  const [selected, setSelected] = useState<MasterRow>()
  const rows = query.data?.data ?? []
  const summary = query.data?.summary
  return (
    <>
      <div className="inventory-kpis expense-kpis">
        <article>
          <span>本月已过账支出</span>
          <strong>{money(summary?.postedAmount)}</strong>
          <small>已进入资金流水与财务汇总</small>
        </article>
        <article>
          <span>本月待过账</span>
          <strong>{money(summary?.pendingAmount)}</strong>
          <small>草稿暂不影响账户余额</small>
        </article>
        <article>
          <span>本月账单</span>
          <strong>{summary?.billCount ?? 0} 张</strong>
          <small>按当前筛选条件统计</small>
        </article>
      </div>
      <div className="inventory-workspace expense-workspace">
        <div className="list-card inventory-list-card expense-list-card">
          <div className="filter-bar inventory-filter-bar expense-filter-bar">
            <DatePickerInput
              aria-label="开销月份筛选"
              mode="month"
              onChange={(value) => setParam('month', value || undefined)}
              value={normalizedParams.month}
            />
            <label className="search-box">
              <Search aria-hidden size={17} />
              <Input
                aria-label="搜索开销账单"
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索账单号、事项或收款方"
                value={keyword}
              />
            </label>
            <Select
              aria-label="开销类别筛选"
              onChange={(event) => setParam('expenseCategory', event.target.value || undefined)}
              value={String(params.expenseCategory ?? '')}
            >
              <option value="">全部类别</option>
              {Object.entries(categoryText).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="资金账户筛选"
              onChange={(event) => setParam('accountId', event.target.value || undefined)}
              value={String(params.accountId ?? '')}
            >
              <option value="">全部账户</option>
              {accounts.data?.data.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="账单状态筛选"
              onChange={(event) => setParam('documentStatus', event.target.value || undefined)}
              value={String(params.documentStatus ?? '')}
            >
              <option value="">全部状态</option>
              <option value="DRAFT">草稿</option>
              <option value="POSTED">已过账</option>
            </Select>
          </div>
          <DataTable
            actions={(row) =>
              row.status === 'DRAFT' ? (
                <button
                  aria-label={`过账 ${row.code}`}
                  onClick={() => mutations.post.mutate({ kind: 'expenses', id: row.id })}
                  type="button"
                >
                  <CircleDollarSign size={16} />
                </button>
              ) : null
            }
            activeRowId={selected?.id}
            columns={columns}
            error={query.error ? apiErrorMessage(query.error) : undefined}
            loading={query.isLoading}
            meta={query.data?.meta}
            onPageChange={(page) => setParam('page', String(page), false)}
            onPageSizeChange={(size) => setParam('pageSize', String(size))}
            onRowClick={setSelected}
            onSort={(key) => {
              setParam('sortBy', key)
              setParam(
                'sortOrder',
                normalizedParams.sortBy === key && normalizedParams.sortOrder === 'asc'
                  ? 'desc'
                  : 'asc',
              )
            }}
            rows={rows}
            sortBy={normalizedParams.sortBy}
            sortOrder={normalizedParams.sortOrder}
          />
        </div>
        <ExpenseContext row={selected} />
      </div>
    </>
  )
}

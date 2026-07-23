import { Dialog } from '@base-ui/react/dialog';
import { Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/feedback/toast-provider';
import { Button } from '@/components/ui/button';
import { DatePickerInput, thisMonth, today } from '@/components/ui/date-picker';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import type { MasterRow } from '@/features/master-data/api';
import { useMasterOptions } from '@/features/master-data/use-master-data';
import { apiErrorMessage } from '@/lib/api-error';
import { useFinanceMutations, useFinanceOptions } from './use-finance';

export type FinanceDialogKind = 'account' | 'payment' | 'receipt' | 'adjustment' | 'expense';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Shell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: DialogProps & { title: string; description: string; children: React.ReactNode }) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog-popup inventory-dialog finance-dialog">
            <header className="dialog-header">
              <div>
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Description>{description}</Dialog.Description>
              </div>
              <Dialog.Close aria-label="关闭" className="icon-button">
                <X size={18} />
              </Dialog.Close>
            </header>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Actions({ pending, label }: { pending: boolean; label: string }) {
  return (
    <footer className="dialog-footer">
      <Dialog.Close className="button button-ghost">取消</Dialog.Close>
      <Button disabled={pending} type="submit">
        {pending ? '正在保存…' : label}
      </Button>
    </footer>
  );
}

function Options({ rows }: { rows?: MasterRow[] }) {
  return rows?.map((row) => (
    <option key={row.id} value={row.id}>
      {row.code} · {row.name}
    </option>
  ));
}

function AccountDialog({ open, onOpenChange }: DialogProps) {
  const mutations = useFinanceMutations();
  const notify = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('BANK');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !name.trim()) return notify('请输入账户代码和名称', 'error');
    try {
      await mutations.account.mutateAsync({ code, name, type, currency: 'CNY' });
      notify('资金账户已创建；余额将由已过账流水汇总', 'success');
      setCode('');
      setName('');
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <Shell
      description="账户余额不可手工覆盖；期初或修正必须使用账户调整单。"
      onOpenChange={onOpenChange}
      open={open}
      title="新增资金账户"
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="账户代码">
            <Input onChange={(event) => setCode(event.target.value)} value={code} />
          </Field>
          <Field label="账户名称">
            <Input onChange={(event) => setName(event.target.value)} value={name} />
          </Field>
          <Field label="账户类型">
            <Select onChange={(event) => setType(event.target.value)} value={type}>
              <option value="BANK">银行卡</option>
              <option value="ALIPAY">支付宝</option>
              <option value="PAYPAL">PayPal</option>
              <option value="PLATFORM_BALANCE">平台余额</option>
              <option value="CASH">现金</option>
              <option value="OTHER">其他</option>
            </Select>
          </Field>
          <Field label="币种">
            <Input disabled value="CNY" />
          </Field>
        </div>
        <Actions label="创建账户" pending={mutations.account.isPending} />
      </form>
    </Shell>
  );
}

interface PaymentLine {
  targetId: string;
  amount: string;
  supplierCreditId: string;
  creditAmount: string;
}

const newPaymentLine = (): PaymentLine => ({
  targetId: '',
  amount: '',
  supplierCreditId: '',
  creditAmount: '',
});

function PaymentDialog({ open, onOpenChange }: DialogProps) {
  const accounts = useFinanceOptions('accounts');
  const payables = useFinanceOptions('payables');
  const refunds = useFinanceOptions('refunds');
  const credits = useFinanceOptions('credits');
  const mutations = useFinanceMutations();
  const notify = useToast();
  const [accountId, setAccountId] = useState('');
  const [targetType, setTargetType] = useState<'PAYABLE' | 'REFUND'>('PAYABLE');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const [settlementPeriod, setSettlementPeriod] = useState(thisMonth());
  const [remark, setRemark] = useState('');
  const [lines, setLines] = useState<PaymentLine[]>([newPaymentLine()]);
  const targets = (targetType === 'PAYABLE' ? payables.data?.data : refunds.data?.data)?.filter(
    (row) => !['SETTLED', 'PAID', 'VOID'].includes(String(row.status)),
  );
  const creditRows = credits.data?.data.filter(
    (row) => !['APPLIED', 'VOID'].includes(String(row.status)),
  );
  const update = (index: number, field: keyof PaymentLine, value: string) =>
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)),
    );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountId || !amount || lines.some((line) => !line.targetId || line.amount === ''))
      return notify('请完整填写账户、金额与分配目标', 'error');
    try {
      const payment = await mutations.payment.mutateAsync({
        accountId,
        amount,
        occurredAt: new Date(occurredAt).toISOString(),
        settlementPeriod,
        remark: remark || undefined,
        allocations: lines.map((line) => ({
          ...(targetType === 'PAYABLE'
            ? { payableId: line.targetId }
            : { customerRefundId: line.targetId }),
          amount: line.amount,
          supplierCreditId: line.supplierCreditId || undefined,
          creditAmount: line.creditAmount || undefined,
        })),
      });
      await mutations.post.mutateAsync({ kind: 'payments', id: payment.id });
      notify('付款已过账，应付/退款与真实资金流水已同步', 'success');
      setLines([newPaymentLine()]);
      setAmount('');
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <Shell
      description="支持部分付款和多目标分配；Supplier Credit 单独记录抵扣，不计入现金支出。"
      onOpenChange={onOpenChange}
      open={open}
      title="新建付款"
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="付款账户">
            <Select onChange={(event) => setAccountId(event.target.value)} value={accountId}>
              <option value="">请选择</option>
              <Options rows={accounts.data?.data.filter((row) => row.status === 'ACTIVE')} />
            </Select>
          </Field>
          <Field label="付款类型">
            <Select
              onChange={(event) => {
                setTargetType(event.target.value as 'PAYABLE' | 'REFUND');
                setLines([newPaymentLine()]);
              }}
              value={targetType}
            >
              <option value="PAYABLE">采购应付</option>
              <option value="REFUND">客户退款</option>
            </Select>
          </Field>
          <Field label="实际付款金额">
            <Input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
          </Field>
          <Field label="付款时间">
            <DatePickerInput onChange={setOccurredAt} value={occurredAt} />
          </Field>
          <Field label="结算月份">
            <DatePickerInput mode="month" onChange={setSettlementPeriod} value={settlementPeriod} />
          </Field>
          <Field label="备注">
            <Textarea onChange={(event) => setRemark(event.target.value)} rows={2} value={remark} />
          </Field>
        </div>
        <section className="finance-allocation-editor">
          <header>
            <strong>付款分配</strong>
            <Button
              onClick={() => setLines((current) => [...current, newPaymentLine()])}
              type="button"
              variant="ghost"
            >
              <Plus size={15} /> 添加分配
            </Button>
          </header>
          {lines.map((line, index) => (
            <div className="finance-allocation-row" key={index}>
              <Field label={targetType === 'PAYABLE' ? '应付' : '客户退款'}>
                <Select
                  onChange={(event) => update(index, 'targetId', event.target.value)}
                  value={line.targetId}
                >
                  <option value="">请选择</option>
                  {targets?.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} · {row.name} · 未结 ¥
                      {String(row.outstandingAmount ?? Number(row.amount) - Number(row.paidAmount))}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="现金分配">
                <Input
                  inputMode="decimal"
                  onChange={(event) => update(index, 'amount', event.target.value)}
                  value={line.amount}
                />
              </Field>
              {targetType === 'PAYABLE' ? (
                <>
                  <Field label="Supplier Credit">
                    <Select
                      onChange={(event) => update(index, 'supplierCreditId', event.target.value)}
                      value={line.supplierCreditId}
                    >
                      <option value="">不抵扣</option>
                      {creditRows?.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.code} · 可用 ¥{Number(row.amount) - Number(row.appliedAmount)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="抵扣金额">
                    <Input
                      inputMode="decimal"
                      onChange={(event) => update(index, 'creditAmount', event.target.value)}
                      value={line.creditAmount}
                    />
                  </Field>
                </>
              ) : null}
              <button
                aria-label={`删除付款分配 ${index + 1}`}
                className="icon-button allocation-remove"
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((_, item) => item !== index))}
                type="button"
              >
                <Minus size={15} />
              </button>
            </div>
          ))}
        </section>
        <Actions
          label="保存并过账付款"
          pending={mutations.payment.isPending || mutations.post.isPending}
        />
      </form>
    </Shell>
  );
}

interface ReceiptLine {
  targetId: string;
  amount: string;
}

const newReceiptLine = (): ReceiptLine => ({ targetId: '', amount: '' });

function ReceiptDialog({ open, onOpenChange }: DialogProps) {
  const accounts = useFinanceOptions('accounts');
  const receivables = useFinanceOptions('receivables');
  const compensation = useFinanceOptions('compensation');
  const mutations = useFinanceMutations();
  const notify = useToast();
  const [accountId, setAccountId] = useState('');
  const [targetType, setTargetType] = useState<'SALES' | 'COMPENSATION'>('SALES');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const [settlementPeriod, setSettlementPeriod] = useState(thisMonth());
  const [remark, setRemark] = useState('');
  const [lines, setLines] = useState<ReceiptLine[]>([newReceiptLine()]);
  const targets = (
    targetType === 'SALES' ? receivables.data?.data : compensation.data?.data
  )?.filter((row) => !['SETTLED', 'VOID'].includes(String(row.status)));
  const update = (index: number, field: keyof ReceiptLine, value: string) =>
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)),
    );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountId || !amount || lines.some((line) => !line.targetId || !line.amount))
      return notify('请完整填写账户、金额与收款分配', 'error');
    try {
      const receipt = await mutations.receipt.mutateAsync({
        accountId,
        amount,
        occurredAt: new Date(occurredAt).toISOString(),
        settlementPeriod,
        remark: remark || undefined,
        allocations: lines.map((line) => ({
          ...(targetType === 'SALES'
            ? { receivableId: line.targetId }
            : { supplierCompensationReceivableId: line.targetId }),
          amount: line.amount,
        })),
      });
      await mutations.post.mutateAsync({ kind: 'receipts', id: receipt.id });
      notify('收款已过账，应收与真实资金流水已同步', 'success');
      setLines([newReceiptLine()]);
      setAmount('');
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <Shell
      description="销售回款与供应商赔付分别入账；支持一张收款单分配多个同类应收。"
      onOpenChange={onOpenChange}
      open={open}
      title="新建收款"
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="收款账户">
            <Select onChange={(event) => setAccountId(event.target.value)} value={accountId}>
              <option value="">请选择</option>
              <Options rows={accounts.data?.data.filter((row) => row.status === 'ACTIVE')} />
            </Select>
          </Field>
          <Field label="收款类型">
            <Select
              onChange={(event) => {
                setTargetType(event.target.value as 'SALES' | 'COMPENSATION');
                setLines([newReceiptLine()]);
              }}
              value={targetType}
            >
              <option value="SALES">销售应收</option>
              <option value="COMPENSATION">供应商赔付</option>
            </Select>
          </Field>
          <Field label="实际收款金额">
            <Input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
          </Field>
          <Field label="收款时间">
            <DatePickerInput onChange={setOccurredAt} value={occurredAt} />
          </Field>
          <Field label="结算月份">
            <DatePickerInput mode="month" onChange={setSettlementPeriod} value={settlementPeriod} />
          </Field>
          <Field label="备注">
            <Textarea onChange={(event) => setRemark(event.target.value)} rows={2} value={remark} />
          </Field>
        </div>
        <section className="finance-allocation-editor">
          <header>
            <strong>收款分配</strong>
            <Button
              onClick={() => setLines((current) => [...current, newReceiptLine()])}
              type="button"
              variant="ghost"
            >
              <Plus size={15} /> 添加分配
            </Button>
          </header>
          {lines.map((line, index) => (
            <div className="finance-allocation-row receipt-row" key={index}>
              <Field label={targetType === 'SALES' ? '销售应收' : '赔付应收'}>
                <Select
                  onChange={(event) => update(index, 'targetId', event.target.value)}
                  value={line.targetId}
                >
                  <option value="">请选择</option>
                  {targets?.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} · {row.name} · 未收 ¥{String(row.outstandingAmount)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="分配金额">
                <Input
                  inputMode="decimal"
                  onChange={(event) => update(index, 'amount', event.target.value)}
                  value={line.amount}
                />
              </Field>
              <button
                aria-label={`删除收款分配 ${index + 1}`}
                className="icon-button allocation-remove"
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((_, item) => item !== index))}
                type="button"
              >
                <Minus size={15} />
              </button>
            </div>
          ))}
        </section>
        <Actions
          label="保存并过账收款"
          pending={mutations.receipt.isPending || mutations.post.isPending}
        />
      </form>
    </Shell>
  );
}

function ExpenseDialog({ open, onOpenChange }: DialogProps) {
  const accounts = useFinanceOptions('accounts');
  const mutations = useFinanceMutations();
  const notify = useToast();
  const [accountId, setAccountId] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('OFFICE_SUPPLIES');
  const [reason, setReason] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountId || !reason.trim() || !payee.trim() || !amount)
      return notify('请完整填写开销事项、收款方、账户和金额', 'error');
    try {
      await mutations.expense.mutateAsync({
        accountId,
        expenseCategory,
        reason,
        payee,
        amount,
        occurredAt: new Date(occurredAt).toISOString(),
      });
      notify('开销账单已保存为草稿，过账后进入财务汇总', 'success');
      setReason('');
      setPayee('');
      setAmount('');
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <Shell
      description="先保存账单，确认无误后过账；过账会扣减资金账户并进入月度财务汇总。"
      onOpenChange={onOpenChange}
      open={open}
      title="新建开销账单"
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="开销类别">
            <Select
              onChange={(event) => setExpenseCategory(event.target.value)}
              value={expenseCategory}
            >
              <option value="OFFICE_SUPPLIES">办公耗材</option>
              <option value="QUALIFICATION">资质办理</option>
              <option value="PREMISES">店铺费用</option>
              <option value="UTILITIES">通讯水电</option>
              <option value="TRAVEL">差旅交通</option>
              <option value="OTHER">其他开销</option>
            </Select>
          </Field>
          <Field label="开销日期">
            <DatePickerInput onChange={setOccurredAt} value={occurredAt} />
          </Field>
          <Field label="开销事项">
            <Input onChange={(event) => setReason(event.target.value)} value={reason} />
          </Field>
          <Field label="收款方">
            <Input onChange={(event) => setPayee(event.target.value)} value={payee} />
          </Field>
          <Field label="资金账户">
            <Select onChange={(event) => setAccountId(event.target.value)} value={accountId}>
              <option value="">请选择</option>
              <Options rows={accounts.data?.data.filter((row) => row.status === 'ACTIVE')} />
            </Select>
          </Field>
          <Field label="金额">
            <Input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
          </Field>
        </div>
        <Actions label="保存开销账单" pending={mutations.expense.isPending} />
      </form>
    </Shell>
  );
}

function AdjustmentDialog({ open, onOpenChange }: DialogProps) {
  const accounts = useFinanceOptions('accounts');
  const salesChannels = useMasterOptions('sales-channels');
  const customers = useMasterOptions('customers');
  const suppliers = useMasterOptions('suppliers');
  const purchaseChannels = useMasterOptions('purchase-channels');
  const buyers = useMasterOptions('buyers');
  const mutations = useFinanceMutations();
  const notify = useToast();
  const [accountId, setAccountId] = useState('');
  const [direction, setDirection] = useState('OUT');
  const [category, setCategory] = useState('OTHER_EXPENSE');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const [reason, setReason] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, string>>({});
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountId || !amount || !reason.trim())
      return notify('请完整填写账户、金额和原因', 'error');
    try {
      const adjustment = await mutations.adjustment.mutateAsync({
        accountId,
        direction,
        category,
        amount,
        occurredAt: new Date(occurredAt).toISOString(),
        reason,
        ...Object.fromEntries(Object.entries(dimensions).filter(([, value]) => value)),
      });
      await mutations.post.mutateAsync({ kind: 'adjustments', id: adjustment.id });
      notify('账户调整已过账并形成资金流水', 'success');
      setAmount('');
      setReason('');
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  const dimensionFields: Array<[string, string, MasterRow[] | undefined]> = [
    ['salesChannelId', '销售渠道', salesChannels.data?.data],
    ['customerId', '客户', customers.data?.data],
    ['supplierId', '供应商', suppliers.data?.data],
    ['purchaseChannelId', '采购渠道', purchaseChannels.data?.data],
    ['buyerId', '采购员', buyers.data?.data],
  ];
  return (
    <Shell
      description="用于期初、平台费、物流费和其他真实费用；选择维度后可进入月度分析。"
      onOpenChange={onOpenChange}
      open={open}
      title="账户调整与费用"
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="资金账户">
            <Select onChange={(event) => setAccountId(event.target.value)} value={accountId}>
              <option value="">请选择</option>
              <Options rows={accounts.data?.data.filter((row) => row.status === 'ACTIVE')} />
            </Select>
          </Field>
          <Field label="资金方向">
            <Select onChange={(event) => setDirection(event.target.value)} value={direction}>
              <option value="IN">流入</option>
              <option value="OUT">流出</option>
            </Select>
          </Field>
          <Field label="业务分类">
            <Select onChange={(event) => setCategory(event.target.value)} value={category}>
              <option value="ACCOUNT_ADJUSTMENT">账户调整</option>
              <option value="PLATFORM_FEE">平台费</option>
              <option value="LOGISTICS_FEE">物流费</option>
              <option value="OTHER_EXPENSE">其他费用</option>
              <option value="OTHER_INCOME">其他收入</option>
            </Select>
          </Field>
          <Field label="金额">
            <Input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
          </Field>
          <Field label="发生时间">
            <DatePickerInput onChange={setOccurredAt} value={occurredAt} />
          </Field>
          {dimensionFields.map(([key, label, rows]) => (
            <Field key={key} label={`${label}（可选）`}>
              <Select
                onChange={(event) =>
                  setDimensions((current) => ({ ...current, [key]: event.target.value }))
                }
                value={dimensions[key] ?? ''}
              >
                <option value="">不指定</option>
                <Options rows={rows} />
              </Select>
            </Field>
          ))}
          <Field label="原因/备注">
            <Textarea onChange={(event) => setReason(event.target.value)} rows={2} value={reason} />
          </Field>
        </div>
        <Actions
          label="保存并过账调整"
          pending={mutations.adjustment.isPending || mutations.post.isPending}
        />
      </form>
    </Shell>
  );
}

export function FinanceDialogs({
  active,
  onOpenChange,
}: {
  active?: FinanceDialogKind;
  onOpenChange: (kind?: FinanceDialogKind) => void;
}) {
  if (active === 'account')
    return (
      <AccountDialog onOpenChange={(open) => onOpenChange(open ? 'account' : undefined)} open />
    );
  if (active === 'payment')
    return (
      <PaymentDialog onOpenChange={(open) => onOpenChange(open ? 'payment' : undefined)} open />
    );
  if (active === 'receipt')
    return (
      <ReceiptDialog onOpenChange={(open) => onOpenChange(open ? 'receipt' : undefined)} open />
    );
  if (active === 'adjustment')
    return (
      <AdjustmentDialog
        onOpenChange={(open) => onOpenChange(open ? 'adjustment' : undefined)}
        open
      />
    );
  if (active === 'expense')
    return (
      <ExpenseDialog onOpenChange={(open) => onOpenChange(open ? 'expense' : undefined)} open />
    );
  return null;
}

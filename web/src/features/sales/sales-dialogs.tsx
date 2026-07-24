import { Dialog } from '@base-ui/react/dialog'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useToast } from '@/components/feedback/toast-provider'
import { Button } from '@/components/ui/button'
import { DatePickerInput, today } from '@/components/ui/date-picker'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { useInventoryList } from '@/features/inventory/use-inventory'
import type { MasterRow } from '@/features/master-data/api'
import { useMasterOptions } from '@/features/master-data/use-master-data'
import { apiErrorMessage } from '@/lib/api-error'
import { useSalesMutations, useSalesOptions } from './use-sales'

export type SalesDialogKind = 'price' | 'order' | 'issue' | 'return'

function Shell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog-popup inventory-dialog">
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
  )
}

function Actions({ pending, label }: { pending: boolean; label: string }) {
  return (
    <footer className="dialog-footer">
      <Dialog.Close className="button button-ghost">取消</Dialog.Close>
      <Button disabled={pending} type="submit">
        {pending ? '正在处理…' : label}
      </Button>
    </footer>
  )
}

function Options({ rows }: { rows?: MasterRow[] }) {
  return rows?.map((row) => (
    <option key={row.id} value={row.id}>
      {row.code} · {row.name}
    </option>
  ))
}

function useReferenceOptions() {
  const channels = useMasterOptions('sales-channels')
  const customers = useMasterOptions('customers')
  const skus = useMasterOptions('skus')
  const locations = useInventoryList('locations', {
    page: 1,
    pageSize: 100,
    sortBy: 'code',
    sortOrder: 'asc',
    status: 'ACTIVE',
  })
  return {
    channels: channels.data?.data,
    customers: customers.data?.data,
    skus: skus.data?.data,
    locations: locations.data?.data,
  }
}

const decimal = /^\d+(\.\d{1,6})?$/
const quantity = /^\d+(\.\d{1,4})?$/

const priceSchema = z.object({
  skuId: z.string().uuid('请选择 SKU'),
  salesChannelId: z.string().optional(),
  customerId: z.string().optional(),
  price: z.string().regex(decimal, '售价格式无效'),
  minQuantity: z.string().regex(quantity, '起售量格式无效'),
  effectiveFrom: z.string().min(1, '请选择生效时间'),
  effectiveTo: z.string().optional(),
})

function PriceDialog({ open, onOpenChange }: DialogProps) {
  const options = useReferenceOptions()
  const mutations = useSalesMutations()
  const notify = useToast()
  const form = useForm<z.infer<typeof priceSchema>>({
    resolver: zodResolver(priceSchema),
    defaultValues: {
      skuId: '',
      salesChannelId: '',
      customerId: '',
      price: '',
      minQuantity: '1',
      effectiveFrom: today(),
      effectiveTo: '',
    },
  })
  const submit = async (values: z.infer<typeof priceSchema>) => {
    try {
      await mutations.price.mutateAsync({
        ...values,
        salesChannelId: values.salesChannelId || undefined,
        customerId: values.customerId || undefined,
        currency: 'CNY',
        effectiveFrom: new Date(values.effectiveFrom).toISOString(),
        effectiveTo: values.effectiveTo ? new Date(values.effectiveTo).toISOString() : undefined,
      })
      notify('销售价格已保存', 'success')
      form.reset()
      onOpenChange(false)
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }
  return (
    <Shell
      description="客户价优先于渠道价和默认价；销售订单会保存独立成交快照。"
      onOpenChange={onOpenChange}
      open={open}
      title="新增销售价格"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.skuId?.message} label="SKU">
            <Select {...form.register('skuId')}>
              <option value="">请选择</option>
              <Options rows={options.skus} />
            </Select>
          </Field>
          <Field label="销售渠道（可选）">
            <Select {...form.register('salesChannelId')}>
              <option value="">默认价</option>
              <Options rows={options.channels} />
            </Select>
          </Field>
          <Field label="客户（可选）">
            <Select {...form.register('customerId')}>
              <option value="">不限定客户</option>
              <Options rows={options.customers} />
            </Select>
          </Field>
          <Field error={form.formState.errors.price?.message} label="销售单价">
            <Input inputMode="decimal" {...form.register('price')} />
          </Field>
          <Field error={form.formState.errors.minQuantity?.message} label="起售量">
            <Input inputMode="decimal" {...form.register('minQuantity')} />
          </Field>
          <Field label="生效时间">
            <DatePickerInput
              onChange={(value) =>
                form.setValue('effectiveFrom', value, { shouldDirty: true, shouldValidate: true })
              }
              value={form.watch('effectiveFrom')}
            />
          </Field>
          <Field label="失效时间（可选）">
            <DatePickerInput
              onChange={(value) =>
                form.setValue('effectiveTo', value, { shouldDirty: true, shouldValidate: true })
              }
              value={form.watch('effectiveTo')}
            />
          </Field>
        </div>
        <Actions label="保存售价" pending={mutations.price.isPending} />
      </form>
    </Shell>
  )
}

const orderSchema = z.object({
  salesChannelId: z.string().uuid('请选择销售渠道'),
  customerId: z.string().optional(),
  skuId: z.string().uuid('请选择 SKU'),
  quantity: z.string().regex(quantity, '数量格式无效'),
  unitPrice: z
    .string()
    .refine((value) => !value || decimal.test(value), '单价格式无效')
    .optional(),
  orderDate: z.string().min(1),
  remark: z.string().max(1000).optional(),
})

function OrderDialog({ open, onOpenChange }: DialogProps) {
  const options = useReferenceOptions()
  const mutations = useSalesMutations()
  const notify = useToast()
  const form = useForm<z.infer<typeof orderSchema>>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      salesChannelId: '',
      customerId: '',
      skuId: '',
      quantity: '',
      unitPrice: '',
      orderDate: today(),
      remark: '',
    },
  })
  const submit = async (values: z.infer<typeof orderSchema>) => {
    try {
      const order = await mutations.order.mutateAsync({
        salesChannelId: values.salesChannelId,
        customerId: values.customerId || undefined,
        currency: 'CNY',
        orderDate: new Date(values.orderDate).toISOString(),
        remark: values.remark,
        items: [
          {
            skuId: values.skuId,
            quantity: values.quantity,
            unitPrice: values.unitPrice || undefined,
          },
        ],
      })
      await mutations.transition.mutateAsync({ kind: 'orders', id: order.id, action: 'confirm' })
      notify('销售订单已创建并确认', 'success')
      form.reset()
      onOpenChange(false)
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }
  return (
    <Shell
      description="留空单价时按客户价、渠道价、默认价自动解析；最终成交价写入订单快照。"
      onOpenChange={onOpenChange}
      open={open}
      title="新建销售订单"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.salesChannelId?.message} label="销售渠道">
            <Select {...form.register('salesChannelId')}>
              <option value="">请选择</option>
              <Options rows={options.channels} />
            </Select>
          </Field>
          <Field label="客户（可选）">
            <Select {...form.register('customerId')}>
              <option value="">匿名/渠道客户</option>
              <Options rows={options.customers} />
            </Select>
          </Field>
          <Field error={form.formState.errors.skuId?.message} label="SKU">
            <Select {...form.register('skuId')}>
              <option value="">请选择</option>
              <Options rows={options.skus} />
            </Select>
          </Field>
          <Field error={form.formState.errors.quantity?.message} label="销售数量">
            <Input inputMode="decimal" {...form.register('quantity')} />
          </Field>
          <Field error={form.formState.errors.unitPrice?.message} label="成交单价（可自动解析）">
            <Input
              inputMode="decimal"
              placeholder="留空使用价格表"
              {...form.register('unitPrice')}
            />
          </Field>
          <Field label="下单时间">
            <DatePickerInput
              onChange={(value) =>
                form.setValue('orderDate', value, { shouldDirty: true, shouldValidate: true })
              }
              value={form.watch('orderDate')}
            />
          </Field>
          <Field label="备注">
            <Textarea rows={2} {...form.register('remark')} />
          </Field>
        </div>
        <Actions
          label="创建并确认"
          pending={mutations.order.isPending || mutations.transition.isPending}
        />
      </form>
    </Shell>
  )
}

const issueSchema = z.object({
  locationId: z.string().uuid('请选择出库地点'),
  quantity: z.string().refine((value) => !value || quantity.test(value), '数量格式无效'),
  occurredAt: z.string().optional(),
  remark: z.string().max(1000).optional(),
})

function IssueDialog({ issue, open, onOpenChange }: DialogProps & { issue: MasterRow }) {
  const references = useReferenceOptions()
  const mutations = useSalesMutations()
  const notify = useToast()
  const item = ((issue.items as MasterRow[] | undefined) ?? [])[0]
  const defaultQuantity = String(item?.quantity ?? '')
  const defaultDate = String(issue.occurredAt ?? '').slice(0, 10)
  const form = useForm<z.infer<typeof issueSchema>>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      locationId: String(issue.locationId ?? ''),
      quantity: '',
      occurredAt: '',
      remark: String(issue.remark ?? ''),
    },
  })
  const submit = async (values: z.infer<typeof issueSchema>) => {
    try {
      await mutations.issue.mutateAsync({
        id: issue.id,
        locationId: values.locationId,
        quantity: values.quantity || undefined,
        occurredAt: values.occurredAt ? new Date(values.occurredAt).toISOString() : undefined,
        remark: values.remark || undefined,
      })
      await mutations.transition.mutateAsync({ kind: 'issues', id: issue.id, action: 'post' })
      notify('销售出库已过账并生成应收', 'success')
      onOpenChange(false)
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }
  return (
    <Shell
      description={`销售数量和销售日期留空时，分别使用订单数量 ${defaultQuantity} 与订单日期 ${defaultDate}。`}
      onOpenChange={onOpenChange}
      open={open}
      title="销售出库"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.locationId?.message} label="出库地点">
            <Select {...form.register('locationId')}>
              <option value="">请选择</option>
              <Options rows={references.locations} />
            </Select>
          </Field>
          <Field error={form.formState.errors.quantity?.message} label="本次销售数量（可留空）">
            <Input
              inputMode="decimal"
              placeholder={`订单数量：${defaultQuantity}`}
              {...form.register('quantity')}
            />
          </Field>
          <Field label="销售日期（可留空）">
            <DatePickerInput
              onChange={(value) =>
                form.setValue('occurredAt', value, { shouldDirty: true, shouldValidate: true })
              }
              value={form.watch('occurredAt')}
            />
          </Field>
          <Field label="备注">
            <Textarea rows={2} {...form.register('remark')} />
          </Field>
        </div>
        <Actions
          label="保存并过账"
          pending={mutations.issue.isPending || mutations.transition.isPending}
        />
      </form>
    </Shell>
  )
}

const returnSchema = z.object({
  salesIssueId: z.string().uuid('请选择销售出库单'),
  salesIssueItemId: z.string().uuid('请选择出库明细'),
  qcLocationId: z.string().uuid('请选择待质检区域'),
  quantity: z.string().regex(quantity, '数量格式无效'),
  occurredAt: z.string().min(1),
  reason: z.string().trim().min(2, '请填写退货原因'),
})

function ReturnDialog({ open, onOpenChange }: DialogProps) {
  const references = useReferenceOptions()
  const issuesQuery = useSalesOptions('issues')
  const issues = issuesQuery.data?.data.filter((row) => String(row.status) === 'POSTED') ?? []
  const qcLocations = references.locations?.filter((row) => row.type === 'QC_AREA')
  const mutations = useSalesMutations()
  const notify = useToast()
  const form = useForm<z.infer<typeof returnSchema>>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      salesIssueId: '',
      salesIssueItemId: '',
      qcLocationId: '',
      quantity: '',
      occurredAt: today(),
      reason: '',
    },
  })
  const issue = issues.find((row) => row.id === form.watch('salesIssueId'))
  const items = (issue?.items as MasterRow[] | undefined) ?? []
  const submit = async (values: z.infer<typeof returnSchema>) => {
    try {
      const returned = await mutations.returned.mutateAsync({
        salesIssueId: values.salesIssueId,
        qcLocationId: values.qcLocationId,
        occurredAt: new Date(values.occurredAt).toISOString(),
        reason: values.reason,
        items: [{ salesIssueItemId: values.salesIssueItemId, quantity: values.quantity }],
      })
      await mutations.transition.mutateAsync({ kind: 'returns', id: returned.id, action: 'post' })
      notify('销售退货已进入待质检并调整应收', 'success')
      form.reset()
      onOpenChange(false)
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }
  return (
    <Shell
      description="退货只进入 QC_PENDING，不会直接增加可售库存；批次来源会继续保留。"
      onOpenChange={onOpenChange}
      open={open}
      title="销售退货"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.salesIssueId?.message} label="原销售出库单">
            <Select {...form.register('salesIssueId')}>
              <option value="">请选择</option>
              {issues.map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.issueNo)} · {row.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field error={form.formState.errors.salesIssueItemId?.message} label="出库明细">
            <Select {...form.register('salesIssueItemId')}>
              <option value="">请选择</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {String((item.sku as { code?: string })?.code)} · 可退{' '}
                  {Number(item.quantity) - Number(item.returnedQuantity)}
                </option>
              ))}
            </Select>
          </Field>
          <Field error={form.formState.errors.qcLocationId?.message} label="待质检区域">
            <Select {...form.register('qcLocationId')}>
              <option value="">请选择</option>
              <Options rows={qcLocations} />
            </Select>
          </Field>
          <Field error={form.formState.errors.quantity?.message} label="退货数量">
            <Input inputMode="decimal" {...form.register('quantity')} />
          </Field>
          <Field label="退货时间">
            <DatePickerInput
              onChange={(value) =>
                form.setValue('occurredAt', value, { shouldDirty: true, shouldValidate: true })
              }
              value={form.watch('occurredAt')}
            />
          </Field>
          <Field error={form.formState.errors.reason?.message} label="退货原因">
            <Textarea rows={2} {...form.register('reason')} />
          </Field>
        </div>
        <Actions
          label="保存并过账"
          pending={mutations.returned.isPending || mutations.transition.isPending}
        />
      </form>
    </Shell>
  )
}

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SalesDialogs({
  active,
  issue,
  onOpenChange,
}: {
  active?: SalesDialogKind
  issue?: MasterRow
  onOpenChange: (kind?: SalesDialogKind) => void
}) {
  if (active === 'price')
    return <PriceDialog onOpenChange={(open) => onOpenChange(open ? 'price' : undefined)} open />
  if (active === 'order')
    return <OrderDialog onOpenChange={(open) => onOpenChange(open ? 'order' : undefined)} open />
  if (active === 'issue' && issue)
    return (
      <IssueDialog
        issue={issue}
        onOpenChange={(open) => onOpenChange(open ? 'issue' : undefined)}
        open
      />
    )
  if (active === 'return')
    return <ReturnDialog onOpenChange={(open) => onOpenChange(open ? 'return' : undefined)} open />
  return null
}

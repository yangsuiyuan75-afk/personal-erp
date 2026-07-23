import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { DatePickerInput, today } from '@/components/ui/date-picker';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/feedback/toast-provider';
import type { MasterRow } from '@/features/master-data/api';
import { useMasterOptions } from '@/features/master-data/use-master-data';
import { useInventoryList } from '@/features/inventory/use-inventory';
import { apiErrorMessage } from '@/lib/api-error';
import { usePurchaseMutations, usePurchaseOptions } from './use-purchase';

export type PurchaseDialogKind = 'price' | 'order' | 'receipt' | 'return';

function Shell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
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
  );
}

function Actions({ pending, label }: { pending: boolean; label: string }) {
  return (
    <footer className="dialog-footer">
      <Dialog.Close className="button button-ghost">取消</Dialog.Close>
      <Button disabled={pending} type="submit">
        {pending ? '正在处理…' : label}
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

function useReferenceOptions() {
  const suppliers = useMasterOptions('suppliers');
  const buyers = useMasterOptions('buyers');
  const channels = useMasterOptions('purchase-channels');
  const skus = useMasterOptions('skus');
  const locations = useInventoryList('locations', {
    page: 1,
    pageSize: 100,
    sortBy: 'code',
    sortOrder: 'asc',
    status: 'ACTIVE',
  });
  return {
    suppliers: suppliers.data?.data,
    buyers: buyers.data?.data,
    channels: channels.data?.data,
    skus: skus.data?.data,
    locations: locations.data?.data,
  };
}

const priceSchema = z.object({
  skuId: z.string().uuid('请选择 SKU'),
  supplierId: z.string().uuid('请选择供应商'),
  buyerId: z.string().optional(),
  purchaseChannelId: z.string().uuid('请选择采购渠道'),
  price: z.string().regex(/^\d+(\.\d{1,6})?$/, '报价格式无效'),
  minQuantity: z.string().regex(/^\d+(\.\d{1,4})?$/, '起订量格式无效'),
  effectiveFrom: z.string().min(1, '请选择生效时间'),
  effectiveTo: z.string().optional(),
});

function PriceDialog({ open, onOpenChange }: DialogProps) {
  const options = useReferenceOptions();
  const mutations = usePurchaseMutations();
  const notify = useToast();
  const form = useForm<z.infer<typeof priceSchema>>({
    resolver: zodResolver(priceSchema),
    defaultValues: {
      skuId: '',
      supplierId: '',
      buyerId: '',
      purchaseChannelId: '',
      price: '',
      minQuantity: '1',
      effectiveFrom: today(),
      effectiveTo: '',
    },
  });
  const submit = async (values: z.infer<typeof priceSchema>) => {
    try {
      await mutations.price.mutateAsync({
        ...values,
        buyerId: values.buyerId || undefined,
        currency: 'CNY',
        effectiveFrom: new Date(values.effectiveFrom).toISOString(),
        effectiveTo: values.effectiveTo ? new Date(values.effectiveTo).toISOString() : undefined,
      });
      notify('采购报价已保存', 'success');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <Shell
      description="报价用于推荐；采购订单仍会保存独立成交价快照。"
      onOpenChange={onOpenChange}
      open={open}
      title="新增采购报价"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.skuId?.message} label="SKU">
            <Select {...form.register('skuId')}>
              <option value="">请选择</option>
              <Options rows={options.skus} />
            </Select>
          </Field>
          <Field error={form.formState.errors.supplierId?.message} label="供应商">
            <Select {...form.register('supplierId')}>
              <option value="">请选择</option>
              <Options rows={options.suppliers} />
            </Select>
          </Field>
          <Field error={form.formState.errors.purchaseChannelId?.message} label="采购渠道">
            <Select {...form.register('purchaseChannelId')}>
              <option value="">请选择</option>
              <Options rows={options.channels} />
            </Select>
          </Field>
          <Field label="采购员（可选）">
            <Select {...form.register('buyerId')}>
              <option value="">不限定</option>
              <Options rows={options.buyers} />
            </Select>
          </Field>
          <Field error={form.formState.errors.price?.message} label="含税报价">
            <Input inputMode="decimal" {...form.register('price')} />
          </Field>
          <Field error={form.formState.errors.minQuantity?.message} label="起订量">
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
        <Actions label="保存报价" pending={mutations.price.isPending} />
      </form>
    </Shell>
  );
}

const orderSchema = z.object({
  supplierId: z.string().uuid('请选择供应商'),
  buyerId: z.string().uuid('请选择采购员'),
  purchaseChannelId: z.string().uuid('请选择采购渠道'),
  skuId: z.string().uuid('请选择 SKU'),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, '数量格式无效'),
  unitPrice: z.string().regex(/^\d+(\.\d{1,6})?$/, '单价格式无效'),
  orderDate: z.string().min(1),
  expectedAt: z.string().optional(),
  remark: z.string().max(1000).optional(),
});

function orderDefaults(order?: MasterRow): z.infer<typeof orderSchema> {
  const item = Array.isArray(order?.items) ? (order.items[0] as MasterRow | undefined) : undefined;
  const relationId = (value: unknown) =>
    value && typeof value === 'object' && 'id' in value ? String(value.id) : '';
  return {
    supplierId: relationId(order?.supplier),
    buyerId: relationId(order?.buyer),
    purchaseChannelId: relationId(order?.purchaseChannel),
    skuId: relationId(item?.sku),
    quantity: String(item?.quantity ?? ''),
    unitPrice: String(item?.unitPrice ?? ''),
    orderDate: String(order?.orderDate ?? today()).slice(0, 10),
    expectedAt: order?.expectedAt ? String(order.expectedAt).slice(0, 10) : '',
    remark: String(order?.remark ?? ''),
  };
}

function OrderDialog({ open, onOpenChange, order }: DialogProps & { order?: MasterRow }) {
  const options = useReferenceOptions();
  const mutations = usePurchaseMutations();
  const notify = useToast();
  const form = useForm<z.infer<typeof orderSchema>>({
    resolver: zodResolver(orderSchema),
    defaultValues: orderDefaults(),
  });
  useEffect(() => {
    if (open) form.reset(orderDefaults(order));
  }, [form, open, order]);
  const submit = async (values: z.infer<typeof orderSchema>) => {
    try {
      const payload = {
        supplierId: values.supplierId,
        buyerId: values.buyerId,
        purchaseChannelId: values.purchaseChannelId,
        currency: 'CNY',
        orderDate: new Date(values.orderDate).toISOString(),
        expectedAt: values.expectedAt ? new Date(values.expectedAt).toISOString() : undefined,
        remark: values.remark,
        items: [{ skuId: values.skuId, quantity: values.quantity, unitPrice: values.unitPrice }],
      };
      if (order) await mutations.orderUpdate.mutateAsync({ id: order.id, payload });
      else await mutations.order.mutateAsync(payload);
      notify(order ? '采购订单已更新' : '采购订单已创建', 'success');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <Shell
      description="确认前或尚未创建收货单时可修改；已有收货单后保留原成交快照。"
      onOpenChange={onOpenChange}
      open={open}
      title={order ? '编辑采购订单' : '新建采购订单'}
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.supplierId?.message} label="供应商">
            <Select {...form.register('supplierId')}>
              <option value="">请选择</option>
              <Options rows={options.suppliers} />
            </Select>
          </Field>
          <Field error={form.formState.errors.purchaseChannelId?.message} label="采购渠道">
            <Select {...form.register('purchaseChannelId')}>
              <option value="">请选择</option>
              <Options rows={options.channels} />
            </Select>
          </Field>
          <Field error={form.formState.errors.buyerId?.message} label="采购员">
            <Select {...form.register('buyerId')}>
              <option value="">请选择</option>
              <Options rows={options.buyers} />
            </Select>
          </Field>
          <Field error={form.formState.errors.skuId?.message} label="SKU">
            <Select {...form.register('skuId')}>
              <option value="">请选择</option>
              <Options rows={options.skus} />
            </Select>
          </Field>
          <Field error={form.formState.errors.quantity?.message} label="采购数量">
            <Input inputMode="decimal" {...form.register('quantity')} />
          </Field>
          <Field error={form.formState.errors.unitPrice?.message} label="成交单价">
            <Input inputMode="decimal" {...form.register('unitPrice')} />
          </Field>
          <Field label="下单时间">
            <DatePickerInput
              onChange={(value) =>
                form.setValue('orderDate', value, { shouldDirty: true, shouldValidate: true })
              }
              value={form.watch('orderDate')}
            />
          </Field>
          <Field label="预计到货">
            <DatePickerInput
              onChange={(value) =>
                form.setValue('expectedAt', value, { shouldDirty: true, shouldValidate: true })
              }
              value={form.watch('expectedAt')}
            />
          </Field>
          <Field label="备注">
            <Textarea rows={2} {...form.register('remark')} />
          </Field>
        </div>
        <Actions
          label={order ? '保存修改' : '创建采购订单'}
          pending={mutations.order.isPending || mutations.orderUpdate.isPending}
        />
      </form>
    </Shell>
  );
}

const receiptSchema = z.object({
  purchaseOrderId: z.string().uuid('请选择采购订单'),
  purchaseOrderItemId: z.string().uuid('请选择订单明细'),
  locationId: z.string().uuid('请选择收货地点'),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, '数量格式无效'),
  batchNo: z.string().trim().min(1, '请输入批次号'),
  occurredAt: z.string().min(1),
  remark: z.string().max(1000).optional(),
});

function ReceiptDialog({ open, onOpenChange }: DialogProps) {
  const references = useReferenceOptions();
  const ordersQuery = usePurchaseOptions('orders');
  const orders =
    ordersQuery.data?.data.filter((row) =>
      ['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(String(row.status)),
    ) ?? [];
  const mutations = usePurchaseMutations();
  const notify = useToast();
  const form = useForm<z.infer<typeof receiptSchema>>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      purchaseOrderId: '',
      purchaseOrderItemId: '',
      locationId: '',
      quantity: '',
      batchNo: '',
      occurredAt: today(),
      remark: '',
    },
  });
  const order = orders.find((row) => row.id === form.watch('purchaseOrderId'));
  const items = (order?.items as MasterRow[] | undefined) ?? [];
  const submit = async (values: z.infer<typeof receiptSchema>) => {
    try {
      const receipt = await mutations.receipt.mutateAsync({
        purchaseOrderId: values.purchaseOrderId,
        locationId: values.locationId,
        occurredAt: new Date(values.occurredAt).toISOString(),
        remark: values.remark,
        items: [
          {
            purchaseOrderItemId: values.purchaseOrderItemId,
            quantity: values.quantity,
            batchNo: values.batchNo,
          },
        ],
      });
      await mutations.transition.mutateAsync({ kind: 'receipts', id: receipt.id, action: 'post' });
      notify('采购收货已过账并生成应付', 'success');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <Shell
      description="支持分批收货；本次数量不能超过订单未收数量。"
      onOpenChange={onOpenChange}
      open={open}
      title="采购收货"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.purchaseOrderId?.message} label="采购订单">
            <Select {...form.register('purchaseOrderId')}>
              <option value="">请选择</option>
              {orders.map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.orderNo)} · {row.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field error={form.formState.errors.purchaseOrderItemId?.message} label="订单明细">
            <Select {...form.register('purchaseOrderItemId')}>
              <option value="">请选择</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {String((item.sku as { code?: string })?.code)} · 未收{' '}
                  {Number(item.quantity) - Number(item.receivedQuantity)}
                </option>
              ))}
            </Select>
          </Field>
          <Field error={form.formState.errors.locationId?.message} label="收货地点">
            <Select {...form.register('locationId')}>
              <option value="">请选择</option>
              <Options rows={references.locations} />
            </Select>
          </Field>
          <Field error={form.formState.errors.quantity?.message} label="本次收货数量">
            <Input inputMode="decimal" {...form.register('quantity')} />
          </Field>
          <Field error={form.formState.errors.batchNo?.message} label="批次号">
            <Input {...form.register('batchNo')} />
          </Field>
          <Field label="收货时间">
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
          pending={mutations.receipt.isPending || mutations.transition.isPending}
        />
      </form>
    </Shell>
  );
}

const returnSchema = z.object({
  purchaseReceiptId: z.string().uuid('请选择收货单'),
  purchaseReceiptItemId: z.string().uuid('请选择收货明细'),
  locationId: z.string().uuid('请选择退货地点'),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, '数量格式无效'),
  occurredAt: z.string().min(1),
  reason: z.string().trim().min(2, '请填写退货原因'),
});

function ReturnDialog({ open, onOpenChange }: DialogProps) {
  const references = useReferenceOptions();
  const receiptsQuery = usePurchaseOptions('receipts');
  const receipts = receiptsQuery.data?.data.filter((row) => String(row.status) === 'POSTED') ?? [];
  const mutations = usePurchaseMutations();
  const notify = useToast();
  const form = useForm<z.infer<typeof returnSchema>>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      purchaseReceiptId: '',
      purchaseReceiptItemId: '',
      locationId: '',
      quantity: '',
      occurredAt: today(),
      reason: '',
    },
  });
  const receipt = receipts.find((row) => row.id === form.watch('purchaseReceiptId'));
  const items = (receipt?.items as MasterRow[] | undefined) ?? [];
  const submit = async (values: z.infer<typeof returnSchema>) => {
    try {
      const returned = await mutations.returned.mutateAsync({
        purchaseReceiptId: values.purchaseReceiptId,
        locationId: values.locationId,
        occurredAt: new Date(values.occurredAt).toISOString(),
        reason: values.reason,
        items: [{ purchaseReceiptItemId: values.purchaseReceiptItemId, quantity: values.quantity }],
      });
      await mutations.transition.mutateAsync({ kind: 'returns', id: returned.id, action: 'post' });
      notify('采购退货已过账并调整应付', 'success');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <Shell
      description="退货扣减原采购批次；已付款部分形成供应商退款应收。"
      onOpenChange={onOpenChange}
      open={open}
      title="采购退货"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.purchaseReceiptId?.message} label="采购收货单">
            <Select {...form.register('purchaseReceiptId')}>
              <option value="">请选择</option>
              {receipts.map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.receiptNo)} · {row.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field error={form.formState.errors.purchaseReceiptItemId?.message} label="收货明细">
            <Select {...form.register('purchaseReceiptItemId')}>
              <option value="">请选择</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {String((item.sku as { code?: string })?.code)} · 可退{' '}
                  {Number(item.quantity) - Number(item.returnedQuantity)}
                </option>
              ))}
            </Select>
          </Field>
          <Field error={form.formState.errors.locationId?.message} label="退货地点">
            <Select {...form.register('locationId')}>
              <option value="">请选择</option>
              <Options rows={references.locations} />
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
  );
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PurchaseDialogs({
  active,
  onOpenChange,
  order,
}: {
  active?: PurchaseDialogKind;
  onOpenChange: (kind?: PurchaseDialogKind) => void;
  order?: MasterRow;
}) {
  if (active === 'price')
    return <PriceDialog onOpenChange={(open) => onOpenChange(open ? 'price' : undefined)} open />;
  if (active === 'order')
    return (
      <OrderDialog
        onOpenChange={(open) => onOpenChange(open ? 'order' : undefined)}
        open
        order={order}
      />
    );
  if (active === 'receipt')
    return (
      <ReceiptDialog onOpenChange={(open) => onOpenChange(open ? 'receipt' : undefined)} open />
    );
  if (active === 'return')
    return <ReturnDialog onOpenChange={(open) => onOpenChange(open ? 'return' : undefined)} open />;
  return null;
}

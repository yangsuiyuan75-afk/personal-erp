import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { DatePickerInput, today } from '@/components/ui/date-picker';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/feedback/toast-provider';
import { apiErrorMessage } from '@/lib/api-error';
import { useMasterOptions } from '@/features/master-data/use-master-data';
import type { MasterRow } from '@/features/master-data/api';
import { downloadOpeningTemplate, type OpeningPreview } from './api';
import { useInventoryList, useInventoryMutations } from './use-inventory';

function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
}>) {
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

function Options({ rows }: { rows?: MasterRow[] }) {
  return rows?.map((row) => (
    <option key={row.id} value={row.id}>
      {row.code} · {row.name}
    </option>
  ));
}

const locationSchema = z.object({
  code: z.string().trim().min(1, '请输入地点代码'),
  name: z.string().trim().min(1, '请输入地点名称'),
  type: z.string().min(1, '请选择地点类型'),
  salesChannelId: z.string().optional(),
});

export function LocationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const notify = useToast();
  const mutations = useInventoryMutations();
  const channels = useMasterOptions('sales-channels');
  const form = useForm<z.infer<typeof locationSchema>>({
    resolver: zodResolver(locationSchema),
    defaultValues: { code: '', name: '', type: 'PHYSICAL_WAREHOUSE', salesChannelId: '' },
  });
  useEffect(() => {
    if (!open) form.reset();
  }, [form, open]);
  const submit = async (values: z.infer<typeof locationSchema>) => {
    try {
      await mutations.createLocation.mutateAsync({
        ...values,
        salesChannelId: values.salesChannelId || undefined,
        isLeaf: true,
      });
      notify('库存地点已创建', 'success');
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <DialogShell
      description="平台仓必须关联“外部平台仓”库存模式的销售渠道。"
      onOpenChange={onOpenChange}
      open={open}
      title="新增库存地点"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.code?.message} label="地点代码">
            <Input {...form.register('code')} placeholder="MAIN" />
          </Field>
          <Field error={form.formState.errors.name?.message} label="地点名称">
            <Input {...form.register('name')} placeholder="主仓" />
          </Field>
          <Field error={form.formState.errors.type?.message} label="地点类型">
            <Select {...form.register('type')}>
              <option value="PHYSICAL_WAREHOUSE">物理仓库</option>
              <option value="EXTERNAL_WAREHOUSE">外部平台仓</option>
              <option value="QC_AREA">待质检区</option>
              <option value="DEFECTIVE_AREA">不良品区</option>
              <option value="CLAIM_AREA">供应商索赔区</option>
              <option value="SCRAP_AREA">报废区</option>
            </Select>
          </Field>
          <Field label="关联销售渠道">
            <Select {...form.register('salesChannelId')}>
              <option value="">不关联</option>
              <Options rows={channels.data?.data} />
            </Select>
          </Field>
        </div>
        <DialogActions pending={mutations.createLocation.isPending} />
      </form>
    </DialogShell>
  );
}

function DialogActions({
  pending,
  submitLabel = '保存并继续',
}: {
  pending: boolean;
  submitLabel?: string;
}) {
  return (
    <footer className="dialog-footer">
      <Dialog.Close className="button button-ghost">取消</Dialog.Close>
      <Button disabled={pending} type="submit">
        {pending ? '正在处理…' : submitLabel}
      </Button>
    </footer>
  );
}

const openingSchema = z.object({
  occurredAt: z.string().min(1, '请选择业务时间'),
  remark: z.string().max(1000).optional(),
});

export function OpeningDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const notify = useToast();
  const mutations = useInventoryMutations();
  const [preview, setPreview] = useState<OpeningPreview>();
  const [fileName, setFileName] = useState('');
  const form = useForm<z.infer<typeof openingSchema>>({
    resolver: zodResolver(openingSchema),
    defaultValues: { occurredAt: today(), remark: '' },
  });
  useEffect(() => {
    if (!open) {
      setPreview(undefined);
      setFileName('');
      form.reset({ occurredAt: today(), remark: '' });
    }
  }, [form, open]);

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    try {
      setPreview(await mutations.previewOpening.mutateAsync(file));
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  const submit = async (values: z.infer<typeof openingSchema>) => {
    if (!preview?.valid) return;
    try {
      const opening = await mutations.createOpening.mutateAsync({
        importKey: `opening-${crypto.randomUUID()}`,
        occurredAt: new Date(values.occurredAt).toISOString(),
        remark: values.remark,
        rows: preview.rows,
      });
      await mutations.post.mutateAsync({ kind: 'openings', id: opening.id });
      notify(`期初库存 ${opening.openingNo} 已确认入账`, 'success');
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <DialogShell
      description="上传后先逐行校验；确认后生成不可编辑的期初入库库存流水。"
      onOpenChange={onOpenChange}
      open={open}
      title="导入期初库存"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="opening-toolbar">
          <Button onClick={() => void downloadOpeningTemplate()} type="button" variant="ghost">
            <Download size={16} /> 下载 CSV 模板
          </Button>
          <label className="file-picker">
            <FileSpreadsheet size={17} />
            <span>{fileName || '选择 CSV 文件'}</span>
            <input
              accept=".csv,text/csv"
              onChange={(event) => void chooseFile(event.target.files?.[0])}
              type="file"
            />
          </label>
        </div>
        <div className="form-grid">
          <Field error={form.formState.errors.occurredAt?.message} label="业务时间">
            <DatePickerInput
              onChange={(value) =>
                form.setValue('occurredAt', value, { shouldDirty: true, shouldValidate: true })
              }
              value={form.watch('occurredAt')}
            />
          </Field>
          <Field label="备注">
            <Input {...form.register('remark')} />
          </Field>
        </div>
        {preview ? <OpeningPreviewPanel preview={preview} /> : null}
        <DialogActions
          pending={mutations.createOpening.isPending || mutations.post.isPending}
          submitLabel="确认并生成期初流水"
        />
      </form>
    </DialogShell>
  );
}

function OpeningPreviewPanel({ preview }: { preview: OpeningPreview }) {
  return (
    <section className={`opening-preview ${preview.valid ? 'valid' : 'invalid'}`}>
      <header>
        <strong>{preview.valid ? '校验通过' : '存在校验错误'}</strong>
        <span>
          {preview.validCount}/{preview.rowCount} 行 · 数量 {preview.totalQuantity} · 金额 ¥
          {preview.totalValue}
        </span>
      </header>
      <div>
        {preview.rows.slice(0, 8).map((row) => (
          <p key={row.rowNumber}>
            <span>第 {row.rowNumber} 行</span>
            <strong>
              {row.skuCode} · {row.locationCode} · {row.quantity}
            </strong>
            <small>{row.errors.join('；') || '有效'}</small>
          </p>
        ))}
      </div>
    </section>
  );
}

const adjustmentSchema = z.object({
  direction: z.enum(['IN', 'OUT']),
  locationId: z.string().uuid('请选择库存地点'),
  skuId: z.string().uuid('请选择 SKU'),
  stockStatus: z.string(),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, '数量格式无效'),
  unitCost: z.string().optional(),
  occurredAt: z.string().min(1),
  reason: z.string().trim().min(2, '请填写调整原因'),
});

const transferSchema = z.object({
  fromLocationId: z.string().uuid('请选择调出地点'),
  toLocationId: z.string().uuid('请选择调入地点'),
  skuId: z.string().uuid('请选择 SKU'),
  stockStatus: z.string(),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, '数量格式无效'),
  occurredAt: z.string().min(1),
  remark: z.string().max(1000).optional(),
});

function useInventoryOptions() {
  const skus = useMasterOptions('skus');
  const locations = useInventoryList('locations', {
    page: 1,
    pageSize: 100,
    sortBy: 'code',
    sortOrder: 'asc',
    status: 'ACTIVE',
  });
  return { skus: skus.data?.data, locations: locations.data?.data };
}

function StockStatusOptions() {
  return (
    <>
      <option value="AVAILABLE">可售库存</option>
      <option value="QC_PENDING">待质检</option>
      <option value="DEFECTIVE">不良品</option>
      <option value="SUPPLIER_CLAIM">供应商索赔</option>
      <option value="SCRAPPED">已报废</option>
    </>
  );
}

export function AdjustmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const notify = useToast();
  const mutations = useInventoryMutations();
  const options = useInventoryOptions();
  const form = useForm<z.infer<typeof adjustmentSchema>>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      direction: 'IN',
      locationId: '',
      skuId: '',
      stockStatus: 'AVAILABLE',
      quantity: '',
      unitCost: '',
      occurredAt: today(),
      reason: '',
    },
  });
  const direction = form.watch('direction');
  const submit = async (values: z.infer<typeof adjustmentSchema>) => {
    try {
      const adjustment = await mutations.createAdjustment.mutateAsync({
        direction: values.direction,
        occurredAt: new Date(values.occurredAt).toISOString(),
        reason: values.reason,
        items: [
          {
            locationId: values.locationId,
            skuId: values.skuId,
            stockStatus: values.stockStatus,
            quantity: values.quantity,
            unitCost: values.direction === 'IN' ? values.unitCost : undefined,
          },
        ],
      });
      await mutations.post.mutateAsync({ kind: 'adjustments', id: adjustment.id });
      notify('库存调整已过账', 'success');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <DialogShell
      description="调整必须填写原因；调减使用当前移动平均成本并执行批次 FIFO 分配。"
      onOpenChange={onOpenChange}
      open={open}
      title="库存调整"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field label="调整方向">
            <Select {...form.register('direction')}>
              <option value="IN">调增</option>
              <option value="OUT">调减</option>
            </Select>
          </Field>
          <Field error={form.formState.errors.locationId?.message} label="库存地点">
            <Select {...form.register('locationId')}>
              <option value="">请选择</option>
              <Options rows={options.locations} />
            </Select>
          </Field>
          <Field error={form.formState.errors.skuId?.message} label="SKU">
            <Select {...form.register('skuId')}>
              <option value="">请选择</option>
              <Options rows={options.skus} />
            </Select>
          </Field>
          <Field label="库存状态">
            <Select {...form.register('stockStatus')}>
              <StockStatusOptions />
            </Select>
          </Field>
          <Field error={form.formState.errors.quantity?.message} label="数量">
            <Input {...form.register('quantity')} inputMode="decimal" />
          </Field>
          {direction === 'IN' ? (
            <Field label="单位成本">
              <Input {...form.register('unitCost')} inputMode="decimal" />
            </Field>
          ) : null}
          <Field label="业务时间">
            <DatePickerInput
              onChange={(value) =>
                form.setValue('occurredAt', value, { shouldDirty: true, shouldValidate: true })
              }
              value={form.watch('occurredAt')}
            />
          </Field>
          <Field error={form.formState.errors.reason?.message} label="调整原因">
            <Textarea rows={2} {...form.register('reason')} />
          </Field>
        </div>
        <DialogActions
          pending={mutations.createAdjustment.isPending || mutations.post.isPending}
          submitLabel="保存并过账"
        />
      </form>
    </DialogShell>
  );
}

export function TransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const notify = useToast();
  const mutations = useInventoryMutations();
  const options = useInventoryOptions();
  const form = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromLocationId: '',
      toLocationId: '',
      skuId: '',
      stockStatus: 'AVAILABLE',
      quantity: '',
      occurredAt: today(),
      remark: '',
    },
  });
  const submit = async (values: z.infer<typeof transferSchema>) => {
    try {
      const transfer = await mutations.createTransfer.mutateAsync({
        fromLocationId: values.fromLocationId,
        toLocationId: values.toLocationId,
        occurredAt: new Date(values.occurredAt).toISOString(),
        remark: values.remark,
        items: [
          {
            skuId: values.skuId,
            stockStatus: values.stockStatus,
            quantity: values.quantity,
          },
        ],
      });
      await mutations.post.mutateAsync({ kind: 'transfers', id: transfer.id });
      notify('库存调拨已过账', 'success');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };
  return (
    <DialogShell
      description="平台仓入仓使用真实库存调拨，调出与调入在同一事务完成。"
      onOpenChange={onOpenChange}
      open={open}
      title="仓库调拨"
    >
      <form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        <div className="form-grid">
          <Field error={form.formState.errors.fromLocationId?.message} label="调出地点">
            <Select {...form.register('fromLocationId')}>
              <option value="">请选择</option>
              <Options rows={options.locations} />
            </Select>
          </Field>
          <Field error={form.formState.errors.toLocationId?.message} label="调入地点">
            <Select {...form.register('toLocationId')}>
              <option value="">请选择</option>
              <Options rows={options.locations} />
            </Select>
          </Field>
          <Field error={form.formState.errors.skuId?.message} label="SKU">
            <Select {...form.register('skuId')}>
              <option value="">请选择</option>
              <Options rows={options.skus} />
            </Select>
          </Field>
          <Field label="库存状态">
            <Select {...form.register('stockStatus')}>
              <StockStatusOptions />
            </Select>
          </Field>
          <Field error={form.formState.errors.quantity?.message} label="数量">
            <Input {...form.register('quantity')} inputMode="decimal" />
          </Field>
          <Field label="业务时间">
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
        <DialogActions
          pending={mutations.createTransfer.isPending || mutations.post.isPending}
          submitLabel="保存并过账"
        />
      </form>
    </DialogShell>
  );
}

export type InventoryDialogKind = 'location' | 'opening' | 'adjustment' | 'transfer';

export function InventoryDialogs({
  active,
  onOpenChange,
}: {
  active?: InventoryDialogKind;
  onOpenChange: (kind?: InventoryDialogKind) => void;
}) {
  const dialogs: Array<[InventoryDialogKind, ReactNode]> = [
    [
      'location',
      <LocationDialog
        key="location"
        onOpenChange={(open) => onOpenChange(open ? 'location' : undefined)}
        open={active === 'location'}
      />,
    ],
    [
      'opening',
      <OpeningDialog
        key="opening"
        onOpenChange={(open) => onOpenChange(open ? 'opening' : undefined)}
        open={active === 'opening'}
      />,
    ],
    [
      'adjustment',
      <AdjustmentDialog
        key="adjustment"
        onOpenChange={(open) => onOpenChange(open ? 'adjustment' : undefined)}
        open={active === 'adjustment'}
      />,
    ],
    [
      'transfer',
      <TransferDialog
        key="transfer"
        onOpenChange={(open) => onOpenChange(open ? 'transfer' : undefined)}
        open={active === 'transfer'}
      />,
    ],
  ];
  return <>{dialogs.find(([kind]) => kind === active)?.[1]}</>;
}

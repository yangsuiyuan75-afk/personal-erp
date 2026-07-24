import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/feedback/toast-provider'
import { Button } from '@/components/ui/button'
import { DatePickerInput, today } from '@/components/ui/date-picker'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { useInventoryList } from '@/features/inventory/use-inventory'
import type { MasterRow } from '@/features/master-data/api'
import { useMasterOptions } from '@/features/master-data/use-master-data'
import { apiErrorMessage } from '@/lib/api-error'
import { useQualityMutations, useQualityOptions } from './use-quality'

export type QualityDialogKind = 'inspection' | 'settlement'

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
          <Dialog.Popup className="dialog-popup inventory-dialog quality-dialog">
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

function Options({ rows }: { rows?: MasterRow[] }) {
  return rows?.map((row) => (
    <option key={row.id} value={row.id}>
      {row.code} · {row.name}
    </option>
  ))
}

interface Classification {
  goodQuantity: string
  defectiveQuantity: string
  supplierClaimQuantity: string
  scrapQuantity: string
  responsibility: string
  supplierId: string
  defectDescription: string
}

function InspectionDialog({ open, onOpenChange }: DialogProps) {
  const pendingQuery = useQualityOptions('pending')
  const suppliers = useMasterOptions('suppliers')
  const locations = useInventoryList('locations', {
    page: 1,
    pageSize: 100,
    sortBy: 'code',
    sortOrder: 'asc',
    status: 'ACTIVE',
  })
  const mutations = useQualityMutations()
  const notify = useToast()
  const [salesReturnId, setSalesReturnId] = useState('')
  const [inspectedAt, setInspectedAt] = useState(today())
  const [notes, setNotes] = useState('')
  const [availableLocationId, setAvailableLocationId] = useState('')
  const [defectiveLocationId, setDefectiveLocationId] = useState('')
  const [claimLocationId, setClaimLocationId] = useState('')
  const [scrapLocationId, setScrapLocationId] = useState('')
  const [classifications, setClassifications] = useState<Record<string, Classification>>({})
  const returns = pendingQuery.data?.data ?? []
  const selected = returns.find((row) => row.id === salesReturnId)
  const items = useMemo(() => (selected?.items as MasterRow[] | undefined) ?? [], [selected])

  useEffect(() => {
    setClassifications(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            goodQuantity: String(item.quantity ?? '0'),
            defectiveQuantity: '0',
            supplierClaimQuantity: '0',
            scrapQuantity: '0',
            responsibility: 'UNKNOWN',
            supplierId: '',
            defectDescription: '',
          },
        ]),
      ),
    )
  }, [items])

  const update = (id: string, field: keyof Classification, value: string) =>
    setClassifications((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!salesReturnId || !items.length) {
      notify('请选择待质检销售退货', 'error')
      return
    }
    try {
      const inspection = await mutations.inspection.mutateAsync({
        salesReturnId,
        inspectedAt: new Date(inspectedAt).toISOString(),
        notes,
        items: items.map((item) => ({
          salesReturnItemId: item.id,
          ...classifications[item.id],
          supplierId: classifications[item.id].supplierId || undefined,
          defectDescription: classifications[item.id].defectDescription || undefined,
        })),
      })
      await mutations.confirm.mutateAsync({
        id: inspection.id,
        payload: {
          availableLocationId: availableLocationId || undefined,
          defectiveLocationId: defectiveLocationId || undefined,
          claimLocationId: claimLocationId || undefined,
          scrapLocationId: scrapLocationId || undefined,
        },
      })
      notify('质检已确认，库存分流与供应商索赔已同步', 'success')
      setSalesReturnId('')
      onOpenChange(false)
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }

  const locationRows = locations.data?.data
  return (
    <Shell
      description="每行必须满足接收数量守恒；确认后从待质检库存分流，供应商责任会自动形成索赔。"
      onOpenChange={onOpenChange}
      open={open}
      title="退货质检"
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="待质检退货">
            <Select
              onChange={(event) => setSalesReturnId(event.target.value)}
              value={salesReturnId}
            >
              <option value="">请选择</option>
              {returns.map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.returnNo)} · {row.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="质检时间">
            <DatePickerInput onChange={setInspectedAt} value={inspectedAt} />
          </Field>
          <Field label="良品目标仓">
            <Select
              onChange={(event) => setAvailableLocationId(event.target.value)}
              value={availableLocationId}
            >
              <option value="">无良品时可不选</option>
              <Options rows={locationRows} />
            </Select>
          </Field>
          <Field label="不良品区">
            <Select
              onChange={(event) => setDefectiveLocationId(event.target.value)}
              value={defectiveLocationId}
            >
              <option value="">无不良品时可不选</option>
              <Options rows={locationRows?.filter((row) => row.type === 'DEFECTIVE_AREA')} />
            </Select>
          </Field>
          <Field label="供应商索赔区">
            <Select
              onChange={(event) => setClaimLocationId(event.target.value)}
              value={claimLocationId}
            >
              <option value="">无索赔品时可不选</option>
              <Options rows={locationRows?.filter((row) => row.type === 'CLAIM_AREA')} />
            </Select>
          </Field>
          <Field label="报废区">
            <Select
              onChange={(event) => setScrapLocationId(event.target.value)}
              value={scrapLocationId}
            >
              <option value="">无报废品时可不选</option>
              <Options rows={locationRows?.filter((row) => row.type === 'SCRAP_AREA')} />
            </Select>
          </Field>
        </div>
        <div className="quality-classification-list">
          {items.map((item) => {
            const value = classifications[item.id]
            if (!value) return null
            return (
              <fieldset className="quality-classification" key={item.id}>
                <legend>
                  {String((item.sku as { code?: string; name?: string })?.code)} ·{' '}
                  {String((item.sku as { name?: string })?.name)} · 接收 {String(item.quantity)}
                </legend>
                <div className="form-grid quality-quantity-grid">
                  <Field label="良品">
                    <Input
                      inputMode="decimal"
                      onChange={(event) => update(item.id, 'goodQuantity', event.target.value)}
                      value={value.goodQuantity}
                    />
                  </Field>
                  <Field label="不良品">
                    <Input
                      inputMode="decimal"
                      onChange={(event) => update(item.id, 'defectiveQuantity', event.target.value)}
                      value={value.defectiveQuantity}
                    />
                  </Field>
                  <Field label="供应商索赔">
                    <Input
                      inputMode="decimal"
                      onChange={(event) =>
                        update(item.id, 'supplierClaimQuantity', event.target.value)
                      }
                      value={value.supplierClaimQuantity}
                    />
                  </Field>
                  <Field label="报废">
                    <Input
                      inputMode="decimal"
                      onChange={(event) => update(item.id, 'scrapQuantity', event.target.value)}
                      value={value.scrapQuantity}
                    />
                  </Field>
                  <Field label="责任判定">
                    <Select
                      onChange={(event) => update(item.id, 'responsibility', event.target.value)}
                      value={value.responsibility}
                    >
                      <option value="UNKNOWN">待确认</option>
                      <option value="SUPPLIER">供应商</option>
                      <option value="CUSTOMER">客户</option>
                      <option value="LOGISTICS">物流</option>
                      <option value="INTERNAL">内部</option>
                    </Select>
                  </Field>
                  <Field label="责任供应商">
                    <Select
                      onChange={(event) => update(item.id, 'supplierId', event.target.value)}
                      value={value.supplierId}
                    >
                      <option value="">请选择</option>
                      <Options rows={suppliers.data?.data} />
                    </Select>
                  </Field>
                  <Field label="问题描述">
                    <Textarea
                      onChange={(event) => update(item.id, 'defectDescription', event.target.value)}
                      rows={2}
                      value={value.defectDescription}
                    />
                  </Field>
                </div>
              </fieldset>
            )
          })}
        </div>
        <Field label="质检备注">
          <Textarea onChange={(event) => setNotes(event.target.value)} rows={2} value={notes} />
        </Field>
        <footer className="dialog-footer">
          <Dialog.Close className="button button-ghost">取消</Dialog.Close>
          <Button
            disabled={mutations.inspection.isPending || mutations.confirm.isPending}
            type="submit"
          >
            {mutations.inspection.isPending || mutations.confirm.isPending
              ? '正在确认…'
              : '保存并确认质检'}
          </Button>
        </footer>
      </form>
    </Shell>
  )
}

function SettlementDialog({ open, onOpenChange }: DialogProps) {
  const claimsQuery = useQualityOptions('claims')
  const locations = useInventoryList('locations', {
    page: 1,
    pageSize: 100,
    sortBy: 'code',
    sortOrder: 'asc',
    status: 'ACTIVE',
  })
  const mutations = useQualityMutations()
  const notify = useToast()
  const [claimId, setClaimId] = useState('')
  const [claimItemId, setClaimItemId] = useState('')
  const [resolutionType, setResolutionType] = useState('REPLACEMENT')
  const [quantity, setQuantity] = useState('')
  const [amount, setAmount] = useState('')
  const [replacementLocationId, setReplacementLocationId] = useState('')
  const [claimStockLocationId, setClaimStockLocationId] = useState('')
  const [scrapLocationId, setScrapLocationId] = useState('')
  const [disposeQuantity, setDisposeQuantity] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [occurredAt, setOccurredAt] = useState(today())
  const [remark, setRemark] = useState('')
  const claims =
    claimsQuery.data?.data.filter((row) =>
      ['SUBMITTED', 'PARTIALLY_SETTLED'].includes(String(row.status)),
    ) ?? []
  const claim = claims.find((row) => row.id === claimId)
  const claimItems = (claim?.items as MasterRow[] | undefined) ?? []
  const locationRows = locations.data?.data

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!claimId) {
      notify('请选择供应商索赔单', 'error')
      return
    }
    try {
      await mutations.settlement.mutateAsync({
        id: claimId,
        payload: {
          resolutionType,
          supplierClaimItemId: claimItemId || undefined,
          quantity: quantity || undefined,
          amount: amount || undefined,
          replacementLocationId: replacementLocationId || undefined,
          claimStockLocationId: claimStockLocationId || undefined,
          scrapLocationId: scrapLocationId || undefined,
          disposeQuantity: disposeQuantity || undefined,
          batchNo: batchNo || undefined,
          occurredAt: new Date(occurredAt).toISOString(),
          remark: remark || undefined,
        },
      })
      notify('供应商索赔处理已过账', 'success')
      setClaimId('')
      onOpenChange(false)
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }

  return (
    <Shell
      description="换货直接入库且不生成采购应付；现金赔付形成应收，下次抵扣形成 Supplier Credit。"
      onOpenChange={onOpenChange}
      open={open}
      title="供应商索赔处理"
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="供应商索赔单">
            <Select onChange={(event) => setClaimId(event.target.value)} value={claimId}>
              <option value="">请选择</option>
              {claims.map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.claimNo)} · {row.name} · 待处理 ¥
                  {Number(row.claimedAmount) - Number(row.settledAmount)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="处理方式">
            <Select
              onChange={(event) => setResolutionType(event.target.value)}
              value={resolutionType}
            >
              <option value="REPLACEMENT">供应商换货</option>
              <option value="CASH_COMPENSATION">现金赔付</option>
              <option value="CREDIT_COMPENSATION">下次抵扣</option>
              <option value="SCRAP">索赔品报废</option>
              <option value="REJECTED">供应商拒赔</option>
              <option value="SELF_BEAR">自行承担</option>
            </Select>
          </Field>
          <Field label="索赔明细（换货/报废必选）">
            <Select onChange={(event) => setClaimItemId(event.target.value)} value={claimItemId}>
              <option value="">请选择</option>
              {claimItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {String(
                    (
                      item.qualityIssue as {
                        sku?: { code?: string; name?: string }
                      }
                    )?.sku?.code,
                  )}{' '}
                  · 数量 {String(item.quantity)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="换货/报废数量">
            <Input
              inputMode="decimal"
              onChange={(event) => setQuantity(event.target.value)}
              value={quantity}
            />
          </Field>
          <Field label="赔付/抵扣金额">
            <Input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
          </Field>
          <Field label="换货入库地点">
            <Select
              onChange={(event) => setReplacementLocationId(event.target.value)}
              value={replacementLocationId}
            >
              <option value="">请选择</option>
              <Options rows={locationRows} />
            </Select>
          </Field>
          <Field label="换货新批次号">
            <Input onChange={(event) => setBatchNo(event.target.value)} value={batchNo} />
          </Field>
          <Field label="原索赔品地点">
            <Select
              onChange={(event) => setClaimStockLocationId(event.target.value)}
              value={claimStockLocationId}
            >
              <option value="">请选择</option>
              <Options rows={locationRows?.filter((row) => row.type === 'CLAIM_AREA')} />
            </Select>
          </Field>
          <Field label="报废地点">
            <Select
              onChange={(event) => setScrapLocationId(event.target.value)}
              value={scrapLocationId}
            >
              <option value="">请选择</option>
              <Options rows={locationRows?.filter((row) => row.type === 'SCRAP_AREA')} />
            </Select>
          </Field>
          <Field label="换货同时处置原索赔品数量">
            <Input
              inputMode="decimal"
              onChange={(event) => setDisposeQuantity(event.target.value)}
              value={disposeQuantity}
            />
          </Field>
          <Field label="处理时间">
            <DatePickerInput onChange={setOccurredAt} value={occurredAt} />
          </Field>
          <Field label="备注">
            <Textarea onChange={(event) => setRemark(event.target.value)} rows={2} value={remark} />
          </Field>
        </div>
        <footer className="dialog-footer">
          <Dialog.Close className="button button-ghost">取消</Dialog.Close>
          <Button disabled={mutations.settlement.isPending} type="submit">
            {mutations.settlement.isPending ? '正在处理…' : '确认处理'}
          </Button>
        </footer>
      </form>
    </Shell>
  )
}

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QualityDialogs({
  active,
  onOpenChange,
}: {
  active?: QualityDialogKind
  onOpenChange: (kind?: QualityDialogKind) => void
}) {
  if (active === 'inspection')
    return (
      <InspectionDialog
        onOpenChange={(open) => onOpenChange(open ? 'inspection' : undefined)}
        open
      />
    )
  if (active === 'settlement')
    return (
      <SettlementDialog
        onOpenChange={(open) => onOpenChange(open ? 'settlement' : undefined)}
        open
      />
    )
  return null
}

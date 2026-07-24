import { createHash, randomUUID } from 'node:crypto'
import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common'
import {
  InventoryStockStatus,
  InventoryTransactionType,
  MasterDataStatus,
  Prisma,
} from '@prisma/client'
import { serializableTransaction } from '../../common/utils/serializable-transaction'
import { PrismaService } from '../../database/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { AuthUser } from '../auth/auth.types'

export interface PostingLineInput {
  locationId: string
  skuId: string
  stockStatus: InventoryStockStatus
  quantity: string | Prisma.Decimal
  unitCost?: string | Prisma.Decimal
  remark?: string
  allocateBatches?: boolean
  preferredBatchNo?: string
  costGroup?: string
}

export interface PostingBatchInput {
  batchNo: string
  skuId: string
  supplierId?: string
  purchaseReceiptItemId?: string
  quantity: string | Prisma.Decimal
  unitCost: string | Prisma.Decimal
}

export interface PostingResult {
  transactionId: string
  transactionNo: string
  sourceType: string
  sourceId: string
  postedAt: string
}

interface PostingInput {
  scope: string
  idempotencyKey: string
  type: InventoryTransactionType
  occurredAt: Date
  sourceType: string
  sourceId: string
  lines: PostingLineInput[]
  batches?: PostingBatchInput[]
  finalize?: (transaction: Prisma.TransactionClient, result: PostingResult) => Promise<void>
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function hashRequest(input: PostingInput): string {
  return createHash('sha256')
    .update(
      stable({
        type: input.type,
        occurredAt: input.occurredAt.toISOString(),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        lines: input.lines,
        batches: input.batches ?? [],
      }),
    )
    .digest('hex')
}

@Injectable()
export class InventoryPostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async post(input: PostingInput, actor: AuthUser, requestId?: string): Promise<PostingResult> {
    if (!input.idempotencyKey?.trim()) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: '过账必须提供 Idempotency-Key',
      })
    }
    const requestHash = hashRequest(input)
    const result = await serializableTransaction(this.prisma, async (transaction) => {
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_key: { scope: input.scope, key: input.idempotencyKey } },
      })
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: '相同幂等键已用于不同内容',
          })
        }
        return existing.responseJson as unknown as PostingResult
      }

      await this.assertReferences(transaction, input.lines)
      const transactionNo = `ITX-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`
      const header = await transaction.inventoryTransaction.create({
        data: {
          transactionNo,
          type: input.type,
          occurredAt: input.occurredAt,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          idempotencyKey: `${input.scope}:${input.idempotencyKey}`,
        },
      })
      const outboundCosts = new Map<string, Prisma.Decimal>()

      for (const inputLine of input.lines) {
        const quantity = new Prisma.Decimal(inputLine.quantity)
        if (quantity.isZero()) {
          throw new UnprocessableEntityException({
            code: 'QUANTITY_ZERO',
            message: '库存变化数量不能为 0',
          })
        }
        const key = `${inputLine.skuId}:${inputLine.costGroup ?? inputLine.stockStatus}`
        const current = await transaction.inventoryBalance.findUnique({
          where: {
            locationId_skuId_stockStatus: {
              locationId: inputLine.locationId,
              skuId: inputLine.skuId,
              stockStatus: inputLine.stockStatus,
            },
          },
        })
        const currentQuantity = current?.onHandQuantity ?? new Prisma.Decimal(0)
        const reservedQuantity = current?.reservedQuantity ?? new Prisma.Decimal(0)
        const currentCost = current?.averageCost ?? new Prisma.Decimal(0)
        const currentValue = current?.inventoryValue ?? new Prisma.Decimal(0)
        const nextQuantity = currentQuantity.plus(quantity)
        if (nextQuantity.minus(reservedQuantity).isNegative()) {
          throw new UnprocessableEntityException({
            code: 'INVENTORY_INSUFFICIENT',
            message: '可用库存不足，禁止出现负库存',
          })
        }

        const effectiveCost = quantity.isNegative()
          ? currentCost
          : inputLine.unitCost !== undefined
            ? new Prisma.Decimal(inputLine.unitCost)
            : (outboundCosts.get(key) ?? currentCost)
        if (effectiveCost.isNegative()) {
          throw new UnprocessableEntityException({
            code: 'COST_INVALID',
            message: '库存单位成本不能为负数',
          })
        }
        if (quantity.isNegative()) outboundCosts.set(key, effectiveCost)

        const nextValue = quantity.greaterThan(0)
          ? currentValue.plus(quantity.mul(effectiveCost))
          : nextQuantity.mul(currentCost)
        const nextCost = nextQuantity.isZero()
          ? new Prisma.Decimal(0)
          : quantity.greaterThan(0)
            ? nextValue.div(nextQuantity)
            : currentCost
        await transaction.inventoryBalance.upsert({
          where: {
            locationId_skuId_stockStatus: {
              locationId: inputLine.locationId,
              skuId: inputLine.skuId,
              stockStatus: inputLine.stockStatus,
            },
          },
          create: {
            locationId: inputLine.locationId,
            skuId: inputLine.skuId,
            stockStatus: inputLine.stockStatus,
            onHandQuantity: nextQuantity,
            averageCost: nextCost,
            inventoryValue: nextValue,
          },
          update: {
            onHandQuantity: nextQuantity,
            averageCost: nextCost,
            inventoryValue: nextValue,
            version: { increment: 1 },
          },
        })
        const line = await transaction.inventoryTransactionLine.create({
          data: {
            transactionId: header.id,
            locationId: inputLine.locationId,
            skuId: inputLine.skuId,
            stockStatus: inputLine.stockStatus,
            quantity,
            unitCost: effectiveCost,
            amount: quantity.mul(effectiveCost),
            remark: inputLine.remark,
          },
        })
        if (
          quantity.isNegative() &&
          inputLine.stockStatus === InventoryStockStatus.AVAILABLE &&
          inputLine.allocateBatches !== false
        ) {
          await this.allocateFifo(
            transaction,
            inputLine.skuId,
            quantity.abs(),
            line.id,
            inputLine.preferredBatchNo,
          )
        }
      }

      for (const batch of input.batches ?? []) {
        const quantity = new Prisma.Decimal(batch.quantity)
        await transaction.inventoryBatch.create({
          data: {
            batchNo: batch.batchNo,
            skuId: batch.skuId,
            supplierId: batch.supplierId,
            purchaseReceiptItemId: batch.purchaseReceiptItemId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            receivedQuantity: quantity,
            remainingQuantity: quantity,
            unitCost: new Prisma.Decimal(batch.unitCost),
            receivedAt: input.occurredAt,
          },
        })
      }

      const response: PostingResult = {
        transactionId: header.id,
        transactionNo: header.transactionNo,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        postedAt: header.postedAt.toISOString(),
      }
      await input.finalize?.(transaction, response)
      await transaction.idempotencyRecord.create({
        data: {
          scope: input.scope,
          key: input.idempotencyKey,
          requestHash,
          responseJson: { ...response },
          statusCode: 200,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      })
      return response
    })

    await this.audit.record({
      userId: actor.id,
      module: 'INVENTORY',
      action: 'POST',
      entityType: input.sourceType,
      entityId: input.sourceId,
      after: result,
      requestId,
    })
    return result
  }

  private async assertReferences(
    transaction: Prisma.TransactionClient,
    lines: PostingLineInput[],
  ): Promise<void> {
    const locationIds = [...new Set(lines.map((line) => line.locationId))]
    const skuIds = [...new Set(lines.map((line) => line.skuId))]
    const [locations, skus] = await Promise.all([
      transaction.inventoryLocation.findMany({ where: { id: { in: locationIds } } }),
      transaction.sku.findMany({ where: { id: { in: skuIds } } }),
    ])
    if (
      locations.length !== locationIds.length ||
      locations.some((location) => !location.isLeaf || location.status !== MasterDataStatus.ACTIVE)
    ) {
      throw new UnprocessableEntityException({
        code: 'LOCATION_INVALID',
        message: '库存只能记入启用的叶子库存地点',
      })
    }
    if (
      skus.length !== skuIds.length ||
      skus.some((sku) => sku.status !== MasterDataStatus.ACTIVE)
    ) {
      throw new UnprocessableEntityException({
        code: 'SKU_INVALID',
        message: 'SKU 不存在或已停用',
      })
    }
  }

  private async allocateFifo(
    transaction: Prisma.TransactionClient,
    skuId: string,
    required: Prisma.Decimal,
    transactionLineId: string,
    preferredBatchNo?: string,
  ): Promise<void> {
    let remaining = required
    const batches = await transaction.inventoryBatch.findMany({
      where: {
        skuId,
        remainingQuantity: { gt: 0 },
        ...(preferredBatchNo ? { batchNo: preferredBatchNo } : {}),
      },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    })
    for (const batch of batches) {
      if (remaining.isZero()) break
      const allocated = Prisma.Decimal.min(batch.remainingQuantity, remaining)
      await transaction.inventoryBatch.update({
        where: { id: batch.id },
        data: { remainingQuantity: { decrement: allocated } },
      })
      await transaction.inventoryBatchAllocation.create({
        data: { batchId: batch.id, transactionLineId, quantity: allocated },
      })
      remaining = remaining.minus(allocated)
    }
    if (remaining.greaterThan(0)) {
      throw new UnprocessableEntityException({
        code: 'BATCH_INSUFFICIENT',
        message: preferredBatchNo
          ? '指定采购批次数量不足，不能完成退货'
          : '可追溯批次数量不足，不能完成出库',
      })
    }
  }
}

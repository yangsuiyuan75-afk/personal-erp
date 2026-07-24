import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import {
  DocumentStatus,
  InventoryStockStatus,
  InventoryTransactionType,
  MasterDataStatus,
  PayableStatus,
  Prisma,
  PurchaseOrderStatus,
} from '@prisma/client'
import { paginationMeta } from '../../common/dto/list-query.dto'
import { PrismaService } from '../../database/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { AuthUser } from '../auth/auth.types'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import type {
  CreatePurchaseOrderDto,
  CreatePurchasePriceDto,
  CreatePurchaseReceiptDto,
  CreatePurchaseReturnDto,
  PurchaseQueryDto,
  UpdatePurchaseOrderDto,
  UpdatePurchasePriceDto,
} from './dto/purchase.dto'

const PRICE_SORT = ['createdAt', 'effectiveFrom', 'price', 'minQuantity'] as const
const ORDER_SORT = ['createdAt', 'orderDate', 'orderNo', 'totalAmount'] as const
const DOCUMENT_SORT = ['createdAt', 'occurredAt', 'totalAmount'] as const
const PAYABLE_SORT = ['createdAt', 'occurredAt', 'outstandingAmount', 'originalAmount'] as const

function businessNo(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`
}

function positive(value: string, label: string): Prisma.Decimal {
  let decimal: Prisma.Decimal
  try {
    decimal = new Prisma.Decimal(value)
  } catch {
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}格式无效`,
    })
  }
  if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0))
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}必须大于 0`,
    })
  return decimal
}

function nonNegative(value: string, label: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value)
  if (!decimal.isFinite() || decimal.isNegative())
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}不能为负数`,
    })
  return decimal
}

@Injectable()
export class PurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: InventoryPostingService,
    private readonly audit: AuditService,
  ) {}

  async listPrices(query: PurchaseQueryDto) {
    this.assertSort(query.sortBy, PRICE_SORT)
    const where: Prisma.PurchasePriceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.buyerId ? { buyerId: query.buyerId } : {}),
      ...(query.purchaseChannelId ? { purchaseChannelId: query.purchaseChannelId } : {}),
      ...(query.skuId ? { skuId: query.skuId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { sku: { code: { contains: query.keyword, mode: 'insensitive' } } },
              { sku: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchasePrice.findMany({
        where,
        include: {
          sku: { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, code: true, name: true } },
          buyer: { select: { id: true, code: true, name: true } },
          purchaseChannel: { select: { id: true, code: true, name: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.purchasePrice.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async createPrice(payload: CreatePurchasePriceDto, actor: AuthUser, requestId?: string) {
    await this.assertPurchaseReferences(payload)
    const price = nonNegative(payload.price, '报价')
    const minQuantity = positive(payload.minQuantity, '起订量')
    const effectiveFrom = new Date(payload.effectiveFrom)
    const effectiveTo = payload.effectiveTo ? new Date(payload.effectiveTo) : null
    if (effectiveTo && effectiveTo <= effectiveFrom)
      throw new UnprocessableEntityException({
        code: 'EFFECTIVE_RANGE_INVALID',
        message: '报价结束时间必须晚于开始时间',
      })
    await this.assertNoPriceOverlap({ ...payload, effectiveFrom, effectiveTo })
    const data = await this.prisma.purchasePrice.create({
      data: {
        skuId: payload.skuId,
        supplierId: payload.supplierId,
        buyerId: payload.buyerId,
        purchaseChannelId: payload.purchaseChannelId,
        currency: payload.currency.toUpperCase(),
        price,
        minQuantity,
        effectiveFrom,
        effectiveTo,
      },
      include: { sku: true, supplier: true, buyer: true, purchaseChannel: true },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'PURCHASE',
      action: 'CREATE_PRICE',
      entityType: 'PurchasePrice',
      entityId: data.id,
      after: data,
      requestId,
    })
    return data
  }

  async updatePrice(
    id: string,
    payload: UpdatePurchasePriceDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    const before = await this.prisma.purchasePrice.findUnique({ where: { id } })
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: '采购报价不存在' })
    const effectiveFrom = payload.effectiveFrom
      ? new Date(payload.effectiveFrom)
      : before.effectiveFrom
    const effectiveTo = payload.effectiveTo ? new Date(payload.effectiveTo) : before.effectiveTo
    if (effectiveTo && effectiveTo <= effectiveFrom)
      throw new UnprocessableEntityException({
        code: 'EFFECTIVE_RANGE_INVALID',
        message: '报价结束时间必须晚于开始时间',
      })
    await this.assertNoPriceOverlap(
      {
        skuId: before.skuId,
        supplierId: before.supplierId,
        buyerId: before.buyerId ?? undefined,
        purchaseChannelId: before.purchaseChannelId,
        effectiveFrom,
        effectiveTo,
      },
      id,
    )
    const data = await this.prisma.purchasePrice.update({
      where: { id },
      data: {
        ...(payload.price !== undefined ? { price: nonNegative(payload.price, '报价') } : {}),
        ...(payload.minQuantity !== undefined
          ? { minQuantity: positive(payload.minQuantity, '起订量') }
          : {}),
        effectiveFrom,
        effectiveTo,
        ...(payload.status ? { status: payload.status } : {}),
      },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'PURCHASE',
      action: 'UPDATE_PRICE',
      entityType: 'PurchasePrice',
      entityId: id,
      before,
      after: data,
      requestId,
    })
    return data
  }

  async createOrder(payload: CreatePurchaseOrderDto, actor: AuthUser, requestId?: string) {
    await this.assertPurchaseReferences(payload)
    const items = await this.prepareOrderItems(payload.items)
    const totalAmount = items.reduce(
      (sum, item) => sum.plus(item.lineAmount),
      new Prisma.Decimal(0),
    )
    const data = await this.prisma.purchaseOrder.create({
      data: {
        orderNo: businessNo('PO'),
        supplierId: payload.supplierId,
        buyerId: payload.buyerId,
        purchaseChannelId: payload.purchaseChannelId,
        currency: payload.currency.toUpperCase(),
        orderDate: new Date(payload.orderDate),
        expectedAt: payload.expectedAt ? new Date(payload.expectedAt) : undefined,
        remark: payload.remark,
        totalAmount,
        items: {
          create: items.map((item) => ({
            skuId: item.skuId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineAmount: item.lineAmount,
            remark: item.remark,
          })),
        },
      },
      include: {
        items: { include: { sku: true } },
        supplier: true,
        buyer: true,
        purchaseChannel: true,
      },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'PURCHASE',
      action: 'CREATE_ORDER',
      entityType: 'PurchaseOrder',
      entityId: data.id,
      after: data,
      requestId,
    })
    return data
  }

  async updateOrder(
    id: string,
    payload: UpdatePurchaseOrderDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    const before = await this.order(id)
    if (
      before.status !== PurchaseOrderStatus.DRAFT &&
      before.status !== PurchaseOrderStatus.CONFIRMED
    )
      throw new ConflictException({
        code: 'ORDER_STATE_INVALID',
        message: '只有未收货的草稿或已确认采购订单可以修改',
      })
    if (await this.prisma.purchaseReceipt.count({ where: { purchaseOrderId: id } }))
      throw new ConflictException({
        code: 'ORDER_RECEIPT_EXISTS',
        message: '已有收货单的采购订单不能修改',
      })
    await this.assertPurchaseReferences(payload)
    const items = await this.prepareOrderItems(payload.items)
    const totalAmount = items.reduce(
      (sum, item) => sum.plus(item.lineAmount),
      new Prisma.Decimal(0),
    )
    const data = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: payload.supplierId,
        buyerId: payload.buyerId,
        purchaseChannelId: payload.purchaseChannelId,
        currency: payload.currency.toUpperCase(),
        orderDate: new Date(payload.orderDate),
        expectedAt: payload.expectedAt ? new Date(payload.expectedAt) : null,
        remark: payload.remark,
        totalAmount,
        items: {
          deleteMany: {},
          create: items.map((item) => ({
            skuId: item.skuId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineAmount: item.lineAmount,
            remark: item.remark,
          })),
        },
      },
      include: {
        items: { include: { sku: true } },
        supplier: true,
        buyer: true,
        purchaseChannel: true,
      },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'PURCHASE',
      action: 'UPDATE_ORDER',
      entityType: 'PurchaseOrder',
      entityId: id,
      before,
      after: data,
      requestId,
    })
    return data
  }

  async confirmOrder(id: string, actor: AuthUser, requestId?: string) {
    const before = await this.order(id)
    if (before.status !== PurchaseOrderStatus.DRAFT)
      throw new ConflictException({
        code: 'ORDER_STATE_INVALID',
        message: '只有草稿采购订单可以确认',
      })
    const after = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CONFIRMED, confirmedAt: new Date() },
      include: { items: true },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'PURCHASE',
      action: 'CONFIRM_ORDER',
      entityType: 'PurchaseOrder',
      entityId: id,
      before,
      after,
      requestId,
    })
    return after
  }

  async cancelOrder(id: string, actor: AuthUser, requestId?: string) {
    const before = await this.order(id)
    if (
      before.status !== PurchaseOrderStatus.DRAFT &&
      before.status !== PurchaseOrderStatus.CONFIRMED
    )
      throw new ConflictException({
        code: 'ORDER_STATE_INVALID',
        message: '已收货采购订单不能取消',
      })
    const received = before.items.some((item) => item.receivedQuantity.greaterThan(0))
    if (received)
      throw new ConflictException({
        code: 'ORDER_RECEIVED',
        message: '已有收货的采购订单不能取消',
      })
    const after = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'PURCHASE',
      action: 'CANCEL_ORDER',
      entityType: 'PurchaseOrder',
      entityId: id,
      before,
      after,
      requestId,
    })
    return after
  }

  async listOrders(query: PurchaseQueryDto) {
    this.assertSort(query.sortBy, ORDER_SORT)
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(query.documentStatus ? { status: query.documentStatus as PurchaseOrderStatus } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.buyerId ? { buyerId: query.buyerId } : {}),
      ...(query.purchaseChannelId ? { purchaseChannelId: query.purchaseChannelId } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            orderDate: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.keyword
        ? {
            OR: [
              { orderNo: { contains: query.keyword, mode: 'insensitive' } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          buyer: { select: { id: true, code: true, name: true } },
          purchaseChannel: { select: { id: true, code: true, name: true } },
          items: { include: { sku: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async createReceipt(payload: CreatePurchaseReceiptDto, actor: AuthUser, requestId?: string) {
    const order = await this.order(payload.purchaseOrderId)
    if (
      order.status !== PurchaseOrderStatus.CONFIRMED &&
      order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    )
      throw new ConflictException({
        code: 'ORDER_STATE_INVALID',
        message: '采购订单未确认或已全部收货',
      })
    await this.assertLeafLocation(payload.locationId)
    const orderItemMap = new Map(order.items.map((item) => [item.id, item]))
    const itemIds = payload.items.map((item) => item.purchaseOrderItemId)
    if (new Set(itemIds).size !== itemIds.length)
      throw new UnprocessableEntityException({
        code: 'DUPLICATE_ITEM',
        message: '收货明细不能重复',
      })
    const batchNos = payload.items.map((item) => item.batchNo.trim())
    if (new Set(batchNos).size !== batchNos.length)
      throw new UnprocessableEntityException({
        code: 'DUPLICATE_BATCH',
        message: '收货批次号不能重复',
      })
    const existingBatch = await this.prisma.inventoryBatch.count({
      where: { batchNo: { in: batchNos } },
    })
    if (existingBatch)
      throw new ConflictException({ code: 'BATCH_EXISTS', message: '收货批次号已存在' })
    const items = payload.items.map((item) => {
      const source = orderItemMap.get(item.purchaseOrderItemId)
      if (!source)
        throw new UnprocessableEntityException({
          code: 'ORDER_ITEM_INVALID',
          message: '收货明细不属于所选采购订单',
        })
      const quantity = positive(item.quantity, '收货数量')
      if (quantity.greaterThan(source.quantity.minus(source.receivedQuantity)))
        throw new UnprocessableEntityException({
          code: 'RECEIPT_QUANTITY_EXCEEDED',
          message: '收货数量超过采购订单未收数量',
        })
      return {
        ...item,
        source,
        quantity,
        lineAmount: quantity.mul(source.unitPrice),
      }
    })
    const totalAmount = items.reduce(
      (sum, item) => sum.plus(item.lineAmount),
      new Prisma.Decimal(0),
    )
    const data = await this.prisma.purchaseReceipt.create({
      data: {
        receiptNo: businessNo('PR'),
        purchaseOrderId: order.id,
        locationId: payload.locationId,
        occurredAt: new Date(payload.occurredAt),
        remark: payload.remark,
        totalAmount,
        items: {
          create: items.map((item) => ({
            purchaseOrderItemId: item.source.id,
            skuId: item.source.skuId,
            quantity: item.quantity,
            unitPrice: item.source.unitPrice,
            lineAmount: item.lineAmount,
            batchNo: item.batchNo.trim(),
            remark: item.remark,
          })),
        },
      },
      include: { items: { include: { sku: true } }, purchaseOrder: true, location: true },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'PURCHASE',
      action: 'CREATE_RECEIPT',
      entityType: 'PurchaseReceipt',
      entityId: data.id,
      after: data,
      requestId,
    })
    return data
  }

  async postReceipt(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    const receipt = await this.prisma.purchaseReceipt.findUnique({
      where: { id },
      include: { items: true, purchaseOrder: true },
    })
    if (!receipt) throw new NotFoundException({ code: 'NOT_FOUND', message: '采购收货单不存在' })
    return this.posting.post(
      {
        scope: `PURCHASE_RECEIPT:${id}`,
        idempotencyKey,
        type: InventoryTransactionType.PURCHASE_RECEIPT,
        occurredAt: receipt.occurredAt,
        sourceType: 'PurchaseReceipt',
        sourceId: id,
        lines: receipt.items.map((item) => ({
          locationId: receipt.locationId,
          skuId: item.skuId,
          stockStatus: InventoryStockStatus.AVAILABLE,
          quantity: item.quantity,
          unitCost: item.unitPrice,
          remark: item.remark ?? undefined,
          allocateBatches: false,
        })),
        batches: receipt.items.map((item) => ({
          batchNo: item.batchNo,
          skuId: item.skuId,
          supplierId: receipt.purchaseOrder.supplierId,
          purchaseReceiptItemId: item.id,
          quantity: item.quantity,
          unitCost: item.unitPrice,
        })),
        finalize: async (transaction, result) => {
          const locked = await transaction.purchaseReceipt.findUnique({ where: { id } })
          if (!locked || locked.status !== DocumentStatus.DRAFT)
            throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '采购收货单已过账' })
          for (const item of receipt.items) {
            const orderItem = await transaction.purchaseOrderItem.findUniqueOrThrow({
              where: { id: item.purchaseOrderItemId },
            })
            if (orderItem.receivedQuantity.plus(item.quantity).greaterThan(orderItem.quantity))
              throw new ConflictException({
                code: 'RECEIPT_QUANTITY_EXCEEDED',
                message: '并发收货导致数量超过采购订单',
              })
            await transaction.purchaseOrderItem.update({
              where: { id: orderItem.id },
              data: { receivedQuantity: { increment: item.quantity } },
            })
          }
          const orderItems = await transaction.purchaseOrderItem.findMany({
            where: { purchaseOrderId: receipt.purchaseOrderId },
          })
          const fullyReceived = orderItems.every((item) =>
            item.receivedQuantity.equals(item.quantity),
          )
          await transaction.purchaseOrder.update({
            where: { id: receipt.purchaseOrderId },
            data: {
              status: fullyReceived
                ? PurchaseOrderStatus.RECEIVED
                : PurchaseOrderStatus.PARTIALLY_RECEIVED,
            },
          })
          const payable = await transaction.payable.create({
            data: {
              payableNo: businessNo('PAY'),
              supplierId: receipt.purchaseOrder.supplierId,
              purchaseChannelId: receipt.purchaseOrder.purchaseChannelId,
              buyerId: receipt.purchaseOrder.buyerId,
              sourceType: 'PurchaseReceipt',
              sourceId: id,
              currency: receipt.purchaseOrder.currency,
              originalAmount: receipt.totalAmount,
              outstandingAmount: receipt.totalAmount,
              occurredAt: receipt.occurredAt,
            },
          })
          await transaction.purchaseReceipt.update({
            where: { id },
            data: {
              status: DocumentStatus.POSTED,
              transactionId: result.transactionId,
              payableId: payable.id,
              postedAt: new Date(result.postedAt),
            },
          })
        },
      },
      actor,
      requestId,
    )
  }

  async createReturn(payload: CreatePurchaseReturnDto, actor: AuthUser, requestId?: string) {
    const receipt = await this.prisma.purchaseReceipt.findUnique({
      where: { id: payload.purchaseReceiptId },
      include: { items: true, purchaseOrder: true },
    })
    if (!receipt || receipt.status !== DocumentStatus.POSTED)
      throw new ConflictException({
        code: 'RECEIPT_STATE_INVALID',
        message: '只能对已过账采购收货创建退货',
      })
    await this.assertLeafLocation(payload.locationId)
    const receiptItems = new Map(receipt.items.map((item) => [item.id, item]))
    const ids = payload.items.map((item) => item.purchaseReceiptItemId)
    if (new Set(ids).size !== ids.length)
      throw new UnprocessableEntityException({
        code: 'DUPLICATE_ITEM',
        message: '退货明细不能重复',
      })
    const items = payload.items.map((item) => {
      const source = receiptItems.get(item.purchaseReceiptItemId)
      if (!source)
        throw new UnprocessableEntityException({
          code: 'RECEIPT_ITEM_INVALID',
          message: '退货明细不属于所选收货单',
        })
      const quantity = positive(item.quantity, '退货数量')
      if (quantity.greaterThan(source.quantity.minus(source.returnedQuantity)))
        throw new UnprocessableEntityException({
          code: 'RETURN_QUANTITY_EXCEEDED',
          message: '退货数量超过可退数量',
        })
      return { ...item, source, quantity, amount: quantity.mul(source.unitPrice) }
    })
    const totalAmount = items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
    const data = await this.prisma.purchaseReturn.create({
      data: {
        returnNo: businessNo('PRET'),
        purchaseReceiptId: receipt.id,
        supplierId: receipt.purchaseOrder.supplierId,
        locationId: payload.locationId,
        occurredAt: new Date(payload.occurredAt),
        reason: payload.reason,
        totalAmount,
        items: {
          create: items.map((item) => ({
            purchaseReceiptItemId: item.source.id,
            skuId: item.source.skuId,
            quantity: item.quantity,
            unitCost: item.source.unitPrice,
            amount: item.amount,
            remark: item.remark,
          })),
        },
      },
      include: { items: { include: { sku: true, purchaseReceiptItem: true } }, supplier: true },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'PURCHASE',
      action: 'CREATE_RETURN',
      entityType: 'PurchaseReturn',
      entityId: data.id,
      after: data,
      requestId,
    })
    return data
  }

  async postReturn(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    const purchaseReturn = await this.prisma.purchaseReturn.findUnique({
      where: { id },
      include: {
        items: { include: { purchaseReceiptItem: true } },
        purchaseReceipt: { include: { purchaseOrder: true, payable: true } },
      },
    })
    if (!purchaseReturn)
      throw new NotFoundException({ code: 'NOT_FOUND', message: '采购退货单不存在' })
    return this.posting.post(
      {
        scope: `PURCHASE_RETURN:${id}`,
        idempotencyKey,
        type: InventoryTransactionType.PURCHASE_RETURN,
        occurredAt: purchaseReturn.occurredAt,
        sourceType: 'PurchaseReturn',
        sourceId: id,
        lines: purchaseReturn.items.map((item) => ({
          locationId: purchaseReturn.locationId,
          skuId: item.skuId,
          stockStatus: InventoryStockStatus.AVAILABLE,
          quantity: item.quantity.negated(),
          remark: item.remark ?? undefined,
          preferredBatchNo: item.purchaseReceiptItem.batchNo,
        })),
        finalize: async (transaction, result) => {
          const locked = await transaction.purchaseReturn.findUnique({ where: { id } })
          if (!locked || locked.status !== DocumentStatus.DRAFT)
            throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '采购退货单已过账' })
          for (const item of purchaseReturn.items) {
            const receiptItem = await transaction.purchaseReceiptItem.findUniqueOrThrow({
              where: { id: item.purchaseReceiptItemId },
            })
            if (receiptItem.returnedQuantity.plus(item.quantity).greaterThan(receiptItem.quantity))
              throw new ConflictException({
                code: 'RETURN_QUANTITY_EXCEEDED',
                message: '并发退货导致数量超过可退数量',
              })
            await transaction.purchaseReceiptItem.update({
              where: { id: receiptItem.id },
              data: { returnedQuantity: { increment: item.quantity } },
            })
            await transaction.purchaseOrderItem.update({
              where: { id: receiptItem.purchaseOrderItemId },
              data: { returnedQuantity: { increment: item.quantity } },
            })
          }
          const payable = purchaseReturn.purchaseReceipt.payable
          if (!payable)
            throw new ConflictException({ code: 'PAYABLE_MISSING', message: '采购收货应付不存在' })
          const adjustment = Prisma.Decimal.min(
            payable.outstandingAmount,
            purchaseReturn.totalAmount,
          )
          const credit = purchaseReturn.totalAmount.minus(adjustment)
          if (adjustment.greaterThan(0)) {
            const outstandingAmount = payable.outstandingAmount.minus(adjustment)
            await transaction.payable.update({
              where: { id: payable.id },
              data: {
                adjustedAmount: { increment: adjustment },
                outstandingAmount,
                status: outstandingAmount.isZero() ? PayableStatus.SETTLED : payable.status,
              },
            })
            await transaction.payableAdjustment.create({
              data: {
                payableId: payable.id,
                sourceType: 'PurchaseReturn',
                sourceId: id,
                amount: adjustment,
                reason: purchaseReturn.reason,
              },
            })
          }
          if (credit.greaterThan(0)) {
            await transaction.supplierCredit.create({
              data: {
                creditNo: businessNo('SC'),
                supplierId: purchaseReturn.supplierId,
                purchaseReturnId: id,
                currency: purchaseReturn.purchaseReceipt.purchaseOrder.currency,
                amount: credit,
              },
            })
          }
          await transaction.purchaseReturn.update({
            where: { id },
            data: {
              status: DocumentStatus.POSTED,
              transactionId: result.transactionId,
              postedAt: new Date(result.postedAt),
            },
          })
        },
      },
      actor,
      requestId,
    )
  }

  async listReceipts(query: PurchaseQueryDto) {
    return this.listDocuments('receipts', query)
  }

  async listReturns(query: PurchaseQueryDto) {
    return this.listDocuments('returns', query)
  }

  async listPayables(query: PurchaseQueryDto) {
    this.assertSort(query.sortBy, PAYABLE_SORT)
    const where: Prisma.PayableWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.buyerId ? { buyerId: query.buyerId } : {}),
      ...(query.purchaseChannelId ? { purchaseChannelId: query.purchaseChannelId } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as PayableStatus } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            occurredAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.keyword
        ? {
            OR: [
              { payableNo: { contains: query.keyword, mode: 'insensitive' } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payable.findMany({
        where,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          buyer: { select: { id: true, code: true, name: true } },
          purchaseChannel: { select: { id: true, code: true, name: true } },
          adjustments: true,
          purchaseReceipt: {
            include: { items: { include: { sku: { select: { code: true, name: true } } } } },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payable.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async listSupplierCredits(query: PurchaseQueryDto) {
    this.assertSort(query.sortBy, ['createdAt', 'amount', 'appliedAmount'] as const)
    const where: Prisma.SupplierCreditWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { creditNo: { contains: query.keyword, mode: 'insensitive' } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierCredit.findMany({
        where,
        include: {
          supplier: true,
          purchaseReturn: {
            include: { items: { include: { sku: { select: { code: true, name: true } } } } },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierCredit.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  private async listDocuments(kind: 'receipts' | 'returns', query: PurchaseQueryDto) {
    this.assertSort(query.sortBy, DOCUMENT_SORT)
    const where = {
      ...(query.documentStatus ? { status: query.documentStatus as DocumentStatus } : {}),
      ...(query.supplierId && kind === 'returns' ? { supplierId: query.supplierId } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            occurredAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.keyword
        ? kind === 'receipts'
          ? { receiptNo: { contains: query.keyword, mode: 'insensitive' as const } }
          : { returnNo: { contains: query.keyword, mode: 'insensitive' as const } }
        : {}),
    }
    const delegate = {
      receipts: this.prisma.purchaseReceipt,
      returns: this.prisma.purchaseReturn,
    }[kind] as unknown as {
      findMany(args: unknown): Promise<unknown[]>
      count(args: unknown): Promise<number>
    }
    const include =
      kind === 'receipts'
        ? {
            purchaseOrder: { include: { supplier: true, buyer: true, purchaseChannel: true } },
            location: true,
            items: { include: { sku: true } },
            payable: true,
          }
        : {
            supplier: true,
            location: true,
            items: { include: { sku: true } },
            supplierCredit: true,
          }
    const [data, total] = (await this.prisma.$transaction([
      delegate.findMany({
        where,
        include,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }) as never,
      delegate.count({ where }) as never,
    ])) as [unknown[], number]
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  private async order(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND', message: '采购订单不存在' })
    return order
  }

  private async assertPurchaseReferences(payload: {
    supplierId: string
    buyerId?: string
    purchaseChannelId: string
    skuId?: string
  }) {
    const [supplier, channel, buyer, sku] = await Promise.all([
      this.prisma.supplier.findUnique({ where: { id: payload.supplierId } }),
      this.prisma.purchaseChannel.findUnique({ where: { id: payload.purchaseChannelId } }),
      payload.buyerId ? this.prisma.buyer.findUnique({ where: { id: payload.buyerId } }) : null,
      payload.skuId ? this.prisma.sku.findUnique({ where: { id: payload.skuId } }) : null,
    ])
    if (!supplier || supplier.status !== MasterDataStatus.ACTIVE)
      throw new UnprocessableEntityException({ code: 'SUPPLIER_INVALID', message: '供应商无效' })
    if (!channel || channel.status !== MasterDataStatus.ACTIVE)
      throw new UnprocessableEntityException({ code: 'CHANNEL_INVALID', message: '采购渠道无效' })
    if (payload.buyerId && (!buyer || buyer.status !== MasterDataStatus.ACTIVE))
      throw new UnprocessableEntityException({ code: 'BUYER_INVALID', message: '采购员无效' })
    if (payload.skuId && (!sku || sku.status !== MasterDataStatus.ACTIVE))
      throw new UnprocessableEntityException({ code: 'SKU_INVALID', message: 'SKU 无效' })
  }

  private async prepareOrderItems(items: CreatePurchaseOrderDto['items']) {
    const skuIds = items.map((item) => item.skuId)
    if (new Set(skuIds).size !== skuIds.length)
      throw new UnprocessableEntityException({
        code: 'DUPLICATE_SKU',
        message: '同一采购订单内 SKU 不能重复',
      })
    const skus = await this.prisma.sku.findMany({ where: { id: { in: skuIds } } })
    if (skus.length !== skuIds.length || skus.some((sku) => sku.status !== MasterDataStatus.ACTIVE))
      throw new UnprocessableEntityException({
        code: 'SKU_INVALID',
        message: 'SKU 不存在或已停用',
      })
    return items.map((item) => {
      const quantity = positive(item.quantity, '采购数量')
      const unitPrice = nonNegative(item.unitPrice, '采购单价')
      return { ...item, quantity, unitPrice, lineAmount: quantity.mul(unitPrice) }
    })
  }

  private async assertLeafLocation(id: string) {
    const location = await this.prisma.inventoryLocation.findUnique({ where: { id } })
    if (!location || !location.isLeaf || location.status !== MasterDataStatus.ACTIVE)
      throw new UnprocessableEntityException({
        code: 'LOCATION_INVALID',
        message: '库存地点必须是启用的叶子地点',
      })
  }

  private async assertNoPriceOverlap(
    payload: {
      skuId: string
      supplierId: string
      buyerId?: string
      purchaseChannelId: string
      effectiveFrom: Date
      effectiveTo: Date | null
    },
    excludeId?: string,
  ) {
    const overlap = await this.prisma.purchasePrice.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        skuId: payload.skuId,
        supplierId: payload.supplierId,
        buyerId: payload.buyerId ?? null,
        purchaseChannelId: payload.purchaseChannelId,
        status: MasterDataStatus.ACTIVE,
        effectiveFrom: payload.effectiveTo ? { lt: payload.effectiveTo } : undefined,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: payload.effectiveFrom } }],
      },
    })
    if (overlap)
      throw new ConflictException({
        code: 'PRICE_PERIOD_OVERLAP',
        message: '相同维度的有效采购报价时间不能重叠',
      })
  }

  private assertSort(sortBy: string, whitelist: readonly string[]) {
    if (!whitelist.includes(sortBy))
      throw new BadRequestException({ code: 'SORT_INVALID', message: '排序字段不在白名单中' })
  }
}

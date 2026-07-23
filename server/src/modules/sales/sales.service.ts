import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ChannelInventoryMode,
  DocumentStatus,
  InventoryLocationType,
  InventoryStockStatus,
  InventoryTransactionType,
  MasterDataStatus,
  Prisma,
  ReceivableStatus,
  SalesOrderStatus,
} from '@prisma/client';
import { paginationMeta } from '../../common/dto/list-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import type {
  CreateSalesIssueDto,
  CreateSalesOrderDto,
  CreateSalesPriceDto,
  CreateSalesReturnDto,
  ResolveSalesPriceDto,
  SalesQueryDto,
  UpdateSalesIssueDto,
  UpdateSalesPriceDto,
} from './dto/sales.dto';

const PRICE_SORT = ['createdAt', 'effectiveFrom', 'price', 'minQuantity'] as const;
const ORDER_SORT = ['createdAt', 'orderDate', 'orderNo', 'totalAmount'] as const;
const DOCUMENT_SORT = ['createdAt', 'occurredAt', 'totalRevenue', 'totalRefund'] as const;
const RECEIVABLE_SORT = ['createdAt', 'occurredAt', 'outstandingAmount', 'originalAmount'] as const;

function businessNo(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function positive(value: string, label: string): Prisma.Decimal {
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(value);
  } catch {
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}格式无效`,
    });
  }
  if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0))
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}必须大于 0`,
    });
  return decimal;
}

function nonNegative(value: string, label: string): Prisma.Decimal {
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(value);
  } catch {
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}格式无效`,
    });
  }
  if (!decimal.isFinite() || decimal.isNegative())
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}不能为负数`,
    });
  return decimal;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: InventoryPostingService,
    private readonly audit: AuditService,
  ) {}

  async listPrices(query: SalesQueryDto) {
    this.assertSort(query.sortBy, PRICE_SORT);
    const where: Prisma.SalesPriceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.skuId ? { skuId: query.skuId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { sku: { code: { contains: query.keyword, mode: 'insensitive' } } },
              { sku: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { salesChannel: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.salesPrice.findMany({
        where,
        include: {
          sku: { select: { id: true, code: true, name: true } },
          salesChannel: { select: { id: true, code: true, name: true } },
          customer: { select: { id: true, code: true, name: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesPrice.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async resolvePrice(query: ResolveSalesPriceDto) {
    await this.assertSalesReferences(query);
    const quantity = positive(query.quantity, '销售数量');
    const price = await this.findPrice({
      skuId: query.skuId,
      salesChannelId: query.salesChannelId,
      customerId: query.customerId,
      quantity,
      at: query.at ? new Date(query.at) : new Date(),
    });
    if (!price)
      throw new NotFoundException({
        code: 'SALES_PRICE_NOT_FOUND',
        message: '未找到有效售价，请手工输入成交价',
      });
    return price;
  }

  async createPrice(payload: CreateSalesPriceDto, actor: AuthUser, requestId?: string) {
    await this.assertSalesReferences(payload);
    const price = nonNegative(payload.price, '售价');
    const minQuantity = positive(payload.minQuantity, '起售量');
    const effectiveFrom = new Date(payload.effectiveFrom);
    const effectiveTo = payload.effectiveTo ? new Date(payload.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom)
      throw new UnprocessableEntityException({
        code: 'EFFECTIVE_RANGE_INVALID',
        message: '售价结束时间必须晚于开始时间',
      });
    await this.assertNoPriceOverlap({ ...payload, effectiveFrom, effectiveTo });
    const data = await this.prisma.salesPrice.create({
      data: {
        skuId: payload.skuId,
        salesChannelId: payload.salesChannelId,
        customerId: payload.customerId,
        currency: payload.currency.toUpperCase(),
        price,
        minQuantity,
        effectiveFrom,
        effectiveTo,
      },
      include: { sku: true, salesChannel: true, customer: true },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'SALES',
      action: 'CREATE_PRICE',
      entityType: 'SalesPrice',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async updatePrice(id: string, payload: UpdateSalesPriceDto, actor: AuthUser, requestId?: string) {
    const before = await this.prisma.salesPrice.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: '销售价格不存在' });
    const effectiveFrom = payload.effectiveFrom
      ? new Date(payload.effectiveFrom)
      : before.effectiveFrom;
    const effectiveTo = payload.effectiveTo ? new Date(payload.effectiveTo) : before.effectiveTo;
    if (effectiveTo && effectiveTo <= effectiveFrom)
      throw new UnprocessableEntityException({
        code: 'EFFECTIVE_RANGE_INVALID',
        message: '售价结束时间必须晚于开始时间',
      });
    await this.assertNoPriceOverlap(
      {
        skuId: before.skuId,
        salesChannelId: before.salesChannelId ?? undefined,
        customerId: before.customerId ?? undefined,
        effectiveFrom,
        effectiveTo,
      },
      id,
    );
    const data = await this.prisma.salesPrice.update({
      where: { id },
      data: {
        ...(payload.price !== undefined ? { price: nonNegative(payload.price, '售价') } : {}),
        ...(payload.minQuantity !== undefined
          ? { minQuantity: positive(payload.minQuantity, '起售量') }
          : {}),
        effectiveFrom,
        effectiveTo,
        ...(payload.status ? { status: payload.status } : {}),
      },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'SALES',
      action: 'UPDATE_PRICE',
      entityType: 'SalesPrice',
      entityId: id,
      before,
      after: data,
      requestId,
    });
    return data;
  }

  async createOrder(payload: CreateSalesOrderDto, actor: AuthUser, requestId?: string) {
    await this.assertSalesReferences(payload);
    const skuIds = payload.items.map((item) => item.skuId);
    if (new Set(skuIds).size !== skuIds.length)
      throw new UnprocessableEntityException({
        code: 'DUPLICATE_SKU',
        message: '同一销售订单内 SKU 不能重复',
      });
    const skus = await this.prisma.sku.findMany({ where: { id: { in: skuIds } } });
    if (skus.length !== skuIds.length || skus.some((sku) => sku.status !== MasterDataStatus.ACTIVE))
      throw new UnprocessableEntityException({
        code: 'SKU_INVALID',
        message: 'SKU 不存在或已停用',
      });
    const at = new Date(payload.orderDate);
    const items: Array<{
      skuId: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      lineAmount: Prisma.Decimal;
      remark?: string;
    }> = [];
    for (const item of payload.items) {
      const quantity = positive(item.quantity, '销售数量');
      let unitPrice: Prisma.Decimal;
      if (item.unitPrice !== undefined) {
        unitPrice = nonNegative(item.unitPrice, '销售单价');
      } else {
        const resolved = await this.findPrice({
          skuId: item.skuId,
          salesChannelId: payload.salesChannelId,
          customerId: payload.customerId,
          quantity,
          at,
        });
        if (!resolved)
          throw new UnprocessableEntityException({
            code: 'SALES_PRICE_REQUIRED',
            message: `SKU ${item.skuId} 无有效售价，请手工输入成交价`,
          });
        unitPrice = resolved.price;
      }
      items.push({
        skuId: item.skuId,
        quantity,
        unitPrice,
        lineAmount: quantity.mul(unitPrice),
        remark: item.remark,
      });
    }
    const totalAmount = items.reduce(
      (sum, item) => sum.plus(item.lineAmount),
      new Prisma.Decimal(0),
    );
    const channel = await this.prisma.salesChannel.findUniqueOrThrow({
      where: { id: payload.salesChannelId },
      select: { defaultLocationId: true },
    });
    const data = await this.prisma.$transaction(async (transaction) => {
      const order = await transaction.salesOrder.create({
        data: {
          orderNo: businessNo('SO'),
          salesChannelId: payload.salesChannelId,
          customerId: payload.customerId,
          currency: payload.currency.toUpperCase(),
          orderDate: at,
          remark: payload.remark,
          totalAmount,
          items: { create: items },
        },
        include: { items: true },
      });
      for (const item of order.items) {
        await transaction.salesIssue.create({
          data: {
            issueNo: businessNo('SI'),
            salesOrderId: order.id,
            salesChannelId: order.salesChannelId,
            customerId: order.customerId,
            locationId: channel.defaultLocationId,
            occurredAt: order.orderDate,
            totalRevenue: item.lineAmount,
            items: {
              create: {
                salesOrderItemId: item.id,
                skuId: item.skuId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                revenueAmount: item.lineAmount,
                remark: item.remark,
              },
            },
          },
        });
      }
      return transaction.salesOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          salesChannel: true,
          customer: true,
          items: { include: { sku: true } },
          issues: { include: { items: { include: { sku: true } } } },
        },
      });
    });
    await this.audit.record({
      userId: actor.id,
      module: 'SALES',
      action: 'CREATE_ORDER',
      entityType: 'SalesOrder',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async confirmOrder(id: string, actor: AuthUser, requestId?: string) {
    const before = await this.order(id);
    if (before.status !== SalesOrderStatus.DRAFT)
      throw new ConflictException({
        code: 'ORDER_STATE_INVALID',
        message: '只有草稿销售订单可以确认',
      });
    const after = await this.prisma.salesOrder.update({
      where: { id },
      data: { status: SalesOrderStatus.CONFIRMED, confirmedAt: new Date() },
      include: { items: true },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'SALES',
      action: 'CONFIRM_ORDER',
      entityType: 'SalesOrder',
      entityId: id,
      before,
      after,
      requestId,
    });
    return after;
  }

  async cancelOrder(id: string, actor: AuthUser, requestId?: string) {
    const before = await this.order(id);
    if (before.status !== SalesOrderStatus.DRAFT && before.status !== SalesOrderStatus.CONFIRMED)
      throw new ConflictException({
        code: 'ORDER_STATE_INVALID',
        message: '已有出库的销售订单不能取消',
      });
    if (before.items.some((item) => item.issuedQuantity.greaterThan(0)))
      throw new ConflictException({ code: 'ORDER_ISSUED', message: '已有出库的销售订单不能取消' });
    const after = await this.prisma.$transaction(async (transaction) => {
      await transaction.salesIssue.updateMany({
        where: { salesOrderId: id, status: DocumentStatus.DRAFT },
        data: { status: DocumentStatus.CANCELLED },
      });
      return transaction.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.CANCELLED },
      });
    });
    await this.audit.record({
      userId: actor.id,
      module: 'SALES',
      action: 'CANCEL_ORDER',
      entityType: 'SalesOrder',
      entityId: id,
      before,
      after,
      requestId,
    });
    return after;
  }

  async listOrders(query: SalesQueryDto) {
    this.assertSort(query.sortBy, ORDER_SORT);
    const where: Prisma.SalesOrderWhereInput = {
      ...(query.documentStatus ? { status: query.documentStatus as SalesOrderStatus } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
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
              { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { salesChannel: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: {
          salesChannel: { select: { id: true, code: true, name: true, inventoryMode: true } },
          customer: { select: { id: true, code: true, name: true } },
          items: { include: { sku: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async createIssue(payload: CreateSalesIssueDto, actor: AuthUser, requestId?: string) {
    const order = await this.order(payload.salesOrderId);
    if (
      order.status !== SalesOrderStatus.CONFIRMED &&
      order.status !== SalesOrderStatus.PARTIALLY_ISSUED
    )
      throw new ConflictException({
        code: 'ORDER_STATE_INVALID',
        message: '销售订单未确认或已全部出库',
      });
    const channel = await this.prisma.salesChannel.findUnique({
      where: { id: order.salesChannelId },
    });
    if (!channel)
      throw new ConflictException({ code: 'CHANNEL_MISSING', message: '销售渠道不存在' });
    await this.assertIssueLocation(channel, payload.locationId);
    const orderItems = new Map(order.items.map((item) => [item.id, item]));
    const ids = payload.items.map((item) => item.salesOrderItemId);
    if (new Set(ids).size !== ids.length)
      throw new UnprocessableEntityException({
        code: 'DUPLICATE_ITEM',
        message: '出库明细不能重复',
      });
    const items = payload.items.map((item) => {
      const source = orderItems.get(item.salesOrderItemId);
      if (!source)
        throw new UnprocessableEntityException({
          code: 'ORDER_ITEM_INVALID',
          message: '出库明细不属于所选销售订单',
        });
      const quantity = positive(item.quantity, '出库数量');
      if (quantity.greaterThan(source.quantity.minus(source.issuedQuantity)))
        throw new UnprocessableEntityException({
          code: 'ISSUE_QUANTITY_EXCEEDED',
          message: '出库数量超过销售订单未出数量',
        });
      return {
        salesOrderItemId: source.id,
        skuId: source.skuId,
        quantity,
        unitPrice: source.unitPrice,
        revenueAmount: quantity.mul(source.unitPrice),
        remark: item.remark,
      };
    });
    if (channel.inventoryMode === ChannelInventoryMode.VIRTUAL_ALLOCATION)
      await this.assertVirtualAllocation(channel.id, payload.locationId, items);
    const totalRevenue = items.reduce(
      (sum, item) => sum.plus(item.revenueAmount),
      new Prisma.Decimal(0),
    );
    const data = await this.prisma.salesIssue.create({
      data: {
        issueNo: businessNo('SI'),
        salesOrderId: order.id,
        salesChannelId: order.salesChannelId,
        customerId: order.customerId,
        locationId: payload.locationId,
        occurredAt: new Date(payload.occurredAt),
        remark: payload.remark,
        totalRevenue,
        items: { create: items },
      },
      include: {
        items: { include: { sku: true } },
        salesChannel: true,
        customer: true,
        location: true,
      },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'SALES',
      action: 'CREATE_ISSUE',
      entityType: 'SalesIssue',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async updateIssue(id: string, payload: UpdateSalesIssueDto, actor: AuthUser, requestId?: string) {
    const before = await this.prisma.salesIssue.findUnique({
      where: { id },
      include: {
        items: true,
        salesOrder: { include: { items: true } },
        salesChannel: true,
      },
    });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: '销售出库单不存在' });
    if (before.status !== DocumentStatus.DRAFT)
      throw new ConflictException({
        code: 'ISSUE_STATE_INVALID',
        message: '只有草稿销售出库单可以编辑',
      });
    if (
      before.salesOrder.status !== SalesOrderStatus.CONFIRMED &&
      before.salesOrder.status !== SalesOrderStatus.PARTIALLY_ISSUED
    )
      throw new ConflictException({
        code: 'ORDER_STATE_INVALID',
        message: '销售订单未确认或已全部出库',
      });
    if (before.items.length !== 1)
      throw new ConflictException({
        code: 'ISSUE_ITEM_COUNT_INVALID',
        message: '待处理销售出库单必须包含一条明细',
      });

    await this.assertIssueLocation(before.salesChannel, payload.locationId);
    const item = before.items[0];
    const orderItem = before.salesOrder.items.find(
      (candidate) => candidate.id === item.salesOrderItemId,
    );
    if (!orderItem)
      throw new ConflictException({
        code: 'ORDER_ITEM_INVALID',
        message: '销售出库明细未关联销售订单明细',
      });
    const quantity = payload.quantity
      ? positive(payload.quantity, '销售数量')
      : orderItem.quantity.minus(orderItem.issuedQuantity);
    if (quantity.greaterThan(orderItem.quantity.minus(orderItem.issuedQuantity)))
      throw new UnprocessableEntityException({
        code: 'ISSUE_QUANTITY_EXCEEDED',
        message: '销售数量超过销售订单未出库数量',
      });
    const occurredAt = payload.occurredAt
      ? new Date(payload.occurredAt)
      : before.salesOrder.orderDate;
    const after = await this.prisma.salesIssue.update({
      where: { id },
      data: {
        locationId: payload.locationId,
        occurredAt,
        remark: payload.remark,
        totalRevenue: quantity.mul(item.unitPrice),
        items: {
          update: {
            where: { id: item.id },
            data: { quantity, revenueAmount: quantity.mul(item.unitPrice) },
          },
        },
      },
      include: {
        items: { include: { sku: true } },
        salesChannel: true,
        customer: true,
        location: true,
      },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'SALES',
      action: 'UPDATE_ISSUE',
      entityType: 'SalesIssue',
      entityId: id,
      before,
      after,
      requestId,
    });
    return after;
  }

  async postIssue(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    const issue = await this.prisma.salesIssue.findUnique({
      where: { id },
      include: {
        items: true,
        salesOrder: { include: { items: true } },
        salesChannel: true,
      },
    });
    if (!issue) throw new NotFoundException({ code: 'NOT_FOUND', message: '销售出库单不存在' });
    if (!issue.locationId)
      throw new UnprocessableEntityException({
        code: 'LOCATION_REQUIRED',
        message: '请先选择销售出库地点',
      });
    if (
      issue.salesOrder.status !== SalesOrderStatus.CONFIRMED &&
      issue.salesOrder.status !== SalesOrderStatus.PARTIALLY_ISSUED
    )
      throw new ConflictException({
        code: 'ORDER_STATE_INVALID',
        message: '销售订单未确认或已全部出库',
      });
    const locationId = issue.locationId;
    return this.posting.post(
      {
        scope: `SALES_ISSUE:${id}`,
        idempotencyKey,
        type: InventoryTransactionType.SALES_ISSUE,
        occurredAt: issue.occurredAt,
        sourceType: 'SalesIssue',
        sourceId: id,
        lines: issue.items.map((item) => ({
          locationId,
          skuId: item.skuId,
          stockStatus: InventoryStockStatus.AVAILABLE,
          quantity: item.quantity.negated(),
          remark: item.remark ?? undefined,
          allocateBatches: true,
        })),
        finalize: async (transaction, result) => {
          const locked = await transaction.salesIssue.findUnique({ where: { id } });
          if (!locked || locked.status !== DocumentStatus.DRAFT)
            throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '销售出库单已过账' });
          if (issue.salesChannel.inventoryMode === ChannelInventoryMode.VIRTUAL_ALLOCATION)
            await this.consumeVirtualAllocation(transaction, { ...issue, locationId });
          let totalCost = new Prisma.Decimal(0);
          for (const item of issue.items) {
            const line = await transaction.inventoryTransactionLine.findFirstOrThrow({
              where: { transactionId: result.transactionId, skuId: item.skuId },
            });
            const costAmount = line.amount.abs();
            totalCost = totalCost.plus(costAmount);
            await transaction.salesIssueItem.update({
              where: { id: item.id },
              data: {
                unitCost: line.unitCost,
                costAmount,
                transactionLineId: line.id,
              },
            });
            const orderItem = await transaction.salesOrderItem.findUniqueOrThrow({
              where: { id: item.salesOrderItemId },
            });
            if (orderItem.issuedQuantity.plus(item.quantity).greaterThan(orderItem.quantity))
              throw new ConflictException({
                code: 'ISSUE_QUANTITY_EXCEEDED',
                message: '并发出库导致数量超过订单数量',
              });
            await transaction.salesOrderItem.update({
              where: { id: orderItem.id },
              data: { issuedQuantity: { increment: item.quantity } },
            });
          }
          const orderItems = await transaction.salesOrderItem.findMany({
            where: { salesOrderId: issue.salesOrderId },
          });
          const fullyIssued = orderItems.every((item) =>
            item.issuedQuantity.greaterThanOrEqualTo(item.quantity),
          );
          await transaction.salesOrder.update({
            where: { id: issue.salesOrderId },
            data: {
              status: fullyIssued ? SalesOrderStatus.ISSUED : SalesOrderStatus.PARTIALLY_ISSUED,
            },
          });
          for (const orderItem of orderItems) {
            const issueItem = issue.items.find(
              (candidate) => candidate.salesOrderItemId === orderItem.id,
            );
            const remaining = orderItem.quantity.minus(orderItem.issuedQuantity);
            if (!issueItem || remaining.lessThanOrEqualTo(0)) continue;
            await transaction.salesIssue.create({
              data: {
                issueNo: businessNo('SI'),
                salesOrderId: issue.salesOrderId,
                salesChannelId: issue.salesChannelId,
                customerId: issue.customerId,
                locationId,
                occurredAt: issue.salesOrder.orderDate,
                totalRevenue: remaining.mul(issueItem.unitPrice),
                items: {
                  create: {
                    salesOrderItemId: orderItem.id,
                    skuId: issueItem.skuId,
                    quantity: remaining,
                    unitPrice: issueItem.unitPrice,
                    revenueAmount: remaining.mul(issueItem.unitPrice),
                    remark: issueItem.remark,
                  },
                },
              },
            });
          }
          const receivable = await transaction.receivable.create({
            data: {
              receivableNo: businessNo('REC'),
              customerId: issue.customerId,
              salesChannelId: issue.salesChannelId,
              sourceType: 'SalesIssue',
              sourceId: id,
              currency: issue.salesOrder.currency,
              originalAmount: issue.totalRevenue,
              outstandingAmount: issue.totalRevenue,
              occurredAt: issue.occurredAt,
            },
          });
          await transaction.salesIssue.update({
            where: { id },
            data: {
              status: DocumentStatus.POSTED,
              transactionId: result.transactionId,
              receivableId: receivable.id,
              totalCost,
              postedAt: new Date(result.postedAt),
            },
          });
        },
      },
      actor,
      requestId,
    );
  }

  async createReturn(payload: CreateSalesReturnDto, actor: AuthUser, requestId?: string) {
    const issue = await this.prisma.salesIssue.findUnique({
      where: { id: payload.salesIssueId },
      include: {
        items: {
          include: {
            inventoryTransactionLine: { include: { batchAllocations: true } },
            returnItems: { include: { batchTraces: true } },
          },
        },
        salesOrder: true,
      },
    });
    if (!issue || issue.status !== DocumentStatus.POSTED)
      throw new ConflictException({
        code: 'ISSUE_STATE_INVALID',
        message: '只能对已过账销售出库创建退货',
      });
    const qcLocation = await this.prisma.inventoryLocation.findUnique({
      where: { id: payload.qcLocationId },
    });
    if (
      !qcLocation ||
      !qcLocation.isLeaf ||
      qcLocation.status !== MasterDataStatus.ACTIVE ||
      qcLocation.type !== InventoryLocationType.QC_AREA
    )
      throw new UnprocessableEntityException({
        code: 'QC_LOCATION_INVALID',
        message: '销售退货必须接收入启用的待质检区域',
      });
    const sourceMap = new Map(issue.items.map((item) => [item.id, item]));
    const ids = payload.items.map((item) => item.salesIssueItemId);
    if (new Set(ids).size !== ids.length)
      throw new UnprocessableEntityException({
        code: 'DUPLICATE_ITEM',
        message: '退货明细不能重复',
      });
    const items = payload.items.map((item) => {
      const source = sourceMap.get(item.salesIssueItemId);
      if (!source)
        throw new UnprocessableEntityException({
          code: 'ISSUE_ITEM_INVALID',
          message: '退货明细不属于所选销售出库单',
        });
      const quantity = positive(item.quantity, '退货数量');
      const pending = source.returnItems.reduce(
        (sum, returnItem) => sum.plus(returnItem.quantity),
        new Prisma.Decimal(0),
      );
      if (quantity.greaterThan(source.quantity.minus(pending)))
        throw new UnprocessableEntityException({
          code: 'RETURN_QUANTITY_EXCEEDED',
          message: '退货数量超过原出库可退数量',
        });
      if (!source.inventoryTransactionLine)
        throw new ConflictException({ code: 'BATCH_TRACE_MISSING', message: '原出库批次追溯缺失' });
      let remaining = quantity;
      const traces: Array<{ batchId: string; quantity: Prisma.Decimal }> = [];
      for (const allocation of source.inventoryTransactionLine.batchAllocations) {
        const used = source.returnItems
          .flatMap((returnItem) => returnItem.batchTraces)
          .filter((trace) => trace.batchId === allocation.batchId)
          .reduce((sum, trace) => sum.plus(trace.quantity), new Prisma.Decimal(0));
        const available = allocation.quantity.minus(used);
        if (available.lessThanOrEqualTo(0) || remaining.lessThanOrEqualTo(0)) continue;
        const traced = Prisma.Decimal.min(available, remaining);
        traces.push({ batchId: allocation.batchId, quantity: traced });
        remaining = remaining.minus(traced);
      }
      if (remaining.greaterThan(0))
        throw new ConflictException({
          code: 'BATCH_TRACE_INSUFFICIENT',
          message: '原出库批次可退数量不足',
        });
      return {
        salesIssueItemId: source.id,
        skuId: source.skuId,
        quantity,
        unitPrice: source.unitPrice,
        refundAmount: quantity.mul(source.unitPrice),
        unitCost: source.unitCost,
        remark: item.remark,
        batchTraces: { create: traces },
      };
    });
    const totalRefund = items.reduce(
      (sum, item) => sum.plus(item.refundAmount),
      new Prisma.Decimal(0),
    );
    const data = await this.prisma.salesReturn.create({
      data: {
        returnNo: businessNo('SRET'),
        salesIssueId: issue.id,
        salesChannelId: issue.salesChannelId,
        customerId: issue.customerId,
        qcLocationId: payload.qcLocationId,
        occurredAt: new Date(payload.occurredAt),
        reason: payload.reason,
        totalRefund,
        items: { create: items },
      },
      include: {
        items: { include: { sku: true, batchTraces: { include: { batch: true } } } },
        salesChannel: true,
        customer: true,
        qcLocation: true,
      },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'SALES',
      action: 'CREATE_RETURN',
      entityType: 'SalesReturn',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async postReturn(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    const salesReturn = await this.prisma.salesReturn.findUnique({
      where: { id },
      include: {
        items: { include: { salesIssueItem: true } },
        salesIssue: { include: { salesOrder: true, receivable: true } },
      },
    });
    if (!salesReturn)
      throw new NotFoundException({ code: 'NOT_FOUND', message: '销售退货单不存在' });
    return this.posting.post(
      {
        scope: `SALES_RETURN:${id}`,
        idempotencyKey,
        type: InventoryTransactionType.SALES_RETURN_QC,
        occurredAt: salesReturn.occurredAt,
        sourceType: 'SalesReturn',
        sourceId: id,
        lines: salesReturn.items.map((item) => ({
          locationId: salesReturn.qcLocationId,
          skuId: item.skuId,
          stockStatus: InventoryStockStatus.QC_PENDING,
          quantity: item.quantity,
          unitCost: item.unitCost,
          remark: item.remark ?? undefined,
          allocateBatches: false,
        })),
        finalize: async (transaction, result) => {
          const locked = await transaction.salesReturn.findUnique({ where: { id } });
          if (!locked || locked.status !== DocumentStatus.DRAFT)
            throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '销售退货单已过账' });
          for (const item of salesReturn.items) {
            const source = await transaction.salesIssueItem.findUniqueOrThrow({
              where: { id: item.salesIssueItemId },
            });
            if (source.returnedQuantity.plus(item.quantity).greaterThan(source.quantity))
              throw new ConflictException({
                code: 'RETURN_QUANTITY_EXCEEDED',
                message: '并发退货导致数量超过原出库数量',
              });
            await transaction.salesIssueItem.update({
              where: { id: source.id },
              data: { returnedQuantity: { increment: item.quantity } },
            });
            await transaction.salesOrderItem.update({
              where: { id: source.salesOrderItemId },
              data: { returnedQuantity: { increment: item.quantity } },
            });
          }
          const receivable = salesReturn.salesIssue.receivable;
          if (!receivable)
            throw new ConflictException({
              code: 'RECEIVABLE_MISSING',
              message: '销售出库应收不存在',
            });
          const adjustment = Prisma.Decimal.min(
            receivable.outstandingAmount,
            salesReturn.totalRefund,
          );
          const refund = salesReturn.totalRefund.minus(adjustment);
          if (adjustment.greaterThan(0)) {
            const outstandingAmount = receivable.outstandingAmount.minus(adjustment);
            await transaction.receivable.update({
              where: { id: receivable.id },
              data: {
                adjustedAmount: { increment: adjustment },
                outstandingAmount,
                status: outstandingAmount.isZero() ? ReceivableStatus.SETTLED : receivable.status,
              },
            });
            await transaction.receivableAdjustment.create({
              data: {
                receivableId: receivable.id,
                sourceType: 'SalesReturn',
                sourceId: id,
                amount: adjustment,
                reason: salesReturn.reason,
              },
            });
          }
          if (refund.greaterThan(0)) {
            await transaction.customerRefund.create({
              data: {
                refundNo: businessNo('CRF'),
                customerId: salesReturn.customerId,
                salesChannelId: salesReturn.salesChannelId,
                salesReturnId: id,
                currency: salesReturn.salesIssue.salesOrder.currency,
                amount: refund,
              },
            });
          }
          await transaction.salesReturn.update({
            where: { id },
            data: {
              status: DocumentStatus.POSTED,
              transactionId: result.transactionId,
              postedAt: new Date(result.postedAt),
            },
          });
        },
      },
      actor,
      requestId,
    );
  }

  async listIssues(query: SalesQueryDto) {
    return this.listDocuments('issues', query);
  }

  async listReturns(query: SalesQueryDto) {
    return this.listDocuments('returns', query);
  }

  async listReceivables(query: SalesQueryDto) {
    this.assertSort(query.sortBy, RECEIVABLE_SORT);
    const where: Prisma.ReceivableWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as ReceivableStatus } : {}),
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
              { receivableNo: { contains: query.keyword, mode: 'insensitive' } },
              { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { salesChannel: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.receivable.findMany({
        where,
        include: {
          customer: true,
          salesChannel: true,
          adjustments: true,
          salesIssue: {
            include: { items: { include: { sku: { select: { code: true, name: true } } } } },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.receivable.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async listRefunds(query: SalesQueryDto) {
    this.assertSort(query.sortBy, ['createdAt', 'amount', 'paidAmount'] as const);
    const where: Prisma.CustomerRefundWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { refundNo: { contains: query.keyword, mode: 'insensitive' } },
              { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customerRefund.findMany({
        where,
        include: {
          customer: true,
          salesChannel: true,
          salesReturn: {
            include: { items: { include: { sku: { select: { code: true, name: true } } } } },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customerRefund.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  private async listDocuments(kind: 'issues' | 'returns', query: SalesQueryDto) {
    this.assertSort(query.sortBy, DOCUMENT_SORT);
    const where = {
      ...(query.documentStatus ? { status: query.documentStatus as DocumentStatus } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.locationId && kind === 'issues' ? { locationId: query.locationId } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            occurredAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.keyword
        ? kind === 'issues'
          ? { issueNo: { contains: query.keyword, mode: 'insensitive' as const } }
          : { returnNo: { contains: query.keyword, mode: 'insensitive' as const } }
        : {}),
    };
    const delegate = {
      issues: this.prisma.salesIssue,
      returns: this.prisma.salesReturn,
    }[kind] as unknown as {
      findMany(args: unknown): Promise<unknown[]>;
      count(args: unknown): Promise<number>;
    };
    const include =
      kind === 'issues'
        ? {
            salesOrder: true,
            salesChannel: true,
            customer: true,
            location: true,
            items: {
              include: {
                sku: true,
                inventoryTransactionLine: {
                  include: { batchAllocations: { include: { batch: true } } },
                },
              },
            },
            receivable: true,
          }
        : {
            salesIssue: true,
            salesChannel: true,
            customer: true,
            qcLocation: true,
            items: { include: { sku: true, batchTraces: { include: { batch: true } } } },
            customerRefund: true,
          };
    const [data, total] = (await this.prisma.$transaction([
      delegate.findMany({
        where,
        include,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }) as never,
      delegate.count({ where }) as never,
    ])) as [unknown[], number];
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  private async order(id: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND', message: '销售订单不存在' });
    return order;
  }

  private async assertSalesReferences(payload: {
    skuId?: string;
    salesChannelId?: string;
    customerId?: string;
  }) {
    const [sku, channel, customer] = await Promise.all([
      payload.skuId ? this.prisma.sku.findUnique({ where: { id: payload.skuId } }) : null,
      payload.salesChannelId
        ? this.prisma.salesChannel.findUnique({ where: { id: payload.salesChannelId } })
        : null,
      payload.customerId
        ? this.prisma.customer.findUnique({ where: { id: payload.customerId } })
        : null,
    ]);
    if (payload.skuId && (!sku || sku.status !== MasterDataStatus.ACTIVE))
      throw new UnprocessableEntityException({ code: 'SKU_INVALID', message: 'SKU 无效' });
    if (payload.salesChannelId && (!channel || channel.status !== MasterDataStatus.ACTIVE))
      throw new UnprocessableEntityException({ code: 'CHANNEL_INVALID', message: '销售渠道无效' });
    if (payload.customerId && (!customer || customer.status !== MasterDataStatus.ACTIVE))
      throw new UnprocessableEntityException({ code: 'CUSTOMER_INVALID', message: '客户无效' });
  }

  private async assertIssueLocation(
    channel: { id: string; inventoryMode: ChannelInventoryMode; defaultLocationId: string | null },
    locationId: string,
  ) {
    const location = await this.prisma.inventoryLocation.findUnique({ where: { id: locationId } });
    if (!location || !location.isLeaf || location.status !== MasterDataStatus.ACTIVE)
      throw new UnprocessableEntityException({
        code: 'LOCATION_INVALID',
        message: '出库地点必须是启用的叶子库存地点',
      });
    if (
      channel.inventoryMode === ChannelInventoryMode.EXTERNAL_WAREHOUSE &&
      (location.type !== InventoryLocationType.EXTERNAL_WAREHOUSE ||
        location.salesChannelId !== channel.id)
    )
      throw new UnprocessableEntityException({
        code: 'CHANNEL_WAREHOUSE_INVALID',
        message: '平台仓渠道必须从该渠道关联的真实外部仓出库',
      });
    if (
      channel.inventoryMode === ChannelInventoryMode.DIRECT_FROM_LOCATION &&
      channel.defaultLocationId &&
      channel.defaultLocationId !== locationId
    )
      throw new UnprocessableEntityException({
        code: 'CHANNEL_LOCATION_INVALID',
        message: '直发渠道必须从渠道默认库存地点出库',
      });
    if (
      channel.inventoryMode === ChannelInventoryMode.VIRTUAL_ALLOCATION &&
      location.type === InventoryLocationType.EXTERNAL_WAREHOUSE
    )
      throw new UnprocessableEntityException({
        code: 'VIRTUAL_LOCATION_INVALID',
        message: '虚拟渠道额度必须绑定实际自有库存地点',
      });
  }

  private async assertVirtualAllocation(
    salesChannelId: string,
    locationId: string,
    items: Array<{ skuId: string; quantity: Prisma.Decimal }>,
  ) {
    const allocations = await this.prisma.channelAllocationItem.findMany({
      where: {
        channelAllocation: { salesChannelId, locationId, status: DocumentStatus.POSTED },
        skuId: { in: items.map((item) => item.skuId) },
      },
    });
    for (const item of items) {
      const available = allocations
        .filter((allocation) => allocation.skuId === item.skuId)
        .reduce(
          (sum, allocation) => sum.plus(allocation.quantity.minus(allocation.consumedQuantity)),
          new Prisma.Decimal(0),
        );
      if (available.lessThan(item.quantity))
        throw new UnprocessableEntityException({
          code: 'CHANNEL_ALLOCATION_INSUFFICIENT',
          message: '渠道虚拟分配额度不足',
        });
    }
  }

  private async consumeVirtualAllocation(
    transaction: Prisma.TransactionClient,
    issue: {
      salesChannelId: string;
      locationId: string;
      items: Array<{ skuId: string; quantity: Prisma.Decimal }>;
    },
  ) {
    for (const item of issue.items) {
      let remaining = item.quantity;
      const allocations = await transaction.channelAllocationItem.findMany({
        where: {
          skuId: item.skuId,
          channelAllocation: {
            salesChannelId: issue.salesChannelId,
            locationId: issue.locationId,
            status: DocumentStatus.POSTED,
          },
        },
        orderBy: { channelAllocation: { createdAt: 'asc' } },
      });
      for (const allocation of allocations) {
        if (remaining.lessThanOrEqualTo(0)) break;
        const available = allocation.quantity.minus(allocation.consumedQuantity);
        if (available.lessThanOrEqualTo(0)) continue;
        const consumed = Prisma.Decimal.min(available, remaining);
        await transaction.channelAllocationItem.update({
          where: { id: allocation.id },
          data: { consumedQuantity: { increment: consumed } },
        });
        remaining = remaining.minus(consumed);
      }
      if (remaining.greaterThan(0))
        throw new ConflictException({
          code: 'CHANNEL_ALLOCATION_INSUFFICIENT',
          message: '并发出库导致渠道虚拟分配额度不足',
        });
    }
  }

  private async findPrice(input: {
    skuId: string;
    salesChannelId: string;
    customerId?: string;
    quantity: Prisma.Decimal;
    at: Date;
  }) {
    const effective = {
      skuId: input.skuId,
      status: MasterDataStatus.ACTIVE,
      minQuantity: { lte: input.quantity },
      effectiveFrom: { lte: input.at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.at } }],
    } satisfies Prisma.SalesPriceWhereInput;
    const candidates: Prisma.SalesPriceWhereInput[] = [];
    if (input.customerId) {
      candidates.push({
        ...effective,
        customerId: input.customerId,
        salesChannelId: input.salesChannelId,
      });
      candidates.push({ ...effective, customerId: input.customerId, salesChannelId: null });
    }
    candidates.push({ ...effective, customerId: null, salesChannelId: input.salesChannelId });
    candidates.push({ ...effective, customerId: null, salesChannelId: null });
    for (const where of candidates) {
      const price = await this.prisma.salesPrice.findFirst({
        where,
        include: { sku: true, customer: true, salesChannel: true },
        orderBy: [{ minQuantity: 'desc' }, { effectiveFrom: 'desc' }],
      });
      if (price) return price;
    }
    return null;
  }

  private async assertNoPriceOverlap(
    payload: {
      skuId: string;
      salesChannelId?: string;
      customerId?: string;
      effectiveFrom: Date;
      effectiveTo: Date | null;
    },
    excludeId?: string,
  ) {
    const overlap = await this.prisma.salesPrice.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        skuId: payload.skuId,
        salesChannelId: payload.salesChannelId ?? null,
        customerId: payload.customerId ?? null,
        status: MasterDataStatus.ACTIVE,
        effectiveFrom: payload.effectiveTo ? { lt: payload.effectiveTo } : undefined,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: payload.effectiveFrom } }],
      },
    });
    if (overlap)
      throw new ConflictException({
        code: 'PRICE_PERIOD_OVERLAP',
        message: '相同客户/渠道维度的有效售价时间不能重叠',
      });
  }

  private assertSort(sortBy: string, whitelist: readonly string[]) {
    if (!whitelist.includes(sortBy))
      throw new BadRequestException({ code: 'SORT_INVALID', message: '排序字段不在白名单中' });
  }
}

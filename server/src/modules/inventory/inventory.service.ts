import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AdjustmentDirection,
  ChannelInventoryMode,
  DocumentStatus,
  InventoryLocationType,
  InventoryStockStatus,
  InventoryTransactionType,
  MasterDataStatus,
  Prisma,
} from '@prisma/client';
import { paginationMeta } from '../../common/dto/list-query.dto';
import { serializableTransaction } from '../../common/utils/serializable-transaction';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import type {
  CreateAdjustmentDto,
  CreateChannelAllocationDto,
  CreateLocationDto,
  CreateOpeningDto,
  CreateTransferDto,
  InventoryQueryDto,
  OpeningRowDto,
  UpdateLocationDto,
} from './dto/inventory.dto';
import { InventoryPostingService } from './inventory-posting.service';

const BALANCE_SORT = ['updatedAt', 'onHandQuantity', 'averageCost', 'inventoryValue'] as const;
const TRANSACTION_SORT = ['occurredAt', 'postedAt', 'transactionNo'] as const;
const LOCATION_SORT = ['createdAt', 'code', 'name', 'updatedAt'] as const;
const DOCUMENT_SORT = ['createdAt', 'occurredAt', 'updatedAt'] as const;

function documentNo(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function positive(value: string, label = '数量'): Prisma.Decimal {
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(value);
  } catch {
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}格式无效`,
    });
  }
  if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0)) {
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}必须大于 0`,
    });
  }
  return decimal;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new BadRequestException({ code: 'CSV_INVALID', message: 'CSV 引号未闭合' });
  return rows;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: InventoryPostingService,
    private readonly audit: AuditService,
  ) {}

  async listLocations(query: InventoryQueryDto) {
    this.assertSort(query.sortBy, LOCATION_SORT);
    const where: Prisma.InventoryLocationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { name: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryLocation.findMany({
        where,
        include: {
          parent: { select: { id: true, code: true, name: true } },
          salesChannel: { select: { id: true, code: true, name: true, inventoryMode: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryLocation.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async createLocation(payload: CreateLocationDto, actor: AuthUser, requestId?: string) {
    await this.validateLocation(payload);
    const data = await this.prisma.inventoryLocation.create({
      data: {
        code: payload.code.trim().toUpperCase(),
        name: payload.name.trim(),
        type: payload.type,
        parentId: payload.parentId,
        salesChannelId: payload.salesChannelId,
        isLeaf: payload.isLeaf ?? true,
      },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'INVENTORY',
      action: 'CREATE_LOCATION',
      entityType: 'InventoryLocation',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async updateLocation(
    id: string,
    payload: UpdateLocationDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    const before = await this.location(id);
    await this.validateLocation(
      {
        code: before.code,
        name: payload.name ?? before.name,
        type: payload.type ?? before.type,
        parentId: payload.parentId ?? before.parentId ?? undefined,
        salesChannelId: payload.salesChannelId ?? before.salesChannelId ?? undefined,
        isLeaf: payload.isLeaf ?? before.isLeaf,
      },
      id,
    );
    if (payload.isLeaf === false) {
      const nonZero = await this.prisma.inventoryBalance.count({
        where: { locationId: id, onHandQuantity: { not: 0 } },
      });
      if (nonZero) {
        throw new ConflictException({
          code: 'LOCATION_HAS_STOCK',
          message: '已有库存的地点不能改为非叶子节点',
        });
      }
    }
    const data = await this.prisma.inventoryLocation.update({ where: { id }, data: payload });
    await this.audit.record({
      userId: actor.id,
      module: 'INVENTORY',
      action: 'UPDATE_LOCATION',
      entityType: 'InventoryLocation',
      entityId: id,
      before,
      after: data,
      requestId,
    });
    return data;
  }

  async deactivateLocation(id: string, actor: AuthUser, requestId?: string): Promise<void> {
    const before = await this.location(id);
    const [nonZero, activeChildren] = await Promise.all([
      this.prisma.inventoryBalance.count({ where: { locationId: id, onHandQuantity: { not: 0 } } }),
      this.prisma.inventoryLocation.count({
        where: { parentId: id, status: MasterDataStatus.ACTIVE },
      }),
    ]);
    if (nonZero || activeChildren) {
      throw new ConflictException({
        code: 'LOCATION_IN_USE',
        message: '存在库存或启用子地点，不能停用',
      });
    }
    const after = await this.prisma.inventoryLocation.update({
      where: { id },
      data: { status: MasterDataStatus.INACTIVE },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'INVENTORY',
      action: 'DEACTIVATE_LOCATION',
      entityType: 'InventoryLocation',
      entityId: id,
      before,
      after,
      requestId,
    });
  }

  async listBalances(query: InventoryQueryDto) {
    this.assertSort(query.sortBy, BALANCE_SORT);
    const where: Prisma.InventoryBalanceWhereInput = {
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.skuId ? { skuId: query.skuId } : {}),
      ...(query.stockStatus ? { stockStatus: query.stockStatus } : {}),
      ...(query.categoryId ? { sku: { product: { categoryId: query.categoryId } } } : {}),
      ...(query.salesChannelId ? { location: { salesChannelId: query.salesChannelId } } : {}),
      ...(query.keyword
        ? {
            OR: [
              { sku: { code: { contains: query.keyword, mode: 'insensitive' } } },
              { sku: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { location: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryBalance.findMany({
        where,
        include: {
          location: {
            include: { salesChannel: { select: { id: true, code: true, name: true } } },
          },
          sku: {
            include: {
              product: { select: { id: true, code: true, name: true } },
              baseUnit: { select: { id: true, code: true, name: true, decimalScale: true } },
            },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryBalance.count({ where }),
    ]);
    const data = rows.map((row) => ({
      ...row,
      id: `${row.locationId}:${row.skuId}:${row.stockStatus}`,
      code: row.sku.code,
      name: row.sku.name,
      availableQuantity: row.onHandQuantity.minus(row.reservedQuantity),
      locationName: row.location.name,
      skuCode: row.sku.code,
    }));
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async listTransactions(query: InventoryQueryDto) {
    this.assertSort(query.sortBy, TRANSACTION_SORT);
    const where: Prisma.InventoryTransactionWhereInput = {
      ...(query.transactionType ? { type: query.transactionType } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            occurredAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.locationId || query.skuId || query.stockStatus
        ? {
            lines: {
              some: {
                ...(query.locationId ? { locationId: query.locationId } : {}),
                ...(query.skuId ? { skuId: query.skuId } : {}),
                ...(query.stockStatus ? { stockStatus: query.stockStatus } : {}),
              },
            },
          }
        : {}),
      ...(query.keyword
        ? {
            OR: [
              { transactionNo: { contains: query.keyword, mode: 'insensitive' } },
              { sourceId: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryTransaction.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async transaction(id: string) {
    const data = await this.prisma.inventoryTransaction.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            location: { select: { id: true, code: true, name: true } },
            sku: { select: { id: true, code: true, barcode: true, name: true } },
            batchAllocations: {
              include: {
                batch: { include: { supplier: { select: { id: true, code: true, name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!data) throw new NotFoundException({ code: 'NOT_FOUND', message: '库存流水不存在' });
    return data;
  }

  async listBatches(query: InventoryQueryDto) {
    this.assertSort(query.sortBy, ['receivedAt', 'batchNo', 'remainingQuantity'] as const);
    const where: Prisma.InventoryBatchWhereInput = {
      ...(query.skuId ? { skuId: query.skuId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { batchNo: { contains: query.keyword, mode: 'insensitive' } },
              { sku: { code: { contains: query.keyword, mode: 'insensitive' } } },
              { sku: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryBatch.findMany({
        where,
        include: {
          sku: { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, code: true, name: true } },
          allocations: {
            include: { transactionLine: { select: { transactionId: true, quantity: true } } },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryBatch.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  openingTemplate(): Readable {
    const sample = [
      'locationCode,skuCode,stockStatus,quantity,unitCost,batchNo,remark',
      'MAIN,SKU-001,AVAILABLE,100,12.500000,OPENING-001,期初库存',
    ].join('\r\n');
    return Readable.from([`\uFEFF${sample}\r\n`]);
  }

  openingRowsFromCsv(buffer: Buffer): OpeningRowDto[] {
    const rows = parseCsv(buffer.toString('utf8'));
    const header = rows.shift()?.map((value) => value.trim());
    const expected = [
      'locationCode',
      'skuCode',
      'stockStatus',
      'quantity',
      'unitCost',
      'batchNo',
      'remark',
    ];
    if (!header || expected.some((field, index) => header[index] !== field)) {
      throw new BadRequestException({
        code: 'CSV_HEADER_INVALID',
        message: '期初库存 CSV 表头不正确',
      });
    }
    return rows.map((row) => ({
      locationCode: row[0],
      skuCode: row[1],
      stockStatus: (row[2] || InventoryStockStatus.AVAILABLE) as InventoryStockStatus,
      quantity: row[3],
      unitCost: row[4],
      batchNo: row[5],
      remark: row[6] || undefined,
    }));
  }

  async previewOpening(rows: OpeningRowDto[]) {
    const locationCodes = [...new Set(rows.map((row) => row.locationCode.trim().toUpperCase()))];
    const skuCodes = [...new Set(rows.map((row) => row.skuCode.trim().toUpperCase()))];
    const batchNos = [...new Set(rows.map((row) => row.batchNo.trim()))];
    const [locations, skus, existingBatches] = await Promise.all([
      this.prisma.inventoryLocation.findMany({ where: { code: { in: locationCodes } } }),
      this.prisma.sku.findMany({ where: { code: { in: skuCodes } } }),
      this.prisma.inventoryBatch.findMany({
        where: { batchNo: { in: batchNos } },
        select: { batchNo: true },
      }),
    ]);
    const locationMap = new Map(locations.map((location) => [location.code, location]));
    const skuMap = new Map(skus.map((sku) => [sku.code, sku]));
    const usedBatches = new Set(existingBatches.map((batch) => batch.batchNo));
    const keys = new Set<string>();
    let totalQuantity = new Prisma.Decimal(0);
    let totalValue = new Prisma.Decimal(0);
    const previewRows = rows.map((row, index) => {
      const errors: string[] = [];
      const location = locationMap.get(row.locationCode.trim().toUpperCase());
      const sku = skuMap.get(row.skuCode.trim().toUpperCase());
      if (!location || location.status !== MasterDataStatus.ACTIVE || !location.isLeaf)
        errors.push('库存地点不存在、已停用或不是叶子节点');
      if (!sku || sku.status !== MasterDataStatus.ACTIVE) errors.push('SKU 不存在或已停用');
      if (!Object.values(InventoryStockStatus).includes(row.stockStatus))
        errors.push('库存状态无效');
      let quantity = new Prisma.Decimal(0);
      let unitCost = new Prisma.Decimal(0);
      try {
        quantity = new Prisma.Decimal(row.quantity);
        if (quantity.lessThanOrEqualTo(0)) errors.push('数量必须大于 0');
      } catch {
        errors.push('数量格式无效');
      }
      try {
        unitCost = new Prisma.Decimal(row.unitCost);
        if (unitCost.isNegative()) errors.push('成本不能为负数');
      } catch {
        errors.push('成本格式无效');
      }
      const batchNo = row.batchNo.trim();
      if (!batchNo) errors.push('批次号不能为空');
      if (usedBatches.has(batchNo)) errors.push('批次号已存在或在文件内重复');
      usedBatches.add(batchNo);
      if (location && sku) {
        const key = `${location.id}:${sku.id}:${row.stockStatus}`;
        if (keys.has(key)) errors.push('同一地点、SKU 与库存状态只能出现一次');
        keys.add(key);
      }
      if (!errors.length) {
        totalQuantity = totalQuantity.plus(quantity);
        totalValue = totalValue.plus(quantity.mul(unitCost));
      }
      return {
        rowNumber: index + 2,
        ...row,
        locationId: location?.id,
        locationName: location?.name,
        skuId: sku?.id,
        skuName: sku?.name,
        errors,
      };
    });
    return {
      valid: previewRows.every((row) => row.errors.length === 0),
      rowCount: previewRows.length,
      validCount: previewRows.filter((row) => row.errors.length === 0).length,
      totalQuantity: totalQuantity.toFixed(4),
      totalValue: totalValue.toFixed(4),
      rows: previewRows,
    };
  }

  async createOpening(payload: CreateOpeningDto, actor: AuthUser, requestId?: string) {
    const preview = await this.previewOpening(payload.rows);
    if (!preview.valid) {
      throw new UnprocessableEntityException({
        code: 'OPENING_PREVIEW_INVALID',
        message: '期初库存存在校验错误',
        details: preview.rows.filter((row) => row.errors.length),
      });
    }
    const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const response = await serializableTransaction(this.prisma, async (transaction) => {
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_key: { scope: 'OPENING_IMPORT', key: payload.importKey } },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: '相同导入键已用于不同内容',
          });
        const saved = existing.responseJson as { id: string };
        return transaction.inventoryOpening.findUniqueOrThrow({
          where: { id: saved.id },
          include: { items: true },
        });
      }
      const opening = await transaction.inventoryOpening.create({
        data: {
          openingNo: documentNo('OPEN'),
          importKey: payload.importKey,
          occurredAt: new Date(payload.occurredAt),
          remark: payload.remark,
          items: {
            create: preview.rows.map((row) => ({
              locationId: row.locationId!,
              skuId: row.skuId!,
              stockStatus: row.stockStatus,
              quantity: new Prisma.Decimal(row.quantity),
              unitCost: new Prisma.Decimal(row.unitCost),
              batchNo: row.batchNo.trim(),
              remark: row.remark,
            })),
          },
        },
        include: { items: true },
      });
      await transaction.idempotencyRecord.create({
        data: {
          scope: 'OPENING_IMPORT',
          key: payload.importKey,
          requestHash,
          responseJson: { id: opening.id },
          statusCode: 201,
          expiresAt: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
        },
      });
      return opening;
    });
    await this.audit.record({
      userId: actor.id,
      module: 'INVENTORY',
      action: 'IMPORT_OPENING',
      entityType: 'InventoryOpening',
      entityId: response.id,
      after: response,
      requestId,
    });
    return response;
  }

  async postOpening(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    const opening = await this.prisma.inventoryOpening.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!opening) throw new NotFoundException({ code: 'NOT_FOUND', message: '期初库存单不存在' });
    if (opening.status === DocumentStatus.CANCELLED)
      throw new ConflictException({ code: 'DOCUMENT_CANCELLED', message: '已取消单据不能过账' });
    return this.posting.post(
      {
        scope: `OPENING:${id}`,
        idempotencyKey,
        type: InventoryTransactionType.OPENING_IN,
        occurredAt: opening.occurredAt,
        sourceType: 'InventoryOpening',
        sourceId: id,
        lines: opening.items.map((item) => ({
          locationId: item.locationId,
          skuId: item.skuId,
          stockStatus: item.stockStatus,
          quantity: item.quantity,
          unitCost: item.unitCost,
          remark: item.remark ?? undefined,
          allocateBatches: false,
        })),
        batches: opening.items.map((item) => ({
          batchNo: item.batchNo,
          skuId: item.skuId,
          quantity: item.quantity,
          unitCost: item.unitCost,
        })),
        finalize: async (transaction, result) => {
          const updated = await transaction.inventoryOpening.updateMany({
            where: { id, status: DocumentStatus.DRAFT },
            data: {
              status: DocumentStatus.POSTED,
              transactionId: result.transactionId,
              postedAt: new Date(result.postedAt),
            },
          });
          if (updated.count !== 1)
            throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '期初库存已过账' });
        },
      },
      actor,
      requestId,
    );
  }

  async createAdjustment(payload: CreateAdjustmentDto, actor: AuthUser, requestId?: string) {
    for (const item of payload.items) {
      positive(item.quantity);
      if (payload.direction === AdjustmentDirection.IN) {
        if (item.unitCost === undefined)
          throw new UnprocessableEntityException({
            code: 'COST_REQUIRED',
            message: '调增库存必须填写单位成本',
          });
        const cost = new Prisma.Decimal(item.unitCost);
        if (cost.isNegative())
          throw new UnprocessableEntityException({
            code: 'COST_INVALID',
            message: '成本不能为负数',
          });
      }
    }
    const data = await this.prisma.inventoryAdjustment.create({
      data: {
        adjustmentNo: documentNo('ADJ'),
        direction: payload.direction,
        occurredAt: new Date(payload.occurredAt),
        reason: payload.reason.trim(),
        items: {
          create: payload.items.map((item) => ({
            locationId: item.locationId,
            skuId: item.skuId,
            stockStatus: item.stockStatus,
            quantity: new Prisma.Decimal(item.quantity),
            unitCost: item.unitCost === undefined ? undefined : new Prisma.Decimal(item.unitCost),
            remark: item.remark,
          })),
        },
      },
      include: { items: true },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'INVENTORY',
      action: 'CREATE_ADJUSTMENT',
      entityType: 'InventoryAdjustment',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async postAdjustment(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!adjustment)
      throw new NotFoundException({ code: 'NOT_FOUND', message: '库存调整单不存在' });
    const inbound = adjustment.direction === AdjustmentDirection.IN;
    return this.posting.post(
      {
        scope: `ADJUSTMENT:${id}`,
        idempotencyKey,
        type: inbound
          ? InventoryTransactionType.ADJUSTMENT_IN
          : InventoryTransactionType.ADJUSTMENT_OUT,
        occurredAt: adjustment.occurredAt,
        sourceType: 'InventoryAdjustment',
        sourceId: id,
        lines: adjustment.items.map((item) => ({
          locationId: item.locationId,
          skuId: item.skuId,
          stockStatus: item.stockStatus,
          quantity: inbound ? item.quantity : item.quantity.negated(),
          unitCost: inbound ? (item.unitCost ?? undefined) : undefined,
          remark: item.remark ?? undefined,
          allocateBatches: !inbound,
        })),
        batches: inbound
          ? adjustment.items.map((item, index) => ({
              batchNo: `${adjustment.adjustmentNo}-${String(index + 1).padStart(3, '0')}`,
              skuId: item.skuId,
              quantity: item.quantity,
              unitCost: item.unitCost ?? new Prisma.Decimal(0),
            }))
          : undefined,
        finalize: async (transaction, result) => {
          const updated = await transaction.inventoryAdjustment.updateMany({
            where: { id, status: DocumentStatus.DRAFT },
            data: {
              status: DocumentStatus.POSTED,
              transactionId: result.transactionId,
              postedAt: new Date(result.postedAt),
            },
          });
          if (updated.count !== 1)
            throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '库存调整单已过账' });
        },
      },
      actor,
      requestId,
    );
  }

  async createTransfer(payload: CreateTransferDto, actor: AuthUser, requestId?: string) {
    if (payload.fromLocationId === payload.toLocationId)
      throw new UnprocessableEntityException({
        code: 'TRANSFER_LOCATION_SAME',
        message: '调出与调入地点不能相同',
      });
    const [from, to] = await Promise.all([
      this.location(payload.fromLocationId),
      this.location(payload.toLocationId),
    ]);
    if (!from.isLeaf || !to.isLeaf || from.status !== 'ACTIVE' || to.status !== 'ACTIVE')
      throw new UnprocessableEntityException({
        code: 'LOCATION_INVALID',
        message: '调拨地点必须是启用的叶子地点',
      });
    for (const item of payload.items) positive(item.quantity);
    const data = await this.prisma.inventoryTransfer.create({
      data: {
        transferNo: documentNo('TRF'),
        fromLocationId: payload.fromLocationId,
        toLocationId: payload.toLocationId,
        occurredAt: new Date(payload.occurredAt),
        remark: payload.remark,
        items: {
          create: payload.items.map((item) => ({
            skuId: item.skuId,
            stockStatus: item.stockStatus,
            quantity: new Prisma.Decimal(item.quantity),
            remark: item.remark ?? undefined,
          })),
        },
      },
      include: { items: true, fromLocation: true, toLocation: true },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'INVENTORY',
      action: 'CREATE_TRANSFER',
      entityType: 'InventoryTransfer',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async postTransfer(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    const transfer = await this.prisma.inventoryTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!transfer) throw new NotFoundException({ code: 'NOT_FOUND', message: '库存调拨单不存在' });
    return this.posting.post(
      {
        scope: `TRANSFER:${id}`,
        idempotencyKey,
        type: InventoryTransactionType.TRANSFER_OUT,
        occurredAt: transfer.occurredAt,
        sourceType: 'InventoryTransfer',
        sourceId: id,
        lines: transfer.items.flatMap((item) => [
          {
            locationId: transfer.fromLocationId,
            skuId: item.skuId,
            stockStatus: item.stockStatus,
            quantity: item.quantity.negated(),
            remark: item.remark ?? undefined,
            allocateBatches: false,
          },
          {
            locationId: transfer.toLocationId,
            skuId: item.skuId,
            stockStatus: item.stockStatus,
            quantity: item.quantity,
            remark: item.remark ?? undefined,
            allocateBatches: false,
          },
        ]),
        finalize: async (transaction, result) => {
          const updated = await transaction.inventoryTransfer.updateMany({
            where: { id, status: DocumentStatus.DRAFT },
            data: {
              status: DocumentStatus.POSTED,
              transactionId: result.transactionId,
              postedAt: new Date(result.postedAt),
            },
          });
          if (updated.count !== 1)
            throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '库存调拨单已过账' });
        },
      },
      actor,
      requestId,
    );
  }

  async createChannelAllocation(
    payload: CreateChannelAllocationDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    const data = await serializableTransaction(this.prisma, async (transaction) => {
      const [channel, location] = await Promise.all([
        transaction.salesChannel.findUnique({ where: { id: payload.salesChannelId } }),
        transaction.inventoryLocation.findUnique({ where: { id: payload.locationId } }),
      ]);
      if (
        !channel ||
        channel.status !== MasterDataStatus.ACTIVE ||
        channel.inventoryMode !== ChannelInventoryMode.VIRTUAL_ALLOCATION
      )
        throw new UnprocessableEntityException({
          code: 'CHANNEL_MODE_INVALID',
          message: '只有启用的虚拟额度渠道可以创建渠道分配',
        });
      if (!location || !location.isLeaf || location.status !== MasterDataStatus.ACTIVE)
        throw new UnprocessableEntityException({
          code: 'LOCATION_INVALID',
          message: '库存地点无效',
        });
      for (const item of payload.items) {
        const quantity = positive(item.quantity);
        const [balance, aggregate] = await Promise.all([
          transaction.inventoryBalance.findUnique({
            where: {
              locationId_skuId_stockStatus: {
                locationId: payload.locationId,
                skuId: item.skuId,
                stockStatus: InventoryStockStatus.AVAILABLE,
              },
            },
          }),
          transaction.channelAllocationItem.aggregate({
            where: {
              skuId: item.skuId,
              channelAllocation: {
                locationId: payload.locationId,
                status: DocumentStatus.POSTED,
              },
            },
            _sum: { quantity: true },
          }),
        ]);
        const available = (balance?.onHandQuantity ?? new Prisma.Decimal(0)).minus(
          balance?.reservedQuantity ?? 0,
        );
        const allocated = aggregate._sum.quantity ?? new Prisma.Decimal(0);
        if (allocated.plus(quantity).greaterThan(available))
          throw new UnprocessableEntityException({
            code: 'CHANNEL_ALLOCATION_EXCEEDED',
            message: '渠道额度不能超过地点可用库存',
          });
      }
      return transaction.channelAllocation.create({
        data: {
          allocationNo: documentNo('CHA'),
          salesChannelId: payload.salesChannelId,
          locationId: payload.locationId,
          items: {
            create: payload.items.map((item) => ({
              skuId: item.skuId,
              quantity: new Prisma.Decimal(item.quantity),
            })),
          },
        },
        include: { items: { include: { sku: { select: { code: true, name: true } } } } },
      });
    });
    await this.audit.record({
      userId: actor.id,
      module: 'INVENTORY',
      action: 'ALLOCATE_CHANNEL',
      entityType: 'ChannelAllocation',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async listDocuments(kind: 'openings' | 'adjustments' | 'transfers', query: InventoryQueryDto) {
    this.assertSort(query.sortBy, DOCUMENT_SORT);
    const where = {
      ...(query.documentStatus ? { status: query.documentStatus } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            occurredAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
    };
    const delegate = {
      openings: this.prisma.inventoryOpening,
      adjustments: this.prisma.inventoryAdjustment,
      transfers: this.prisma.inventoryTransfer,
    }[kind] as unknown as {
      findMany(args: unknown): Promise<unknown[]>;
      count(args: unknown): Promise<number>;
    };
    const [data, total] = (await this.prisma.$transaction([
      delegate.findMany({
        where,
        include: { _count: { select: { items: true } } },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }) as never,
      delegate.count({ where }) as never,
    ])) as [unknown[], number];
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  private async location(id: string) {
    const location = await this.prisma.inventoryLocation.findUnique({ where: { id } });
    if (!location) throw new NotFoundException({ code: 'NOT_FOUND', message: '库存地点不存在' });
    return location;
  }

  private async validateLocation(payload: CreateLocationDto, currentId?: string): Promise<void> {
    if (payload.parentId) {
      if (payload.parentId === currentId)
        throw new UnprocessableEntityException({
          code: 'LOCATION_PARENT_INVALID',
          message: '库存地点不能以自身为上级',
        });
      const parent = await this.location(payload.parentId);
      if (parent.status !== MasterDataStatus.ACTIVE)
        throw new UnprocessableEntityException({
          code: 'LOCATION_PARENT_INVALID',
          message: '上级库存地点已停用',
        });
    }
    if (payload.type === InventoryLocationType.EXTERNAL_WAREHOUSE && !payload.salesChannelId)
      throw new UnprocessableEntityException({
        code: 'SALES_CHANNEL_REQUIRED',
        message: '外部平台仓必须关联销售渠道',
      });
    if (payload.salesChannelId) {
      const channel = await this.prisma.salesChannel.findUnique({
        where: { id: payload.salesChannelId },
      });
      if (!channel || channel.status !== MasterDataStatus.ACTIVE)
        throw new UnprocessableEntityException({
          code: 'SALES_CHANNEL_INVALID',
          message: '销售渠道不存在或已停用',
        });
      if (
        payload.type === InventoryLocationType.EXTERNAL_WAREHOUSE &&
        channel.inventoryMode !== ChannelInventoryMode.EXTERNAL_WAREHOUSE
      )
        throw new UnprocessableEntityException({
          code: 'CHANNEL_MODE_INVALID',
          message: '外部平台仓只能关联 EXTERNAL_WAREHOUSE 渠道',
        });
    }
  }

  private assertSort(sortBy: string, whitelist: readonly string[]): void {
    if (!whitelist.includes(sortBy))
      throw new BadRequestException({ code: 'SORT_INVALID', message: '排序字段不在白名单中' });
  }
}

export { parseCsv };

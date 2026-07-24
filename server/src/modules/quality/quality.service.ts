import { createHash, randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import {
  ClaimResolutionType,
  DocumentStatus,
  InventoryLocationType,
  InventoryStockStatus,
  InventoryTransactionType,
  MasterDataStatus,
  Prisma,
  QualityInspectionStatus,
  QualityIssueStatus,
  QualityResponsibility,
  SupplierClaimStatus,
} from '@prisma/client'
import { paginationMeta } from '../../common/dto/list-query.dto'
import { serializableTransaction } from '../../common/utils/serializable-transaction'
import { PrismaService } from '../../database/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { AuthUser } from '../auth/auth.types'
import {
  InventoryPostingService,
  type PostingLineInput,
} from '../inventory/inventory-posting.service'
import type {
  ConfirmQualityInspectionDto,
  CreateClaimSettlementDto,
  CreateQualityInspectionDto,
  QualityQueryDto,
} from './dto/quality.dto'

const INSPECTION_SORT = ['createdAt', 'inspectedAt', 'inspectionNo'] as const
const ISSUE_SORT = ['createdAt', 'estimatedLoss', 'quantity', 'issueNo'] as const
const CLAIM_SORT = ['createdAt', 'submittedAt', 'claimedAmount', 'settledAmount'] as const
const SETTLEMENT_SORT = ['createdAt', 'occurredAt', 'amount', 'quantity'] as const

function businessNo(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`
}

function decimal(value: string, label: string, allowZero = true): Prisma.Decimal {
  let parsed: Prisma.Decimal
  try {
    parsed = new Prisma.Decimal(value)
  } catch {
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}格式无效`,
    })
  }
  if (!parsed.isFinite() || parsed.isNegative() || (!allowZero && parsed.isZero()))
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}${allowZero ? '不能为负数' : '必须大于 0'}`,
    })
  return parsed
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

@Injectable()
export class QualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: InventoryPostingService,
    private readonly audit: AuditService,
  ) {}

  async listPendingReturns(query: QualityQueryDto) {
    this.assertSort(query.sortBy, ['createdAt', 'occurredAt', 'totalRefund'])
    const where: Prisma.SalesReturnWhereInput = {
      status: DocumentStatus.POSTED,
      qualityInspection: null,
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
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
              { returnNo: { contains: query.keyword, mode: 'insensitive' } },
              { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.salesReturn.findMany({
        where,
        include: {
          customer: true,
          salesChannel: true,
          qcLocation: true,
          items: {
            include: {
              sku: true,
              batchTraces: { include: { batch: { include: { supplier: true } } } },
            },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesReturn.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async createInspection(payload: CreateQualityInspectionDto, actor: AuthUser, requestId?: string) {
    const salesReturn = await this.prisma.salesReturn.findUnique({
      where: { id: payload.salesReturnId },
      include: {
        qualityInspection: true,
        items: {
          include: {
            batchTraces: { include: { batch: true } },
          },
        },
      },
    })
    if (!salesReturn || salesReturn.status !== DocumentStatus.POSTED)
      throw new ConflictException({
        code: 'RETURN_STATE_INVALID',
        message: '只能质检已接收入库的销售退货',
      })
    if (salesReturn.qualityInspection)
      throw new ConflictException({ code: 'INSPECTION_EXISTS', message: '该销售退货已创建质检单' })
    const sourceMap = new Map(salesReturn.items.map((item) => [item.id, item]))
    const itemIds = payload.items.map((item) => item.salesReturnItemId)
    if (
      new Set(itemIds).size !== itemIds.length ||
      itemIds.length !== salesReturn.items.length ||
      itemIds.some((id) => !sourceMap.has(id))
    )
      throw new UnprocessableEntityException({
        code: 'INSPECTION_ITEMS_INCOMPLETE',
        message: '质检单必须且只能包含该销售退货的全部明细',
      })
    const items = payload.items.map((item) => {
      const source = sourceMap.get(item.salesReturnItemId)!
      const goodQuantity = decimal(item.goodQuantity, '良品数量')
      const defectiveQuantity = decimal(item.defectiveQuantity, '不良品数量')
      const supplierClaimQuantity = decimal(item.supplierClaimQuantity, '供应商索赔数量')
      const scrapQuantity = decimal(item.scrapQuantity, '报废数量')
      const inspected = goodQuantity
        .plus(defectiveQuantity)
        .plus(supplierClaimQuantity)
        .plus(scrapQuantity)
      if (!inspected.equals(source.quantity))
        throw new UnprocessableEntityException({
          code: 'INSPECTION_QUANTITY_MISMATCH',
          message: '良品、不良品、供应商索赔和报废数量之和必须等于退货接收数量',
        })
      const badQuantity = defectiveQuantity.plus(supplierClaimQuantity).plus(scrapQuantity)
      if (badQuantity.greaterThan(0) && !item.defectDescription?.trim())
        throw new UnprocessableEntityException({
          code: 'DEFECT_DESCRIPTION_REQUIRED',
          message: '存在非良品数量时必须填写问题描述',
        })
      if (supplierClaimQuantity.greaterThan(0)) {
        if (item.responsibility !== QualityResponsibility.SUPPLIER || !item.supplierId)
          throw new UnprocessableEntityException({
            code: 'SUPPLIER_RESPONSIBILITY_REQUIRED',
            message: '供应商索赔数量必须判定为供应商责任并选择供应商',
          })
        const traceQuantity = source.batchTraces
          .filter((trace) => trace.batch.supplierId === item.supplierId)
          .reduce((sum, trace) => sum.plus(trace.quantity), new Prisma.Decimal(0))
        if (traceQuantity.lessThan(supplierClaimQuantity))
          throw new UnprocessableEntityException({
            code: 'SUPPLIER_TRACE_INSUFFICIENT',
            message: '所选供应商的原出库批次追溯数量不足',
          })
      }
      return {
        salesReturnItemId: source.id,
        goodQuantity,
        defectiveQuantity,
        supplierClaimQuantity,
        scrapQuantity,
        responsibility: item.responsibility,
        supplierId: item.supplierId,
        defectDescription: item.defectDescription?.trim(),
        estimatedLoss: badQuantity.mul(source.unitCost),
      }
    })
    const data = await this.prisma.qualityInspection.create({
      data: {
        inspectionNo: businessNo('QI'),
        salesReturnId: salesReturn.id,
        inspectedAt: new Date(payload.inspectedAt),
        notes: payload.notes,
        items: { create: items },
      },
      include: {
        salesReturn: true,
        items: { include: { salesReturnItem: { include: { sku: true } } } },
      },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'QUALITY',
      action: 'CREATE_INSPECTION',
      entityType: 'QualityInspection',
      entityId: data.id,
      after: data,
      requestId,
    })
    return data
  }

  async confirmInspection(
    id: string,
    payload: ConfirmQualityInspectionDto,
    idempotencyKey: string,
    actor: AuthUser,
    requestId?: string,
  ) {
    const inspection = await this.prisma.qualityInspection.findUnique({
      where: { id },
      include: {
        salesReturn: true,
        items: {
          include: {
            salesReturnItem: {
              include: { batchTraces: { include: { batch: true }, orderBy: { id: 'asc' } } },
            },
          },
        },
      },
    })
    if (!inspection) throw new NotFoundException({ code: 'NOT_FOUND', message: '质量检验单不存在' })
    if (inspection.status !== QualityInspectionStatus.DRAFT)
      throw new ConflictException({ code: 'INSPECTION_CONFIRMED', message: '质检单已确认' })
    await this.assertInspectionDestinations(inspection.items, payload)
    const lines: PostingLineInput[] = []
    for (const item of inspection.items) {
      const source = item.salesReturnItem
      lines.push({
        locationId: inspection.salesReturn.qcLocationId,
        skuId: source.skuId,
        stockStatus: InventoryStockStatus.QC_PENDING,
        quantity: source.quantity.negated(),
        allocateBatches: false,
        costGroup: item.id,
        remark: `质检分流 ${inspection.inspectionNo}`,
      })
      const destinations: Array<{
        quantity: Prisma.Decimal
        locationId?: string
        status: InventoryStockStatus
      }> = [
        {
          quantity: item.goodQuantity,
          locationId: payload.availableLocationId,
          status: InventoryStockStatus.AVAILABLE,
        },
        {
          quantity: item.defectiveQuantity,
          locationId: payload.defectiveLocationId,
          status: InventoryStockStatus.DEFECTIVE,
        },
        {
          quantity: item.supplierClaimQuantity,
          locationId: payload.claimLocationId,
          status: InventoryStockStatus.SUPPLIER_CLAIM,
        },
        {
          quantity: item.scrapQuantity,
          locationId: payload.scrapLocationId,
          status: InventoryStockStatus.SCRAPPED,
        },
      ]
      for (const destination of destinations) {
        if (destination.quantity.lessThanOrEqualTo(0)) continue
        lines.push({
          locationId: destination.locationId!,
          skuId: source.skuId,
          stockStatus: destination.status,
          quantity: destination.quantity,
          allocateBatches: false,
          costGroup: item.id,
          remark: `质检分流 ${inspection.inspectionNo}`,
        })
      }
    }
    return this.posting.post(
      {
        scope: `QUALITY_INSPECTION:${id}`,
        idempotencyKey,
        type: InventoryTransactionType.QC_RELEASE,
        occurredAt: inspection.inspectedAt,
        sourceType: 'QualityInspection',
        sourceId: id,
        lines,
        finalize: async (transaction, result) => {
          const locked = await transaction.qualityInspection.findUnique({ where: { id } })
          if (!locked || locked.status !== QualityInspectionStatus.DRAFT)
            throw new ConflictException({ code: 'INSPECTION_CONFIRMED', message: '质检单已确认' })
          const claims = new Map<
            string,
            Array<{ qualityIssueId: string; quantity: Prisma.Decimal; claimAmount: Prisma.Decimal }>
          >()
          for (const item of inspection.items) {
            const source = item.salesReturnItem
            await transaction.salesReturnItem.update({
              where: { id: source.id },
              data: { inspectedQuantity: source.quantity },
            })
            let restore = item.goodQuantity
            for (const trace of source.batchTraces) {
              if (restore.lessThanOrEqualTo(0)) break
              const quantity = Prisma.Decimal.min(trace.quantity, restore)
              await transaction.inventoryBatch.update({
                where: { id: trace.batchId },
                data: { remainingQuantity: { increment: quantity } },
              })
              restore = restore.minus(quantity)
            }
            if (restore.greaterThan(0))
              throw new ConflictException({
                code: 'BATCH_TRACE_INSUFFICIENT',
                message: '良品释放时原批次追溯数量不足',
              })
            const issueQuantity = item.defectiveQuantity
              .plus(item.supplierClaimQuantity)
              .plus(item.scrapQuantity)
            if (issueQuantity.lessThanOrEqualTo(0)) continue
            const issue = await transaction.qualityIssue.create({
              data: {
                issueNo: businessNo('QIS'),
                qualityInspectionItemId: item.id,
                skuId: source.skuId,
                supplierId: item.supplierId,
                responsibility: item.responsibility,
                quantity: issueQuantity,
                estimatedLoss: item.estimatedLoss,
                defectDescription: item.defectDescription ?? '质量异常',
                status: item.supplierClaimQuantity.greaterThan(0)
                  ? QualityIssueStatus.CLAIMED
                  : QualityIssueStatus.OPEN,
              },
            })
            if (item.supplierClaimQuantity.greaterThan(0) && item.supplierId) {
              const claimAmount = item.supplierClaimQuantity.mul(source.unitCost)
              const parts = claims.get(item.supplierId) ?? []
              parts.push({
                qualityIssueId: issue.id,
                quantity: item.supplierClaimQuantity,
                claimAmount,
              })
              claims.set(item.supplierId, parts)
            }
          }
          for (const [supplierId, parts] of claims) {
            const claimedAmount = parts.reduce(
              (sum, part) => sum.plus(part.claimAmount),
              new Prisma.Decimal(0),
            )
            await transaction.supplierClaim.create({
              data: {
                claimNo: businessNo('SCL'),
                supplierId,
                claimedAmount,
                submittedAt: new Date(),
                remark: `由质检单 ${inspection.inspectionNo} 自动生成`,
                items: { create: parts },
              },
            })
          }
          await transaction.qualityInventoryMovement.create({
            data: { qualityInspectionId: id, transactionId: result.transactionId },
          })
          await transaction.qualityInspection.update({
            where: { id },
            data: {
              status: QualityInspectionStatus.CONFIRMED,
              confirmedAt: new Date(result.postedAt),
            },
          })
        },
      },
      actor,
      requestId,
    )
  }

  async listInspections(query: QualityQueryDto) {
    this.assertSort(query.sortBy, INSPECTION_SORT)
    const where: Prisma.QualityInspectionWhereInput = {
      ...(query.documentStatus ? { status: query.documentStatus as QualityInspectionStatus } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            inspectedAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.keyword
        ? {
            OR: [
              { inspectionNo: { contains: query.keyword, mode: 'insensitive' } },
              { salesReturn: { returnNo: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.qualityInspection.findMany({
        where,
        include: {
          salesReturn: { include: { customer: true, qcLocation: true } },
          items: { include: { salesReturnItem: { include: { sku: true } }, qualityIssue: true } },
          movements: { include: { transaction: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.qualityInspection.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async listIssues(query: QualityQueryDto) {
    this.assertSort(query.sortBy, ISSUE_SORT)
    const where: Prisma.QualityIssueWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.skuId ? { skuId: query.skuId } : {}),
      ...(query.responsibility ? { responsibility: query.responsibility } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as QualityIssueStatus } : {}),
      ...(query.keyword
        ? {
            OR: [
              { issueNo: { contains: query.keyword, mode: 'insensitive' } },
              { defectDescription: { contains: query.keyword, mode: 'insensitive' } },
              { sku: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.qualityIssue.findMany({
        where,
        include: {
          sku: true,
          supplier: true,
          qualityInspectionItem: {
            include: { qualityInspection: true, salesReturnItem: true },
          },
          claimItem: { include: { supplierClaim: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.qualityIssue.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async listClaims(query: QualityQueryDto) {
    this.assertSort(query.sortBy, CLAIM_SORT)
    const where: Prisma.SupplierClaimWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as SupplierClaimStatus } : {}),
      ...(query.keyword
        ? {
            OR: [
              { claimNo: { contains: query.keyword, mode: 'insensitive' } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierClaim.findMany({
        where,
        include: {
          supplier: true,
          items: { include: { qualityIssue: { include: { sku: true } } } },
          settlements: true,
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierClaim.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async listSettlements(query: QualityQueryDto) {
    this.assertSort(query.sortBy, SETTLEMENT_SORT)
    const where: Prisma.SupplierClaimSettlementWhereInput = {
      ...(query.resolutionType ? { resolutionType: query.resolutionType } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as DocumentStatus } : {}),
      ...(query.supplierId ? { supplierClaim: { supplierId: query.supplierId } } : {}),
      ...(query.keyword
        ? {
            OR: [
              { settlementNo: { contains: query.keyword, mode: 'insensitive' } },
              { supplierClaim: { claimNo: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierClaimSettlement.findMany({
        where,
        include: {
          supplierClaim: { include: { supplier: true } },
          supplierClaimItem: { include: { qualityIssue: { include: { sku: true } } } },
          replacementLocation: true,
          claimStockLocation: true,
          scrapLocation: true,
          supplierCredit: true,
          compensationReceivable: true,
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierClaimSettlement.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async listQualityStock(query: QualityQueryDto) {
    this.assertSort(query.sortBy, ['updatedAt', 'onHandQuantity', 'inventoryValue'])
    const where: Prisma.InventoryBalanceWhereInput = {
      stockStatus: {
        in: [
          InventoryStockStatus.QC_PENDING,
          InventoryStockStatus.DEFECTIVE,
          InventoryStockStatus.SUPPLIER_CLAIM,
          InventoryStockStatus.SCRAPPED,
        ],
      },
      onHandQuantity: { gt: 0 },
      ...(query.skuId ? { skuId: query.skuId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { sku: { code: { contains: query.keyword, mode: 'insensitive' } } },
              { sku: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { location: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryBalance.findMany({
        where,
        include: { sku: { include: { product: true } }, location: true },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryBalance.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async listCompensationReceivables(query: QualityQueryDto) {
    this.assertSort(query.sortBy, [
      'createdAt',
      'occurredAt',
      'outstandingAmount',
      'originalAmount',
    ])
    const where: Prisma.SupplierCompensationReceivableWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { receivableNo: { contains: query.keyword, mode: 'insensitive' } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierCompensationReceivable.findMany({
        where,
        include: { supplier: true, supplierClaimSettlement: { include: { supplierClaim: true } } },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierCompensationReceivable.count({ where }),
    ])
    return { data, meta: paginationMeta(query.page, query.pageSize, total) }
  }

  async settleClaim(
    claimId: string,
    payload: CreateClaimSettlementDto,
    idempotencyKey: string,
    actor: AuthUser,
    requestId?: string,
  ) {
    if (!idempotencyKey?.trim())
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: '索赔处理必须提供 Idempotency-Key',
      })
    const scope = `CLAIM_SETTLEMENT_CREATE:${claimId}`
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key: idempotencyKey } },
    })
    if (existing) {
      if (existing.requestHash !== requestHash(payload))
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: '相同幂等键已用于不同索赔处理内容',
        })
      const settlementId = String((existing.responseJson as { settlementId: string }).settlementId)
      return this.prisma.supplierClaimSettlement.findUniqueOrThrow({
        where: { id: settlementId },
        include: {
          supplierClaim: { include: { supplier: true } },
          supplierClaimItem: { include: { qualityIssue: { include: { sku: true } } } },
          supplierCredit: true,
          compensationReceivable: true,
        },
      })
    }
    const claim = await this.prisma.supplierClaim.findUnique({
      where: { id: claimId },
      include: {
        items: {
          include: {
            qualityIssue: {
              include: {
                qualityInspectionItem: { include: { salesReturnItem: true } },
              },
            },
            settlements: true,
          },
        },
      },
    })
    if (!claim) throw new NotFoundException({ code: 'NOT_FOUND', message: '供应商索赔单不存在' })
    if (
      claim.status === SupplierClaimStatus.SETTLED ||
      claim.status === SupplierClaimStatus.REJECTED ||
      claim.status === SupplierClaimStatus.CLOSED
    )
      throw new ConflictException({ code: 'CLAIM_CLOSED', message: '供应商索赔已结案' })
    const claimItem = payload.supplierClaimItemId
      ? claim.items.find((item) => item.id === payload.supplierClaimItemId)
      : undefined
    if (payload.supplierClaimItemId && !claimItem)
      throw new UnprocessableEntityException({
        code: 'CLAIM_ITEM_INVALID',
        message: '索赔明细不属于当前索赔单',
      })
    const prepared = this.validateSettlement(claim, claimItem, payload)
    const settlementId = await this.prepareSettlement(claimId, payload, idempotencyKey, prepared)
    const settlement = await this.prisma.supplierClaimSettlement.findUniqueOrThrow({
      where: { id: settlementId },
      include: {
        supplierClaim: true,
        supplierClaimItem: {
          include: {
            qualityIssue: {
              include: { qualityInspectionItem: { include: { salesReturnItem: true } } },
            },
          },
        },
      },
    })
    if (settlement.status === DocumentStatus.POSTED) return settlement
    if (
      settlement.resolutionType === ClaimResolutionType.REPLACEMENT ||
      settlement.resolutionType === ClaimResolutionType.SCRAP
    ) {
      await this.postInventorySettlement(settlement, idempotencyKey, actor, requestId)
    } else {
      await this.postNonInventorySettlement(settlement, actor, requestId)
    }
    return this.prisma.supplierClaimSettlement.findUniqueOrThrow({
      where: { id: settlement.id },
      include: {
        supplierClaim: { include: { supplier: true } },
        supplierClaimItem: { include: { qualityIssue: { include: { sku: true } } } },
        supplierCredit: true,
        compensationReceivable: true,
      },
    })
  }

  async analytics(query: QualityQueryDto) {
    const from = query.createdFrom ? new Date(query.createdFrom) : undefined
    const to = query.createdTo ? new Date(query.createdTo) : undefined
    const [issues, claimRows, issueRows] = await Promise.all([
      this.prisma.qualityIssue.findMany({
        where: {
          ...(query.supplierId ? { supplierId: query.supplierId } : {}),
          ...(query.skuId ? { skuId: query.skuId } : {}),
          ...(from || to
            ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
            : {}),
        },
        include: { supplier: true, sku: true },
      }),
      this.prisma.supplierClaim.findMany({
        where:
          from || to
            ? { submittedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
            : {},
        include: { supplier: true },
      }),
      this.prisma.salesIssueItem.findMany({
        include: { sku: true, salesIssue: { include: { salesChannel: true } } },
      }),
    ])
    const supplierMap = new Map<
      string,
      {
        supplierId: string
        supplierName: string
        issueQuantity: Prisma.Decimal
        loss: Prisma.Decimal
        claims: number
        settled: number
      }
    >()
    for (const issue of issues) {
      if (!issue.supplier) continue
      const row = supplierMap.get(issue.supplierId!) ?? {
        supplierId: issue.supplierId!,
        supplierName: issue.supplier.name,
        issueQuantity: new Prisma.Decimal(0),
        loss: new Prisma.Decimal(0),
        claims: 0,
        settled: 0,
      }
      row.issueQuantity = row.issueQuantity.plus(issue.quantity)
      row.loss = row.loss.plus(issue.estimatedLoss)
      supplierMap.set(issue.supplierId!, row)
    }
    for (const claim of claimRows) {
      const row = supplierMap.get(claim.supplierId) ?? {
        supplierId: claim.supplierId,
        supplierName: claim.supplier.name,
        issueQuantity: new Prisma.Decimal(0),
        loss: new Prisma.Decimal(0),
        claims: 0,
        settled: 0,
      }
      row.claims += 1
      if (claim.status === SupplierClaimStatus.SETTLED) row.settled += 1
      supplierMap.set(claim.supplierId, row)
    }
    const skuMap = new Map<
      string,
      {
        skuId: string
        skuCode: string
        skuName: string
        issued: Prisma.Decimal
        returned: Prisma.Decimal
      }
    >()
    for (const item of issueRows) {
      const row = skuMap.get(item.skuId) ?? {
        skuId: item.skuId,
        skuCode: item.sku.code,
        skuName: item.sku.name,
        issued: new Prisma.Decimal(0),
        returned: new Prisma.Decimal(0),
      }
      row.issued = row.issued.plus(item.quantity)
      row.returned = row.returned.plus(item.returnedQuantity)
      skuMap.set(item.skuId, row)
    }
    return {
      summary: {
        issueQuantity: issues.reduce(
          (sum, issue) => sum.plus(issue.quantity),
          new Prisma.Decimal(0),
        ),
        estimatedLoss: issues.reduce(
          (sum, issue) => sum.plus(issue.estimatedLoss),
          new Prisma.Decimal(0),
        ),
        claimedAmount: claimRows.reduce(
          (sum, claim) => sum.plus(claim.claimedAmount),
          new Prisma.Decimal(0),
        ),
        settledAmount: claimRows.reduce(
          (sum, claim) => sum.plus(claim.settledAmount),
          new Prisma.Decimal(0),
        ),
      },
      suppliers: [...supplierMap.values()].map((row) => ({
        ...row,
        successRate: row.claims ? row.settled / row.claims : 0,
      })),
      skus: [...skuMap.values()].map((row) => ({
        ...row,
        returnRate: row.issued.greaterThan(0)
          ? row.returned.div(row.issued)
          : new Prisma.Decimal(0),
      })),
    }
  }

  private async assertInspectionDestinations(
    items: Array<{
      goodQuantity: Prisma.Decimal
      defectiveQuantity: Prisma.Decimal
      supplierClaimQuantity: Prisma.Decimal
      scrapQuantity: Prisma.Decimal
    }>,
    payload: ConfirmQualityInspectionDto,
  ) {
    const rules: Array<[boolean, string | undefined, InventoryLocationType | undefined, string]> = [
      [
        items.some((item) => item.goodQuantity.greaterThan(0)),
        payload.availableLocationId,
        undefined,
        '良品',
      ],
      [
        items.some((item) => item.defectiveQuantity.greaterThan(0)),
        payload.defectiveLocationId,
        InventoryLocationType.DEFECTIVE_AREA,
        '不良品',
      ],
      [
        items.some((item) => item.supplierClaimQuantity.greaterThan(0)),
        payload.claimLocationId,
        InventoryLocationType.CLAIM_AREA,
        '供应商索赔',
      ],
      [
        items.some((item) => item.scrapQuantity.greaterThan(0)),
        payload.scrapLocationId,
        InventoryLocationType.SCRAP_AREA,
        '报废',
      ],
    ]
    for (const [required, locationId, expectedType, label] of rules) {
      if (!required) continue
      if (!locationId)
        throw new UnprocessableEntityException({
          code: 'DESTINATION_REQUIRED',
          message: `${label}数量大于 0 时必须选择目标地点`,
        })
      const location = await this.prisma.inventoryLocation.findUnique({
        where: { id: locationId },
      })
      if (
        !location ||
        !location.isLeaf ||
        location.status !== MasterDataStatus.ACTIVE ||
        (expectedType && location.type !== expectedType)
      )
        throw new UnprocessableEntityException({
          code: 'DESTINATION_INVALID',
          message: `${label}目标地点类型或状态无效`,
        })
    }
  }

  private validateSettlement(
    claim: { claimedAmount: Prisma.Decimal; settledAmount: Prisma.Decimal },
    claimItem:
      | {
          quantity: Prisma.Decimal
          claimAmount: Prisma.Decimal
          settlements: Array<{
            quantity: Prisma.Decimal | null
            disposeQuantity: Prisma.Decimal | null
            status: DocumentStatus
          }>
        }
      | undefined,
    payload: CreateClaimSettlementDto,
  ) {
    const amount = payload.amount ? decimal(payload.amount, '处理金额', false) : null
    const quantity = payload.quantity ? decimal(payload.quantity, '换货/处理数量', false) : null
    const disposeQuantity = payload.disposeQuantity
      ? decimal(payload.disposeQuantity, '处置数量', false)
      : null
    if (
      (payload.resolutionType === ClaimResolutionType.REPLACEMENT ||
        payload.resolutionType === ClaimResolutionType.SCRAP) &&
      !claimItem
    )
      throw new UnprocessableEntityException({
        code: 'CLAIM_ITEM_REQUIRED',
        message: '换货或索赔品报废必须选择索赔明细',
      })
    if (payload.resolutionType === ClaimResolutionType.REPLACEMENT) {
      if (!quantity || !payload.replacementLocationId || !payload.batchNo?.trim())
        throw new UnprocessableEntityException({
          code: 'REPLACEMENT_FIELDS_REQUIRED',
          message: '换货必须填写数量、入库地点和新批次号',
        })
    }
    if (payload.resolutionType === ClaimResolutionType.SCRAP) {
      if (!quantity || !payload.claimStockLocationId || !payload.scrapLocationId)
        throw new UnprocessableEntityException({
          code: 'SCRAP_FIELDS_REQUIRED',
          message: '索赔品报废必须填写数量、索赔品地点和报废地点',
        })
    }
    if (
      (payload.resolutionType === ClaimResolutionType.CASH_COMPENSATION ||
        payload.resolutionType === ClaimResolutionType.CREDIT_COMPENSATION) &&
      !amount
    )
      throw new UnprocessableEntityException({
        code: 'SETTLEMENT_AMOUNT_REQUIRED',
        message: '现金赔付或下次抵扣必须填写处理金额',
      })
    if (claimItem && quantity) {
      const used = claimItem.settlements
        .filter((settlement) => settlement.status === DocumentStatus.POSTED)
        .reduce(
          (sum, settlement) => sum.plus(settlement.quantity ?? new Prisma.Decimal(0)),
          new Prisma.Decimal(0),
        )
      if (used.plus(quantity).greaterThan(claimItem.quantity))
        throw new UnprocessableEntityException({
          code: 'SETTLEMENT_QUANTITY_EXCEEDED',
          message: '处理数量超过索赔明细剩余数量',
        })
    }
    const proportionalAmount =
      claimItem && quantity
        ? claimItem.claimAmount.mul(quantity).div(claimItem.quantity)
        : new Prisma.Decimal(0)
    const settlementAmount = amount ?? proportionalAmount
    if (claim.settledAmount.plus(settlementAmount).greaterThan(claim.claimedAmount))
      throw new UnprocessableEntityException({
        code: 'SETTLEMENT_AMOUNT_EXCEEDED',
        message: '累计赔付金额不能超过索赔金额',
      })
    return { amount: settlementAmount, quantity, disposeQuantity }
  }

  private async prepareSettlement(
    claimId: string,
    payload: CreateClaimSettlementDto,
    idempotencyKey: string,
    prepared: {
      amount: Prisma.Decimal
      quantity: Prisma.Decimal | null
      disposeQuantity: Prisma.Decimal | null
    },
  ) {
    const scope = `CLAIM_SETTLEMENT_CREATE:${claimId}`
    const hash = requestHash(payload)
    return serializableTransaction(this.prisma, async (transaction) => {
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_key: { scope, key: idempotencyKey } },
      })
      if (existing) {
        if (existing.requestHash !== hash)
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: '相同幂等键已用于不同索赔处理内容',
          })
        return String((existing.responseJson as { settlementId: string }).settlementId)
      }
      if (payload.batchNo) {
        const exists = await transaction.inventoryBatch.findUnique({
          where: { batchNo: payload.batchNo.trim() },
        })
        if (exists)
          throw new ConflictException({ code: 'BATCH_EXISTS', message: '换货批次号已存在' })
      }
      const settlement = await transaction.supplierClaimSettlement.create({
        data: {
          settlementNo: businessNo('SCS'),
          supplierClaimId: claimId,
          supplierClaimItemId: payload.supplierClaimItemId,
          resolutionType: payload.resolutionType,
          quantity: prepared.quantity,
          amount: prepared.amount,
          replacementLocationId: payload.replacementLocationId,
          claimStockLocationId: payload.claimStockLocationId,
          scrapLocationId: payload.scrapLocationId,
          disposeQuantity: prepared.disposeQuantity,
          batchNo: payload.batchNo?.trim(),
          occurredAt: new Date(payload.occurredAt),
          remark: payload.remark,
        },
      })
      await transaction.idempotencyRecord.create({
        data: {
          scope,
          key: idempotencyKey,
          requestHash: hash,
          responseJson: { settlementId: settlement.id },
          statusCode: 201,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      })
      return settlement.id
    })
  }

  private async postInventorySettlement(
    settlement: {
      id: string
      resolutionType: ClaimResolutionType
      quantity: Prisma.Decimal | null
      amount: Prisma.Decimal | null
      batchNo: string | null
      replacementLocationId: string | null
      claimStockLocationId: string | null
      scrapLocationId: string | null
      disposeQuantity: Prisma.Decimal | null
      occurredAt: Date
      supplierClaim: {
        id: string
        supplierId: string
        claimedAmount: Prisma.Decimal
        settledAmount: Prisma.Decimal
      }
      supplierClaimItem: {
        id: string
        qualityIssue: {
          skuId: string
          qualityInspectionItem: { salesReturnItem: { unitCost: Prisma.Decimal } }
        }
      } | null
    },
    idempotencyKey: string,
    actor: AuthUser,
    requestId?: string,
  ) {
    const item = settlement.supplierClaimItem!
    const unitCost = item.qualityIssue.qualityInspectionItem.salesReturnItem.unitCost
    const lines: PostingLineInput[] = []
    if (settlement.resolutionType === ClaimResolutionType.REPLACEMENT) {
      lines.push({
        locationId: settlement.replacementLocationId!,
        skuId: item.qualityIssue.skuId,
        stockStatus: InventoryStockStatus.AVAILABLE,
        quantity: settlement.quantity!,
        unitCost,
        allocateBatches: false,
        remark: '供应商换货补发，无采购应付',
      })
      if (settlement.disposeQuantity?.greaterThan(0)) {
        if (!settlement.claimStockLocationId || !settlement.scrapLocationId)
          throw new UnprocessableEntityException({
            code: 'DISPOSAL_LOCATION_REQUIRED',
            message: '换货同时报废原索赔品时必须选择索赔品和报废地点',
          })
        lines.push(
          {
            locationId: settlement.claimStockLocationId,
            skuId: item.qualityIssue.skuId,
            stockStatus: InventoryStockStatus.SUPPLIER_CLAIM,
            quantity: settlement.disposeQuantity.negated(),
            allocateBatches: false,
            costGroup: settlement.id,
          },
          {
            locationId: settlement.scrapLocationId,
            skuId: item.qualityIssue.skuId,
            stockStatus: InventoryStockStatus.SCRAPPED,
            quantity: settlement.disposeQuantity,
            allocateBatches: false,
            costGroup: settlement.id,
          },
        )
      }
    } else {
      lines.push(
        {
          locationId: settlement.claimStockLocationId!,
          skuId: item.qualityIssue.skuId,
          stockStatus: InventoryStockStatus.SUPPLIER_CLAIM,
          quantity: settlement.quantity!.negated(),
          allocateBatches: false,
          costGroup: settlement.id,
        },
        {
          locationId: settlement.scrapLocationId!,
          skuId: item.qualityIssue.skuId,
          stockStatus: InventoryStockStatus.SCRAPPED,
          quantity: settlement.quantity!,
          allocateBatches: false,
          costGroup: settlement.id,
        },
      )
    }
    await this.posting.post(
      {
        scope: `CLAIM_SETTLEMENT:${settlement.id}`,
        idempotencyKey,
        type:
          settlement.resolutionType === ClaimResolutionType.REPLACEMENT
            ? InventoryTransactionType.SUPPLIER_REPLACEMENT
            : InventoryTransactionType.SCRAP,
        occurredAt: settlement.occurredAt,
        sourceType: 'SupplierClaimSettlement',
        sourceId: settlement.id,
        lines,
        batches:
          settlement.resolutionType === ClaimResolutionType.REPLACEMENT
            ? [
                {
                  batchNo: settlement.batchNo!,
                  skuId: item.qualityIssue.skuId,
                  supplierId: settlement.supplierClaim.supplierId,
                  quantity: settlement.quantity!,
                  unitCost,
                },
              ]
            : undefined,
        finalize: async (transaction, result) => {
          const locked = await transaction.supplierClaimSettlement.findUnique({
            where: { id: settlement.id },
          })
          if (!locked || locked.status !== DocumentStatus.DRAFT)
            throw new ConflictException({ code: 'SETTLEMENT_POSTED', message: '索赔处理已过账' })
          await transaction.supplierClaimSettlement.update({
            where: { id: settlement.id },
            data: {
              status: DocumentStatus.POSTED,
              inventoryTransactionId: result.transactionId,
              postedAt: new Date(result.postedAt),
            },
          })
          await this.applyClaimSettlement(
            transaction,
            settlement.supplierClaim,
            settlement.amount ?? new Prisma.Decimal(0),
            settlement.resolutionType,
          )
        },
      },
      actor,
      requestId,
    )
  }

  private async postNonInventorySettlement(
    settlement: {
      id: string
      resolutionType: ClaimResolutionType
      amount: Prisma.Decimal | null
      occurredAt: Date
      supplierClaim: {
        id: string
        supplierId: string
        claimedAmount: Prisma.Decimal
        settledAmount: Prisma.Decimal
      }
    },
    actor: AuthUser,
    requestId?: string,
  ) {
    await serializableTransaction(this.prisma, async (transaction) => {
      const locked = await transaction.supplierClaimSettlement.findUnique({
        where: { id: settlement.id },
      })
      if (!locked || locked.status !== DocumentStatus.DRAFT) return
      const amount = settlement.amount ?? new Prisma.Decimal(0)
      if (settlement.resolutionType === ClaimResolutionType.CASH_COMPENSATION) {
        await transaction.supplierCompensationReceivable.create({
          data: {
            receivableNo: businessNo('SCR'),
            supplierId: settlement.supplierClaim.supplierId,
            supplierClaimSettlementId: settlement.id,
            originalAmount: amount,
            outstandingAmount: amount,
            occurredAt: settlement.occurredAt,
          },
        })
      }
      if (settlement.resolutionType === ClaimResolutionType.CREDIT_COMPENSATION) {
        await transaction.supplierCredit.create({
          data: {
            creditNo: businessNo('SC'),
            supplierId: settlement.supplierClaim.supplierId,
            supplierClaimSettlementId: settlement.id,
            amount,
          },
        })
      }
      await transaction.supplierClaimSettlement.update({
        where: { id: settlement.id },
        data: { status: DocumentStatus.POSTED, postedAt: new Date() },
      })
      await this.applyClaimSettlement(
        transaction,
        settlement.supplierClaim,
        amount,
        settlement.resolutionType,
      )
    })
    await this.audit.record({
      userId: actor.id,
      module: 'QUALITY',
      action: 'SETTLE_CLAIM',
      entityType: 'SupplierClaimSettlement',
      entityId: settlement.id,
      after: { resolutionType: settlement.resolutionType, amount: settlement.amount },
      requestId,
    })
  }

  private async applyClaimSettlement(
    transaction: Prisma.TransactionClient,
    claim: { id: string; claimedAmount: Prisma.Decimal; settledAmount: Prisma.Decimal },
    amount: Prisma.Decimal,
    resolutionType: ClaimResolutionType,
  ) {
    const settledAmount = claim.settledAmount.plus(amount)
    let status: SupplierClaimStatus
    if (resolutionType === ClaimResolutionType.REJECTED) status = SupplierClaimStatus.REJECTED
    else if (
      resolutionType === ClaimResolutionType.SELF_BEAR ||
      resolutionType === ClaimResolutionType.SCRAP
    )
      status = SupplierClaimStatus.CLOSED
    else
      status = settledAmount.greaterThanOrEqualTo(claim.claimedAmount)
        ? SupplierClaimStatus.SETTLED
        : SupplierClaimStatus.PARTIALLY_SETTLED
    await transaction.supplierClaim.update({
      where: { id: claim.id },
      data: {
        settledAmount,
        status,
        ...(status === SupplierClaimStatus.SETTLED ||
        status === SupplierClaimStatus.REJECTED ||
        status === SupplierClaimStatus.CLOSED
          ? { closedAt: new Date() }
          : {}),
      },
    })
    if (
      status === SupplierClaimStatus.SETTLED ||
      status === SupplierClaimStatus.REJECTED ||
      status === SupplierClaimStatus.CLOSED
    ) {
      await transaction.qualityIssue.updateMany({
        where: { claimItem: { supplierClaimId: claim.id } },
        data: { status: QualityIssueStatus.RESOLVED },
      })
    }
  }

  private assertSort(sortBy: string, whitelist: readonly string[]) {
    if (!whitelist.includes(sortBy))
      throw new BadRequestException({ code: 'SORT_INVALID', message: '排序字段不在白名单中' })
  }
}

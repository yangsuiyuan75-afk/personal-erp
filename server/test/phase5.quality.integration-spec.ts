import {
  ClaimResolutionType,
  DocumentStatus,
  InventoryLocationType,
  InventoryStockStatus,
  PrismaClient,
  QualityInspectionStatus,
  QualityResponsibility,
  SupplierClaimStatus,
} from '@prisma/client'
import { PrismaService } from '../src/database/prisma.service'
import { AuditService } from '../src/modules/audit/audit.service'
import { InventoryPostingService } from '../src/modules/inventory/inventory-posting.service'
import { PurchaseService } from '../src/modules/purchase/purchase.service'
import { QualityService } from '../src/modules/quality/quality.service'
import { SalesService } from '../src/modules/sales/sales.service'
import { cleanDatabase } from './database-cleanup'

describe('Phase 5 quality and supplier claim integration', () => {
  const prisma = new PrismaService()
  const audit = new AuditService(prisma)
  const posting = new InventoryPostingService(prisma, audit)
  const purchase = new PurchaseService(prisma, posting, audit)
  const sales = new SalesService(prisma, posting, audit)
  const quality = new QualityService(prisma, posting, audit)
  let actor: { id: string; username: string }
  let supplierId: string
  let skuId: string
  let mainLocationId: string
  let qcLocationId: string
  let claimLocationId: string
  let scrapLocationId: string
  let salesReturnId: string
  let salesReturnItemId: string

  beforeAll(async () => {
    await prisma.$connect()
    await cleanDatabase(prisma as PrismaClient)
    const user = await prisma.adminUser.create({
      data: { username: 'quality-integration', passwordHash: 'not-used' },
    })
    actor = { id: user.id, username: user.username }
    const [category, unit, purchaseChannel] = await Promise.all([
      prisma.category.create({ data: { code: 'QC-CAT', name: '质量分类' } }),
      prisma.unit.create({ data: { code: 'QC-PCS', name: '件' } }),
      prisma.purchaseChannel.create({
        data: { code: 'QC-1688', name: '质量采购渠道', type: 'PLATFORM' },
      }),
    ])
    const [supplier, buyer, product] = await Promise.all([
      prisma.supplier.create({
        data: { code: 'QC-SUP', name: '质量供应商', purchaseChannelId: purchaseChannel.id },
      }),
      prisma.buyer.create({ data: { code: 'QC-BUY', name: '质量采购员' } }),
      prisma.product.create({
        data: { code: 'QC-PROD', name: '质量商品', categoryId: category.id },
      }),
    ])
    supplierId = supplier.id
    const sku = await prisma.sku.create({
      data: {
        code: 'QC-SKU',
        barcode: 'QC-0001',
        name: '质量测试 SKU',
        productId: product.id,
        baseUnitId: unit.id,
      },
    })
    skuId = sku.id
    const [main, qc, claim, scrap] = await Promise.all([
      prisma.inventoryLocation.create({
        data: { code: 'QC-MAIN', name: '主仓', type: InventoryLocationType.PHYSICAL_WAREHOUSE },
      }),
      prisma.inventoryLocation.create({
        data: { code: 'QC-PENDING', name: '待质检区', type: InventoryLocationType.QC_AREA },
      }),
      prisma.inventoryLocation.create({
        data: { code: 'QC-CLAIM', name: '供应商索赔区', type: InventoryLocationType.CLAIM_AREA },
      }),
      prisma.inventoryLocation.create({
        data: { code: 'QC-SCRAP', name: '报废区', type: InventoryLocationType.SCRAP_AREA },
      }),
    ])
    mainLocationId = main.id
    qcLocationId = qc.id
    claimLocationId = claim.id
    scrapLocationId = scrap.id

    const purchaseOrder = await purchase.createOrder(
      {
        supplierId: supplier.id,
        buyerId: buyer.id,
        purchaseChannelId: purchaseChannel.id,
        currency: 'CNY',
        orderDate: '2026-07-01T00:00:00.000Z',
        items: [{ skuId: sku.id, quantity: '10', unitPrice: '10' }],
      },
      actor,
    )
    await purchase.confirmOrder(purchaseOrder.id, actor)
    const receipt = await purchase.createReceipt(
      {
        purchaseOrderId: purchaseOrder.id,
        locationId: main.id,
        occurredAt: '2026-07-02T00:00:00.000Z',
        items: [
          {
            purchaseOrderItemId: purchaseOrder.items[0].id,
            quantity: '10',
            batchNo: 'QC-PUR-BATCH',
          },
        ],
      },
      actor,
    )
    await purchase.postReceipt(receipt.id, 'qc-purchase-receipt', actor)
    const channel = await prisma.salesChannel.create({
      data: { code: 'QC-SALES', name: '质量销售渠道', inventoryMode: 'DIRECT_FROM_LOCATION' },
    })
    const customer = await prisma.customer.create({
      data: { code: 'QC-CUS', name: '质量客户', defaultSalesChannelId: channel.id },
    })
    const salesOrder = await sales.createOrder(
      {
        salesChannelId: channel.id,
        customerId: customer.id,
        currency: 'CNY',
        orderDate: '2026-07-10T00:00:00.000Z',
        items: [{ skuId: sku.id, quantity: '5', unitPrice: '20' }],
      },
      actor,
    )
    await sales.confirmOrder(salesOrder.id, actor)
    const issue = await sales.createIssue(
      {
        salesOrderId: salesOrder.id,
        locationId: main.id,
        occurredAt: '2026-07-11T00:00:00.000Z',
        items: [{ salesOrderItemId: salesOrder.items[0].id, quantity: '5' }],
      },
      actor,
    )
    await sales.postIssue(issue.id, 'qc-sales-issue', actor)
    const returned = await sales.createReturn(
      {
        salesIssueId: issue.id,
        qcLocationId: qc.id,
        occurredAt: '2026-07-12T00:00:00.000Z',
        reason: '批量质量异常',
        items: [{ salesIssueItemId: issue.items[0].id, quantity: '5' }],
      },
      actor,
    )
    await sales.postReturn(returned.id, 'qc-sales-return', actor)
    salesReturnId = returned.id
    salesReturnItemId = returned.items[0].id
  })

  afterAll(async () => {
    await cleanDatabase(prisma as PrismaClient)
    await prisma.$disconnect()
  })

  it('enforces inspection conservation and routes all quantities out of QC_PENDING', async () => {
    await expect(
      quality.createInspection(
        {
          salesReturnId,
          inspectedAt: '2026-07-13T00:00:00.000Z',
          items: [
            {
              salesReturnItemId,
              goodQuantity: '1',
              defectiveQuantity: '0',
              supplierClaimQuantity: '2',
              scrapQuantity: '1',
              responsibility: QualityResponsibility.SUPPLIER,
              supplierId,
              defectDescription: '材料开裂',
            },
          ],
        },
        actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'INSPECTION_QUANTITY_MISMATCH' } })

    const inspection = await quality.createInspection(
      {
        salesReturnId,
        inspectedAt: '2026-07-13T00:00:00.000Z',
        notes: '按供应商批次判断',
        items: [
          {
            salesReturnItemId,
            goodQuantity: '1',
            defectiveQuantity: '0',
            supplierClaimQuantity: '3',
            scrapQuantity: '1',
            responsibility: QualityResponsibility.SUPPLIER,
            supplierId,
            defectDescription: '材料开裂',
          },
        ],
      },
      actor,
    )
    await quality.confirmInspection(
      inspection.id,
      {
        availableLocationId: mainLocationId,
        claimLocationId,
        scrapLocationId,
      },
      'qc-inspection-confirm',
      actor,
    )
    const [saved, qcBalance, mainBalance, claimBalance, scrapBalance, issue, claim, batch] =
      await Promise.all([
        prisma.qualityInspection.findUniqueOrThrow({ where: { id: inspection.id } }),
        prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            locationId_skuId_stockStatus: {
              locationId: qcLocationId,
              skuId,
              stockStatus: InventoryStockStatus.QC_PENDING,
            },
          },
        }),
        prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            locationId_skuId_stockStatus: {
              locationId: mainLocationId,
              skuId,
              stockStatus: InventoryStockStatus.AVAILABLE,
            },
          },
        }),
        prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            locationId_skuId_stockStatus: {
              locationId: claimLocationId,
              skuId,
              stockStatus: InventoryStockStatus.SUPPLIER_CLAIM,
            },
          },
        }),
        prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            locationId_skuId_stockStatus: {
              locationId: scrapLocationId,
              skuId,
              stockStatus: InventoryStockStatus.SCRAPPED,
            },
          },
        }),
        prisma.qualityIssue.findFirstOrThrow(),
        prisma.supplierClaim.findFirstOrThrow({ include: { items: true } }),
        prisma.inventoryBatch.findUniqueOrThrow({ where: { batchNo: 'QC-PUR-BATCH' } }),
      ])
    expect(saved.status).toBe(QualityInspectionStatus.CONFIRMED)
    expect(qcBalance.onHandQuantity.toString()).toBe('0')
    expect(mainBalance.onHandQuantity.toString()).toBe('6')
    expect(claimBalance.onHandQuantity.toString()).toBe('3')
    expect(scrapBalance.onHandQuantity.toString()).toBe('1')
    expect(batch.remainingQuantity.toString()).toBe('6')
    expect(issue.quantity.toString()).toBe('4')
    expect(issue.estimatedLoss.toString()).toBe('40')
    expect(claim.claimedAmount.toString()).toBe('30')
    expect(claim.items[0].quantity.toString()).toBe('3')
  })

  it('posts replacement without payable and disposes original claim stock', async () => {
    const claim = await prisma.supplierClaim.findFirstOrThrow({ include: { items: true } })
    const payablesBefore = await prisma.payable.count()
    const settlement = await quality.settleClaim(
      claim.id,
      {
        resolutionType: ClaimResolutionType.REPLACEMENT,
        supplierClaimItemId: claim.items[0].id,
        quantity: '1',
        replacementLocationId: mainLocationId,
        batchNo: 'QC-REPLACEMENT-BATCH',
        claimStockLocationId: claimLocationId,
        scrapLocationId,
        disposeQuantity: '3',
        occurredAt: '2026-07-14T00:00:00.000Z',
      },
      'qc-claim-replacement',
      actor,
    )
    const [savedClaim, mainBalance, claimBalance, scrapBalance, replacementBatch] =
      await Promise.all([
        prisma.supplierClaim.findUniqueOrThrow({ where: { id: claim.id } }),
        prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            locationId_skuId_stockStatus: {
              locationId: mainLocationId,
              skuId,
              stockStatus: InventoryStockStatus.AVAILABLE,
            },
          },
        }),
        prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            locationId_skuId_stockStatus: {
              locationId: claimLocationId,
              skuId,
              stockStatus: InventoryStockStatus.SUPPLIER_CLAIM,
            },
          },
        }),
        prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            locationId_skuId_stockStatus: {
              locationId: scrapLocationId,
              skuId,
              stockStatus: InventoryStockStatus.SCRAPPED,
            },
          },
        }),
        prisma.inventoryBatch.findUniqueOrThrow({ where: { batchNo: 'QC-REPLACEMENT-BATCH' } }),
      ])
    expect(settlement.status).toBe(DocumentStatus.POSTED)
    expect(savedClaim.status).toBe(SupplierClaimStatus.PARTIALLY_SETTLED)
    expect(savedClaim.settledAmount.toString()).toBe('10')
    expect(mainBalance.onHandQuantity.toString()).toBe('7')
    expect(claimBalance.onHandQuantity.toString()).toBe('0')
    expect(scrapBalance.onHandQuantity.toString()).toBe('4')
    expect(replacementBatch.supplierId).toBe(supplierId)
    expect(await prisma.payable.count()).toBe(payablesBefore)
  })

  it('records cash compensation and next-purchase credit without faking cash flow', async () => {
    const claim = await prisma.supplierClaim.findFirstOrThrow()
    const cashPayload = {
      resolutionType: ClaimResolutionType.CASH_COMPENSATION,
      amount: '10',
      occurredAt: '2026-07-15T00:00:00.000Z',
    }
    const cash = await quality.settleClaim(claim.id, cashPayload, 'qc-claim-cash', actor)
    const repeated = await quality.settleClaim(claim.id, cashPayload, 'qc-claim-cash', actor)
    expect(repeated.id).toBe(cash.id)
    const compensation = await prisma.supplierCompensationReceivable.findUniqueOrThrow({
      where: { supplierClaimSettlementId: cash.id },
    })
    expect(compensation.outstandingAmount.toString()).toBe('10')
    expect(await prisma.supplierCompensationReceivable.count()).toBe(1)

    const creditPayload = {
      resolutionType: ClaimResolutionType.CREDIT_COMPENSATION,
      amount: '10',
      occurredAt: '2026-07-16T00:00:00.000Z',
    }
    const credit = await quality.settleClaim(claim.id, creditPayload, 'qc-claim-credit', actor)
    const repeatedClosedClaim = await quality.settleClaim(
      claim.id,
      creditPayload,
      'qc-claim-credit',
      actor,
    )
    const [supplierCredit, savedClaim] = await Promise.all([
      prisma.supplierCredit.findUniqueOrThrow({
        where: { supplierClaimSettlementId: credit.id },
      }),
      prisma.supplierClaim.findUniqueOrThrow({ where: { id: claim.id } }),
    ])
    expect(supplierCredit.amount.toString()).toBe('10')
    expect(supplierCredit.purchaseReturnId).toBeNull()
    expect(savedClaim.status).toBe(SupplierClaimStatus.SETTLED)
    expect(savedClaim.settledAmount.toString()).toBe('30')
    expect(repeatedClosedClaim.id).toBe(credit.id)
  })
})

import {
  ChannelInventoryMode,
  DocumentStatus,
  InventoryLocationType,
  InventoryStockStatus,
  InventoryTransactionType,
  PrismaClient,
  SalesOrderStatus,
} from '@prisma/client'
import { PrismaService } from '../src/database/prisma.service'
import { AuditService } from '../src/modules/audit/audit.service'
import { InventoryPostingService } from '../src/modules/inventory/inventory-posting.service'
import { SalesService } from '../src/modules/sales/sales.service'
import { cleanDatabase } from './database-cleanup'

describe('Phase 4 sales integration', () => {
  const prisma = new PrismaService()
  const audit = new AuditService(prisma)
  const posting = new InventoryPostingService(prisma, audit)
  const sales = new SalesService(prisma, posting, audit)
  let actor: { id: string; username: string }
  let channelId: string
  let customerId: string
  let skuId: string
  let locationId: string
  let qcLocationId: string

  beforeAll(async () => {
    await prisma.$connect()
    await cleanDatabase(prisma as PrismaClient)
    const user = await prisma.adminUser.create({
      data: { username: 'sales-integration', passwordHash: 'not-used' },
    })
    actor = { id: user.id, username: user.username }
    const [category, unit] = await Promise.all([
      prisma.category.create({ data: { code: 'SAL-CAT', name: '销售分类' } }),
      prisma.unit.create({ data: { code: 'SAL-PCS', name: '件' } }),
    ])
    const product = await prisma.product.create({
      data: { code: 'SAL-PROD', name: '销售商品', categoryId: category.id },
    })
    const sku = await prisma.sku.create({
      data: {
        code: 'SKU-SAL',
        barcode: 'SAL-0001',
        name: '销售测试 SKU',
        productId: product.id,
        baseUnitId: unit.id,
      },
    })
    skuId = sku.id
    const channel = await prisma.salesChannel.create({
      data: {
        code: 'SAL-VIRTUAL',
        name: '虚拟额度渠道',
        inventoryMode: ChannelInventoryMode.VIRTUAL_ALLOCATION,
      },
    })
    channelId = channel.id
    const customer = await prisma.customer.create({
      data: {
        code: 'CUS-SAL',
        name: '销售客户',
        defaultSalesChannelId: channel.id,
      },
    })
    customerId = customer.id
    const [location, qcLocation] = await Promise.all([
      prisma.inventoryLocation.create({
        data: {
          code: 'SAL-MAIN',
          name: '销售主仓',
          type: InventoryLocationType.PHYSICAL_WAREHOUSE,
        },
      }),
      prisma.inventoryLocation.create({
        data: { code: 'SAL-QC', name: '销售退货待检区', type: InventoryLocationType.QC_AREA },
      }),
    ])
    locationId = location.id
    qcLocationId = qcLocation.id
    await prisma.channelAllocation.create({
      data: {
        allocationNo: 'SAL-ALLOC-001',
        salesChannelId: channel.id,
        locationId: location.id,
        items: { create: { skuId: sku.id, quantity: 8 } },
      },
    })
    await posting.post(
      {
        scope: 'SALES_TEST_OPENING',
        idempotencyKey: 'sales-opening',
        type: InventoryTransactionType.OPENING_IN,
        occurredAt: new Date('2026-07-01T00:00:00.000Z'),
        sourceType: 'SalesTestOpening',
        sourceId: 'sales-test-opening',
        lines: [
          {
            locationId: location.id,
            skuId: sku.id,
            stockStatus: InventoryStockStatus.AVAILABLE,
            quantity: '10',
            unitCost: '10',
          },
        ],
        batches: [{ batchNo: 'SAL-BATCH-001', skuId: sku.id, quantity: '10', unitCost: '10' }],
      },
      actor,
    )
  })

  afterAll(async () => {
    await cleanDatabase(prisma as PrismaClient)
    await prisma.$disconnect()
  })

  it('resolves customer, channel and default prices in priority order and snapshots the order', async () => {
    await sales.createPrice(
      {
        skuId,
        currency: 'CNY',
        price: '30',
        minQuantity: '1',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
      },
      actor,
    )
    await sales.createPrice(
      {
        skuId,
        salesChannelId: channelId,
        currency: 'CNY',
        price: '25',
        minQuantity: '1',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
      },
      actor,
    )
    await sales.createPrice(
      {
        skuId,
        salesChannelId: channelId,
        customerId,
        currency: 'CNY',
        price: '20',
        minQuantity: '1',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
      },
      actor,
    )
    const resolved = await sales.resolvePrice({
      skuId,
      salesChannelId: channelId,
      customerId,
      quantity: '4',
      at: '2026-07-16T00:00:00.000Z',
    })
    expect(resolved.price.toString()).toBe('20')
    const order = await sales.createOrder(
      {
        salesChannelId: channelId,
        customerId,
        currency: 'CNY',
        orderDate: '2026-07-16T00:00:00.000Z',
        items: [{ skuId, quantity: '4' }],
      },
      actor,
    )
    await sales.confirmOrder(order.id, actor)
    const saved = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    })
    expect(saved.status).toBe(SalesOrderStatus.CONFIRMED)
    expect(saved.items[0].unitPrice.toString()).toBe('20')
  })

  it('posts FIFO issue, consumes virtual quota and creates a moving-cost receivable', async () => {
    const order = await prisma.salesOrder.findFirstOrThrow({
      where: { status: SalesOrderStatus.CONFIRMED },
      include: { items: true },
    })
    const issue = await sales.createIssue(
      {
        salesOrderId: order.id,
        locationId,
        occurredAt: '2026-07-16T01:00:00.000Z',
        items: [{ salesOrderItemId: order.items[0].id, quantity: '4' }],
      },
      actor,
    )
    await sales.postIssue(issue.id, 'sales-issue-1', actor)
    const [savedIssue, balance, batch, allocation, receivable] = await Promise.all([
      prisma.salesIssue.findUniqueOrThrow({ where: { id: issue.id }, include: { items: true } }),
      prisma.inventoryBalance.findUniqueOrThrow({
        where: {
          locationId_skuId_stockStatus: {
            locationId,
            skuId,
            stockStatus: InventoryStockStatus.AVAILABLE,
          },
        },
      }),
      prisma.inventoryBatch.findUniqueOrThrow({ where: { batchNo: 'SAL-BATCH-001' } }),
      prisma.channelAllocationItem.findFirstOrThrow({ where: { skuId } }),
      prisma.receivable.findFirstOrThrow({ where: { sourceId: issue.id } }),
    ])
    expect(savedIssue.status).toBe(DocumentStatus.POSTED)
    expect(savedIssue.totalCost.toString()).toBe('40')
    expect(savedIssue.items[0].unitCost.toString()).toBe('10')
    expect(balance.onHandQuantity.toString()).toBe('6')
    expect(batch.remainingQuantity.toString()).toBe('6')
    expect(allocation.consumedQuantity.toString()).toBe('4')
    expect(receivable.outstandingAmount.toString()).toBe('80')
  })

  it('receives a return into QC_PENDING, preserves batch trace and adjusts receivable', async () => {
    const issue = await prisma.salesIssue.findFirstOrThrow({
      where: { status: DocumentStatus.POSTED },
      include: { items: true },
    })
    const returned = await sales.createReturn(
      {
        salesIssueId: issue.id,
        qcLocationId,
        occurredAt: '2026-07-16T02:00:00.000Z',
        reason: '客户反馈外观损坏',
        items: [{ salesIssueItemId: issue.items[0].id, quantity: '1' }],
      },
      actor,
    )
    await sales.postReturn(returned.id, 'sales-return-1', actor)
    const [qcBalance, availableBalance, trace, receivable, savedReturn] = await Promise.all([
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
            locationId,
            skuId,
            stockStatus: InventoryStockStatus.AVAILABLE,
          },
        },
      }),
      prisma.salesReturnBatchTrace.findFirstOrThrow({ include: { batch: true } }),
      prisma.receivable.findFirstOrThrow({ where: { sourceId: issue.id } }),
      prisma.salesReturn.findUniqueOrThrow({ where: { id: returned.id } }),
    ])
    expect(savedReturn.status).toBe(DocumentStatus.POSTED)
    expect(qcBalance.onHandQuantity.toString()).toBe('1')
    expect(availableBalance.onHandQuantity.toString()).toBe('6')
    expect(trace.batch.batchNo).toBe('SAL-BATCH-001')
    expect(receivable.outstandingAmount.toString()).toBe('60')
  })

  it('rejects treating an external platform warehouse as a virtual quantity', async () => {
    const externalChannel = await prisma.salesChannel.create({
      data: {
        code: 'SAL-EXT',
        name: '真实平台仓渠道',
        inventoryMode: ChannelInventoryMode.EXTERNAL_WAREHOUSE,
      },
    })
    const order = await sales.createOrder(
      {
        salesChannelId: externalChannel.id,
        currency: 'CNY',
        orderDate: '2026-07-16T03:00:00.000Z',
        items: [{ skuId, quantity: '1', unitPrice: '22' }],
      },
      actor,
    )
    await sales.confirmOrder(order.id, actor)
    await expect(
      sales.createIssue(
        {
          salesOrderId: order.id,
          locationId,
          occurredAt: '2026-07-16T03:30:00.000Z',
          items: [{ salesOrderItemId: order.items[0].id, quantity: '1' }],
        },
        actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'CHANNEL_WAREHOUSE_INVALID' } })
  })
})

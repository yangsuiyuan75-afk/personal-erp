import {
  DocumentStatus,
  InventoryLocationType,
  InventoryStockStatus,
  PayableStatus,
  PrismaClient,
  PurchaseOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { InventoryPostingService } from '../src/modules/inventory/inventory-posting.service';
import { PurchaseService } from '../src/modules/purchase/purchase.service';
import { cleanDatabase } from './database-cleanup';

describe('Phase 3 purchase integration', () => {
  const prisma = new PrismaService();
  const audit = new AuditService(prisma);
  const posting = new InventoryPostingService(prisma, audit);
  const purchase = new PurchaseService(prisma, posting, audit);
  let actor: { id: string; username: string };
  let supplierId: string;
  let buyerId: string;
  let channelId: string;
  let skuId: string;
  let locationId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDatabase(prisma as PrismaClient);
    const user = await prisma.adminUser.create({
      data: { username: 'purchase-integration', passwordHash: 'not-used' },
    });
    actor = { id: user.id, username: user.username };
    const [category, unit, channel] = await Promise.all([
      prisma.category.create({ data: { code: 'PUR-CAT', name: '采购分类' } }),
      prisma.unit.create({ data: { code: 'PUR-PCS', name: '件' } }),
      prisma.purchaseChannel.create({ data: { code: '1688', name: '1688', type: 'PLATFORM' } }),
    ]);
    channelId = channel.id;
    const [supplier, buyer, product] = await Promise.all([
      prisma.supplier.create({
        data: { code: 'SUP-P3', name: '测试供应商', purchaseChannelId: channel.id },
      }),
      prisma.buyer.create({ data: { code: 'BUY-P3', name: '测试采购员' } }),
      prisma.product.create({
        data: { code: 'PROD-P3', name: '采购商品', categoryId: category.id },
      }),
    ]);
    supplierId = supplier.id;
    buyerId = buyer.id;
    const sku = await prisma.sku.create({
      data: {
        code: 'SKU-P3',
        barcode: 'P3-0001',
        name: '采购测试 SKU',
        productId: product.id,
        baseUnitId: unit.id,
      },
    });
    skuId = sku.id;
    const location = await prisma.inventoryLocation.create({
      data: {
        code: 'PUR-MAIN',
        name: '采购主仓',
        type: InventoryLocationType.PHYSICAL_WAREHOUSE,
      },
    });
    locationId = location.id;
  });

  afterAll(async () => {
    await cleanDatabase(prisma as PrismaClient);
    await prisma.$disconnect();
  });

  it('keeps quote periods non-overlapping and snapshots the order price', async () => {
    const price = await purchase.createPrice(
      {
        skuId,
        supplierId,
        buyerId,
        purchaseChannelId: channelId,
        currency: 'CNY',
        price: '10',
        minQuantity: '1',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
      },
      actor,
    );
    await expect(
      purchase.createPrice(
        {
          skuId,
          supplierId,
          buyerId,
          purchaseChannelId: channelId,
          currency: 'CNY',
          price: '9',
          minQuantity: '10',
          effectiveFrom: '2026-07-10T00:00:00.000Z',
        },
        actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'PRICE_PERIOD_OVERLAP' } });

    const order = await purchase.createOrder(
      {
        supplierId,
        buyerId,
        purchaseChannelId: channelId,
        currency: 'CNY',
        orderDate: '2026-07-16T00:00:00.000Z',
        items: [{ skuId, quantity: '10', unitPrice: '10' }],
      },
      actor,
    );
    await purchase.confirmOrder(order.id, actor);
    await purchase.updatePrice(price.id, { price: '12' }, actor);
    const savedOrder = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(savedOrder.status).toBe(PurchaseOrderStatus.CONFIRMED);
    expect(savedOrder.items[0].unitPrice.toString()).toBe('10');
  });

  it('supports partial receipts, inventory batches, moving cost and payables', async () => {
    const order = await prisma.purchaseOrder.findFirstOrThrow({
      where: { status: PurchaseOrderStatus.CONFIRMED },
      include: { items: true },
    });
    const first = await purchase.createReceipt(
      {
        purchaseOrderId: order.id,
        locationId,
        occurredAt: '2026-07-16T01:00:00.000Z',
        items: [{ purchaseOrderItemId: order.items[0].id, quantity: '6', batchNo: 'P3-BATCH-001' }],
      },
      actor,
    );
    await purchase.postReceipt(first.id, 'p3-receipt-1', actor);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
    );

    const second = await purchase.createReceipt(
      {
        purchaseOrderId: order.id,
        locationId,
        occurredAt: '2026-07-16T02:00:00.000Z',
        items: [{ purchaseOrderItemId: order.items[0].id, quantity: '4', batchNo: 'P3-BATCH-002' }],
      },
      actor,
    );
    await purchase.postReceipt(second.id, 'p3-receipt-2', actor);
    const [savedOrder, balance, payables, batches] = await Promise.all([
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.inventoryBalance.findUniqueOrThrow({
        where: {
          locationId_skuId_stockStatus: {
            locationId,
            skuId,
            stockStatus: InventoryStockStatus.AVAILABLE,
          },
        },
      }),
      prisma.payable.findMany({ orderBy: { occurredAt: 'asc' } }),
      prisma.inventoryBatch.findMany({ orderBy: { receivedAt: 'asc' } }),
    ]);
    expect(savedOrder.status).toBe(PurchaseOrderStatus.RECEIVED);
    expect(balance.onHandQuantity.toString()).toBe('10');
    expect(balance.averageCost.toString()).toBe('10');
    expect(payables.map((payable) => payable.originalAmount.toString())).toEqual(['60', '40']);
    expect(batches.map((batch) => batch.batchNo)).toEqual(['P3-BATCH-001', 'P3-BATCH-002']);
  });

  it('returns the exact purchase batch and creates supplier credit when already paid', async () => {
    const receipt = await prisma.purchaseReceipt.findFirstOrThrow({
      where: { receiptNo: { not: '' } },
      orderBy: { occurredAt: 'asc' },
      include: { items: true, payable: true },
    });
    await prisma.payable.update({
      where: { id: receipt.payable!.id },
      data: {
        paidAmount: receipt.totalAmount,
        outstandingAmount: 0,
        status: PayableStatus.SETTLED,
      },
    });
    const sourceBatch = await prisma.inventoryBatch.findUniqueOrThrow({
      where: { batchNo: receipt.items[0].batchNo },
    });
    expect(sourceBatch.remainingQuantity.toString()).toBe('6');
    const returned = await purchase.createReturn(
      {
        purchaseReceiptId: receipt.id,
        locationId,
        occurredAt: '2026-07-16T03:00:00.000Z',
        reason: '供应商批次质量问题',
        items: [{ purchaseReceiptItemId: receipt.items[0].id, quantity: '2' }],
      },
      actor,
    );
    const returnLine = await prisma.purchaseReturnItem.findFirstOrThrow({
      where: { purchaseReturnId: returned.id },
      include: { purchaseReceiptItem: true },
    });
    expect(returnLine.purchaseReceiptItem.batchNo).toBe(receipt.items[0].batchNo);
    expect(returnLine.skuId).toBe(sourceBatch.skuId);
    expect(
      await prisma.inventoryBatch.count({
        where: {
          skuId: returnLine.skuId,
          batchNo: returnLine.purchaseReceiptItem.batchNo,
          remainingQuantity: { gt: 0 },
        },
      }),
    ).toBe(1);
    await purchase.postReturn(returned.id, 'p3-return-1', actor);
    const [savedReturn, credit, batch, balance] = await Promise.all([
      prisma.purchaseReturn.findUniqueOrThrow({ where: { id: returned.id } }),
      prisma.supplierCredit.findUniqueOrThrow({ where: { purchaseReturnId: returned.id } }),
      prisma.inventoryBatch.findUniqueOrThrow({ where: { batchNo: 'P3-BATCH-001' } }),
      prisma.inventoryBalance.findUniqueOrThrow({
        where: {
          locationId_skuId_stockStatus: {
            locationId,
            skuId,
            stockStatus: InventoryStockStatus.AVAILABLE,
          },
        },
      }),
    ]);
    expect(savedReturn.status).toBe(DocumentStatus.POSTED);
    expect(credit.amount.toString()).toBe('20');
    expect(batch.remainingQuantity.toString()).toBe('4');
    expect(balance.onHandQuantity.toString()).toBe('8');
  });

  it('allows a confirmed order to be corrected before the first receipt', async () => {
    const order = await purchase.createOrder(
      {
        supplierId,
        buyerId,
        purchaseChannelId: channelId,
        currency: 'CNY',
        orderDate: '2026-07-17T00:00:00.000Z',
        items: [{ skuId, quantity: '5', unitPrice: '11' }],
      },
      actor,
    );
    await purchase.confirmOrder(order.id, actor);
    const updated = await purchase.updateOrder(
      order.id,
      {
        supplierId,
        buyerId,
        purchaseChannelId: channelId,
        currency: 'CNY',
        orderDate: '2026-07-18T00:00:00.000Z',
        expectedAt: '2026-07-20T00:00:00.000Z',
        remark: '已更正采购数量和单价',
        items: [{ skuId, quantity: '6', unitPrice: '12' }],
      },
      actor,
    );
    expect(updated.status).toBe(PurchaseOrderStatus.CONFIRMED);
    expect(updated.totalAmount.toString()).toBe('72');
    expect(updated.items[0].quantity.toString()).toBe('6');
    expect(updated.items[0].unitPrice.toString()).toBe('12');
  });
});

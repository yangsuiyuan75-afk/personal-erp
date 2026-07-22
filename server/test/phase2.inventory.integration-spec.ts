import {
  AdjustmentDirection,
  ChannelInventoryMode,
  InventoryLocationType,
  InventoryStockStatus,
  MasterDataStatus,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { InventoryPostingService } from '../src/modules/inventory/inventory-posting.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { cleanDatabase } from './database-cleanup';

describe('Phase 2 inventory integration', () => {
  const prisma = new PrismaService();
  const audit = new AuditService(prisma);
  const posting = new InventoryPostingService(prisma, audit);
  const inventory = new InventoryService(prisma, posting, audit);
  let actor: { id: string; username: string };
  let skuId: string;
  let mainLocationId: string;
  let externalLocationId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDatabase(prisma as PrismaClient);
    const user = await prisma.adminUser.create({
      data: { username: 'inventory-integration', passwordHash: 'not-used' },
    });
    actor = { id: user.id, username: user.username };
    const category = await prisma.category.create({ data: { code: 'CAT', name: '分类' } });
    const unit = await prisma.unit.create({ data: { code: 'PCS', name: '件' } });
    const product = await prisma.product.create({
      data: { code: 'PROD', name: '测试商品', categoryId: category.id },
    });
    const sku = await prisma.sku.create({
      data: {
        code: 'SKU-P2',
        barcode: 'P2-0001',
        name: '库存测试 SKU',
        productId: product.id,
        baseUnitId: unit.id,
      },
    });
    skuId = sku.id;
    const channel = await prisma.salesChannel.create({
      data: {
        code: 'ALI',
        name: 'AliExpress',
        inventoryMode: ChannelInventoryMode.EXTERNAL_WAREHOUSE,
      },
    });
    const main = await inventory.createLocation(
      {
        code: 'MAIN',
        name: '主仓',
        type: InventoryLocationType.PHYSICAL_WAREHOUSE,
        isLeaf: true,
      },
      actor,
    );
    const external = await inventory.createLocation(
      {
        code: 'ALI-WH',
        name: 'AliExpress 平台仓',
        type: InventoryLocationType.EXTERNAL_WAREHOUSE,
        salesChannelId: channel.id,
        isLeaf: true,
      },
      actor,
    );
    mainLocationId = main.id;
    externalLocationId = external.id;
  });

  afterAll(async () => {
    await cleanDatabase(prisma as PrismaClient);
    await prisma.$disconnect();
  });

  it('posts opening stock once and calculates moving average cost', async () => {
    const opening = await inventory.createOpening(
      {
        importKey: 'phase2-opening',
        occurredAt: '2026-07-16T00:00:00.000Z',
        rows: [
          {
            locationCode: 'MAIN',
            skuCode: 'SKU-P2',
            stockStatus: InventoryStockStatus.AVAILABLE,
            quantity: '10',
            unitCost: '10',
            batchNo: 'OPEN-P2-001',
          },
        ],
      },
      actor,
    );
    const first = await inventory.postOpening(opening.id, 'opening-post', actor);
    const repeated = await inventory.postOpening(opening.id, 'opening-post', actor);
    expect(repeated.transactionId).toBe(first.transactionId);

    const adjustment = await inventory.createAdjustment(
      {
        direction: AdjustmentDirection.IN,
        occurredAt: '2026-07-16T01:00:00.000Z',
        reason: '补录库存',
        items: [
          {
            locationId: mainLocationId,
            skuId,
            stockStatus: InventoryStockStatus.AVAILABLE,
            quantity: '10',
            unitCost: '20',
          },
        ],
      },
      actor,
    );
    await inventory.postAdjustment(adjustment.id, 'adjustment-in-post', actor);
    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        locationId_skuId_stockStatus: {
          locationId: mainLocationId,
          skuId,
          stockStatus: InventoryStockStatus.AVAILABLE,
        },
      },
    });
    expect(balance.onHandQuantity.toString()).toBe('20');
    expect(balance.averageCost.toString()).toBe('15');
    expect(balance.inventoryValue.toString()).toBe('300');
  });

  it('moves real stock into an external channel warehouse without changing total value', async () => {
    const transfer = await inventory.createTransfer(
      {
        fromLocationId: mainLocationId,
        toLocationId: externalLocationId,
        occurredAt: '2026-07-16T02:00:00.000Z',
        items: [
          {
            skuId,
            stockStatus: InventoryStockStatus.AVAILABLE,
            quantity: '5',
          },
        ],
      },
      actor,
    );
    await inventory.postTransfer(transfer.id, 'transfer-post', actor);
    const balances = await prisma.inventoryBalance.findMany({
      where: { skuId, stockStatus: InventoryStockStatus.AVAILABLE },
    });
    expect(balances.reduce((sum, balance) => sum + balance.onHandQuantity.toNumber(), 0)).toBe(20);
    expect(balances.reduce((sum, balance) => sum + balance.inventoryValue.toNumber(), 0)).toBe(300);
    expect(
      balances
        .find((balance) => balance.locationId === externalLocationId)
        ?.onHandQuantity.toString(),
    ).toBe('5');
  });

  it('rejects stock leaving a location below zero', async () => {
    const adjustment = await inventory.createAdjustment(
      {
        direction: AdjustmentDirection.OUT,
        occurredAt: '2026-07-16T03:00:00.000Z',
        reason: '超量出库验证',
        items: [
          {
            locationId: externalLocationId,
            skuId,
            stockStatus: InventoryStockStatus.AVAILABLE,
            quantity: '6',
          },
        ],
      },
      actor,
    );
    await expect(
      inventory.postAdjustment(adjustment.id, 'negative-stock', actor),
    ).rejects.toMatchObject({
      response: { code: 'INVENTORY_INSUFFICIENT' },
    });
    const saved = await prisma.inventoryAdjustment.findUniqueOrThrow({
      where: { id: adjustment.id },
    });
    expect(saved.status).toBe('DRAFT');
  });

  it('keeps direct balance state active and immutable through documents only', async () => {
    const balances = await inventory.listBalances({
      page: 1,
      pageSize: 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc' as never,
      stockStatus: InventoryStockStatus.AVAILABLE,
      status: MasterDataStatus.ACTIVE,
    });
    expect(balances.meta.total).toBe(2);
  });
});

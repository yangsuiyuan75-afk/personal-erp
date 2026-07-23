import type { INestApplication } from '@nestjs/common';
import {
  ClaimResolutionType,
  InventoryLocationType,
  PrismaClient,
  QualityResponsibility,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PurchaseService } from '../src/modules/purchase/purchase.service';
import { SalesService } from '../src/modules/sales/sales.service';
import { cleanDatabase } from './database-cleanup';

describe('Phase 5 quality API (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let token: string;
  let actor: { id: string; username: string };
  let supplierId: string;
  let salesReturnId: string;
  let salesReturnItemId: string;
  let claimLocationId: string;
  let inspectionId: string;
  let claimId: string;

  beforeAll(async () => {
    await cleanDatabase(prisma);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/bootstrap')
      .send({ username: 'admin', password: 'StrongPassword!2026' })
      .expect(201);
    token = login.body.data.accessToken;
    const admin = await prisma.adminUser.findUniqueOrThrow({ where: { username: 'admin' } });
    actor = { id: admin.id, username: admin.username };

    const [category, unit, purchaseChannel] = await Promise.all([
      prisma.category.create({ data: { code: 'QCE-CAT', name: '质检 E2E 分类' } }),
      prisma.unit.create({ data: { code: 'QCE-PCS', name: '件' } }),
      prisma.purchaseChannel.create({
        data: { code: 'QCE-PC', name: '质检采购渠道', type: 'PLATFORM' },
      }),
    ]);
    const [supplier, buyer, product] = await Promise.all([
      prisma.supplier.create({
        data: { code: 'QCE-SUP', name: '质检供应商', purchaseChannelId: purchaseChannel.id },
      }),
      prisma.buyer.create({ data: { code: 'QCE-BUY', name: '质检采购员' } }),
      prisma.product.create({
        data: { code: 'QCE-PROD', name: '质检商品', categoryId: category.id },
      }),
    ]);
    supplierId = supplier.id;
    const sku = await prisma.sku.create({
      data: {
        code: 'QCE-SKU',
        barcode: 'QCE-001',
        name: '质检 E2E SKU',
        productId: product.id,
        baseUnitId: unit.id,
      },
    });
    const [main, qc, claim] = await Promise.all([
      prisma.inventoryLocation.create({
        data: {
          code: 'QCE-MAIN',
          name: '质检主仓',
          type: InventoryLocationType.PHYSICAL_WAREHOUSE,
        },
      }),
      prisma.inventoryLocation.create({
        data: { code: 'QCE-QC', name: '待质检区', type: InventoryLocationType.QC_AREA },
      }),
      prisma.inventoryLocation.create({
        data: { code: 'QCE-CLAIM', name: '索赔区', type: InventoryLocationType.CLAIM_AREA },
      }),
    ]);
    claimLocationId = claim.id;
    const purchase = app.get(PurchaseService);
    const purchaseOrder = await purchase.createOrder(
      {
        supplierId: supplier.id,
        buyerId: buyer.id,
        purchaseChannelId: purchaseChannel.id,
        currency: 'CNY',
        orderDate: '2026-07-01T00:00:00.000Z',
        items: [{ skuId: sku.id, quantity: '5', unitPrice: '10' }],
      },
      actor,
    );
    await purchase.confirmOrder(purchaseOrder.id, actor);
    const receipt = await purchase.createReceipt(
      {
        purchaseOrderId: purchaseOrder.id,
        locationId: main.id,
        occurredAt: '2026-07-02T00:00:00.000Z',
        items: [
          {
            purchaseOrderItemId: purchaseOrder.items[0].id,
            quantity: '5',
            batchNo: 'QCE-BATCH',
          },
        ],
      },
      actor,
    );
    await purchase.postReceipt(receipt.id, 'qce-receipt', actor);
    const salesChannel = await prisma.salesChannel.create({
      data: { code: 'QCE-SALES', name: '质检销售渠道', inventoryMode: 'DIRECT_FROM_LOCATION' },
    });
    const sales = app.get(SalesService);
    const order = await sales.createOrder(
      {
        salesChannelId: salesChannel.id,
        currency: 'CNY',
        orderDate: '2026-07-03T00:00:00.000Z',
        items: [{ skuId: sku.id, quantity: '2', unitPrice: '20' }],
      },
      actor,
    );
    await sales.confirmOrder(order.id, actor);
    const issue = await sales.createIssue(
      {
        salesOrderId: order.id,
        locationId: main.id,
        occurredAt: '2026-07-04T00:00:00.000Z',
        items: [{ salesOrderItemId: order.items[0].id, quantity: '2' }],
      },
      actor,
    );
    await sales.postIssue(issue.id, 'qce-issue', actor);
    const returned = await sales.createReturn(
      {
        salesIssueId: issue.id,
        qcLocationId: qc.id,
        occurredAt: '2026-07-05T00:00:00.000Z',
        reason: '厂家质量异常',
        items: [{ salesIssueItemId: issue.items[0].id, quantity: '2' }],
      },
      actor,
    );
    await sales.postReturn(returned.id, 'qce-return', actor);
    salesReturnId = returned.id;
    salesReturnItemId = returned.items[0].id;
  });

  afterAll(async () => {
    await app.close();
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it('lists pending returns and rejects non-conserving inspection quantities', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const pending = await request(app.getHttpServer())
      .get('/api/v1/quality/pending-returns?page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc')
      .set(auth)
      .expect(200);
    expect(pending.body.data[0].id).toBe(salesReturnId);
    await request(app.getHttpServer())
      .post('/api/v1/quality/inspections')
      .set(auth)
      .send({
        salesReturnId,
        inspectedAt: '2026-07-06T00:00:00.000Z',
        items: [
          {
            salesReturnItemId,
            goodQuantity: '0',
            defectiveQuantity: '0',
            supplierClaimQuantity: '1',
            scrapQuantity: '0',
            responsibility: QualityResponsibility.SUPPLIER,
            supplierId,
            defectDescription: '材料异常',
          },
        ],
      })
      .expect(422);
  });

  it('confirms inspection, creates claim and moves stock to SUPPLIER_CLAIM', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const inspection = await request(app.getHttpServer())
      .post('/api/v1/quality/inspections')
      .set(auth)
      .send({
        salesReturnId,
        inspectedAt: '2026-07-06T00:00:00.000Z',
        items: [
          {
            salesReturnItemId,
            goodQuantity: '0',
            defectiveQuantity: '0',
            supplierClaimQuantity: '2',
            scrapQuantity: '0',
            responsibility: QualityResponsibility.SUPPLIER,
            supplierId,
            defectDescription: '材料异常',
          },
        ],
      })
      .expect(201);
    inspectionId = inspection.body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/quality/inspections/${inspectionId}/confirm`)
      .set(auth)
      .set('Idempotency-Key', 'qce-inspection')
      .send({ claimLocationId })
      .expect(201);
    const claims = await request(app.getHttpServer())
      .get('/api/v1/quality/claims?page=1&pageSize=20&sortBy=submittedAt&sortOrder=desc')
      .set(auth)
      .expect(200);
    claimId = claims.body.data[0].id;
    expect(claims.body.data[0]).toMatchObject({ claimedAmount: '20', status: 'SUBMITTED' });
    const stock = await request(app.getHttpServer())
      .get('/api/v1/quality/stock?page=1&pageSize=20&sortBy=updatedAt&sortOrder=desc')
      .set(auth)
      .expect(200);
    expect(stock.body.data[0]).toMatchObject({
      stockStatus: 'SUPPLIER_CLAIM',
      onHandQuantity: '2',
    });
  });

  it('records supplier cash compensation as a receivable', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await request(app.getHttpServer())
      .post(`/api/v1/quality/claims/${claimId}/settlements`)
      .set(auth)
      .set('Idempotency-Key', 'qce-cash-settlement')
      .send({
        resolutionType: ClaimResolutionType.CASH_COMPENSATION,
        amount: '20',
        occurredAt: '2026-07-07T00:00:00.000Z',
      })
      .expect(201);
    const receivables = await request(app.getHttpServer())
      .get(
        '/api/v1/quality/compensation-receivables?page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc',
      )
      .set(auth)
      .expect(200);
    expect(receivables.body.data[0]).toMatchObject({
      originalAmount: '20',
      outstandingAmount: '20',
    });
  });
});

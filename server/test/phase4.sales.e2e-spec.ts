import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './database-cleanup';

describe('Phase 4 sales API (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let token: string;
  let channelId: string;
  let customerId: string;
  let skuId: string;
  let locationId: string;
  let qcLocationId: string;
  let orderId: string;
  let orderItemId: string;
  let issueId: string;
  let issueItemId: string;

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
  });

  afterAll(async () => {
    await app.close();
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it('creates sales references, real inventory and customer-specific price', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const category = await request(app.getHttpServer())
      .post('/api/v1/master-data/categories')
      .set(auth)
      .send({ code: 'SAL-E2E', name: '销售 E2E 分类' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/api/v1/master-data/units')
      .set(auth)
      .send({ code: 'PCS', name: '件', decimalScale: 0 })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post('/api/v1/master-data/products')
      .set(auth)
      .send({ code: 'SAL-PROD', name: '销售 E2E 商品', categoryId: category.body.data.id })
      .expect(201);
    const sku = await request(app.getHttpServer())
      .post('/api/v1/master-data/skus')
      .set(auth)
      .send({
        code: 'SAL-SKU',
        barcode: 'SAL-E2E-001',
        name: '销售 E2E SKU',
        productId: product.body.data.id,
        baseUnitId: unit.body.data.id,
      })
      .expect(201);
    skuId = sku.body.data.id;
    const channel = await request(app.getHttpServer())
      .post('/api/v1/master-data/sales-channels')
      .set(auth)
      .send({ code: 'OFFLINE', name: '线下渠道', inventoryMode: 'DIRECT_FROM_LOCATION' })
      .expect(201);
    channelId = channel.body.data.id;
    const customer = await request(app.getHttpServer())
      .post('/api/v1/master-data/customers')
      .set(auth)
      .send({ code: 'CUS-E2E', name: '客户 A', defaultSalesChannelId: channelId })
      .expect(201);
    customerId = customer.body.data.id;
    const location = await request(app.getHttpServer())
      .post('/api/v1/inventory/locations')
      .set(auth)
      .send({ code: 'SAL-WH', name: '销售主仓', type: 'PHYSICAL_WAREHOUSE' })
      .expect(201);
    locationId = location.body.data.id;
    const qcLocation = await request(app.getHttpServer())
      .post('/api/v1/inventory/locations')
      .set(auth)
      .send({ code: 'SAL-QC', name: '销售退货待检区', type: 'QC_AREA' })
      .expect(201);
    qcLocationId = qcLocation.body.data.id;
    const rows = [
      {
        locationCode: 'SAL-WH',
        skuCode: 'SAL-SKU',
        stockStatus: 'AVAILABLE',
        quantity: '10',
        unitCost: '8',
        batchNo: 'SAL-E2E-BATCH',
      },
    ];
    const opening = await request(app.getHttpServer())
      .post('/api/v1/inventory/openings')
      .set(auth)
      .send({ importKey: 'sales-e2e-opening', occurredAt: '2026-07-16T00:00:00.000Z', rows })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/inventory/openings/${opening.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'sales-e2e-opening-post')
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/sales/prices')
      .set(auth)
      .send({
        skuId,
        salesChannelId: channelId,
        customerId,
        currency: 'CNY',
        price: '20',
        minQuantity: '1',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
      })
      .expect(201);
    const resolved = await request(app.getHttpServer())
      .get(
        `/api/v1/sales/prices/resolve?skuId=${skuId}&salesChannelId=${channelId}&customerId=${customerId}&quantity=3&at=2026-07-16T00:00:00.000Z`,
      )
      .set(auth)
      .expect(200);
    expect(resolved.body.data.price).toBe('20');
  });

  it('creates and posts a sales order and issue with receivable', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const order = await request(app.getHttpServer())
      .post('/api/v1/sales/orders')
      .set(auth)
      .send({
        salesChannelId: channelId,
        customerId,
        currency: 'CNY',
        orderDate: '2026-07-16T01:00:00.000Z',
        items: [{ skuId, quantity: '3' }],
      })
      .expect(201);
    orderId = order.body.data.id;
    orderItemId = order.body.data.items[0].id;
    expect(order.body.data.items[0].unitPrice).toBe('20');
    expect(order.body.data.issues).toMatchObject([
      {
        status: 'DRAFT',
        occurredAt: '2026-07-16T01:00:00.000Z',
        items: [{ salesOrderItemId: orderItemId, quantity: '3' }],
      },
    ]);
    issueId = order.body.data.issues[0].id;
    issueItemId = order.body.data.issues[0].items[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/sales/orders/${orderId}/confirm`)
      .set(auth)
      .expect(201);
    const issue = await request(app.getHttpServer())
      .patch(`/api/v1/sales/issues/${issueId}`)
      .set(auth)
      .send({
        locationId,
        quantity: '2',
      })
      .expect(200);
    expect(issue.body.data).toMatchObject({
      occurredAt: '2026-07-16T01:00:00.000Z',
      items: [{ id: issueItemId, quantity: '2' }],
    });
    await request(app.getHttpServer())
      .post(`/api/v1/sales/issues/${issueId}/post`)
      .set(auth)
      .set('Idempotency-Key', 'sales-e2e-issue')
      .expect(201);
    const receivables = await request(app.getHttpServer())
      .get('/api/v1/sales/receivables?page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc')
      .set(auth)
      .expect(200);
    expect(receivables.body.data[0]).toMatchObject({
      originalAmount: '40',
      outstandingAmount: '40',
      salesIssue: { items: [{ quantity: '2', sku: { code: 'SAL-SKU', name: '销售 E2E SKU' } }] },
    });
    const drafts = await request(app.getHttpServer())
      .get(
        '/api/v1/sales/issues?page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc&documentStatus=DRAFT',
      )
      .set(auth)
      .expect(200);
    expect(drafts.body.data).toMatchObject([{ status: 'DRAFT', items: [{ quantity: '1' }] }]);
  });

  it('posts sales return only into QC_PENDING and adjusts receivable', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const returned = await request(app.getHttpServer())
      .post('/api/v1/sales/returns')
      .set(auth)
      .send({
        salesIssueId: issueId,
        qcLocationId,
        occurredAt: '2026-07-16T03:00:00.000Z',
        reason: '外观损坏',
        items: [{ salesIssueItemId: issueItemId, quantity: '1' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/sales/returns/${returned.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'sales-e2e-return')
      .expect(201);
    const balances = await request(app.getHttpServer())
      .get('/api/v1/inventory/balances?page=1&pageSize=20&sortBy=updatedAt&sortOrder=desc')
      .set(auth)
      .expect(200);
    const qc = balances.body.data.find(
      (row: { locationId: string; stockStatus: string }) =>
        row.locationId === qcLocationId && row.stockStatus === 'QC_PENDING',
    );
    const available = balances.body.data.find(
      (row: { locationId: string; stockStatus: string }) =>
        row.locationId === locationId && row.stockStatus === 'AVAILABLE',
    );
    expect(qc.onHandQuantity).toBe('1');
    expect(available.onHandQuantity).toBe('8');
    const receivables = await request(app.getHttpServer())
      .get('/api/v1/sales/receivables?page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc')
      .set(auth)
      .expect(200);
    expect(receivables.body.data[0].outstandingAmount).toBe('20');
  });
});

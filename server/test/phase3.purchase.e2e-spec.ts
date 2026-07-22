import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './database-cleanup';

describe('Phase 3 purchase API (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let token: string;
  let locationId: string;
  let orderId: string;
  let orderItemId: string;
  let receiptId: string;
  let receiptItemId: string;

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

  it('creates a confirmed order with a transaction price snapshot', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const channel = await request(app.getHttpServer())
      .post('/api/v1/master-data/purchase-channels')
      .set(auth)
      .send({ code: '1688', name: '1688', type: 'PLATFORM' })
      .expect(201);
    const supplier = await request(app.getHttpServer())
      .post('/api/v1/master-data/suppliers')
      .set(auth)
      .send({
        code: 'SUP-E2E',
        name: '采购 E2E 供应商',
        purchaseChannelId: channel.body.data.id,
      })
      .expect(201);
    const buyer = await request(app.getHttpServer())
      .post('/api/v1/master-data/buyers')
      .set(auth)
      .send({
        code: 'BUY-E2E',
        name: '采购 E2E 采购员',
        purchaseChannelIds: [channel.body.data.id],
      })
      .expect(201);
    const category = await request(app.getHttpServer())
      .post('/api/v1/master-data/categories')
      .set(auth)
      .send({ code: 'PUR-E2E', name: '采购 E2E 分类' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/api/v1/master-data/units')
      .set(auth)
      .send({ code: 'PCS', name: '件', decimalScale: 0 })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post('/api/v1/master-data/products')
      .set(auth)
      .send({ code: 'PUR-PROD', name: '采购 E2E 商品', categoryId: category.body.data.id })
      .expect(201);
    const sku = await request(app.getHttpServer())
      .post('/api/v1/master-data/skus')
      .set(auth)
      .send({
        code: 'PUR-SKU',
        barcode: 'PUR-E2E-001',
        name: '采购 E2E SKU',
        productId: product.body.data.id,
        baseUnitId: unit.body.data.id,
      })
      .expect(201);
    const location = await request(app.getHttpServer())
      .post('/api/v1/inventory/locations')
      .set(auth)
      .send({ code: 'PUR-WH', name: '采购仓', type: 'PHYSICAL_WAREHOUSE' })
      .expect(201);
    locationId = location.body.data.id;

    const order = await request(app.getHttpServer())
      .post('/api/v1/purchase/orders')
      .set(auth)
      .send({
        supplierId: supplier.body.data.id,
        buyerId: buyer.body.data.id,
        purchaseChannelId: channel.body.data.id,
        currency: 'CNY',
        orderDate: '2026-07-16T00:00:00.000Z',
        items: [{ skuId: sku.body.data.id, quantity: '10', unitPrice: '8.5' }],
      })
      .expect(201);
    orderId = order.body.data.id;
    orderItemId = order.body.data.items[0].id;
    expect(order.body.data.items[0].unitPrice).toBe('8.5');
    await request(app.getHttpServer())
      .post(`/api/v1/purchase/orders/${orderId}/confirm`)
      .set(auth)
      .expect(201);
  });

  it('posts receipt into inventory and creates payable', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const receipt = await request(app.getHttpServer())
      .post('/api/v1/purchase/receipts')
      .set(auth)
      .send({
        purchaseOrderId: orderId,
        locationId,
        occurredAt: '2026-07-16T01:00:00.000Z',
        items: [{ purchaseOrderItemId: orderItemId, quantity: '10', batchNo: 'E2E-PUR-BATCH' }],
      })
      .expect(201);
    receiptId = receipt.body.data.id;
    receiptItemId = receipt.body.data.items[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/purchase/receipts/${receiptId}/post`)
      .set(auth)
      .set('Idempotency-Key', 'e2e-purchase-receipt')
      .expect(201);
    const payables = await request(app.getHttpServer())
      .get('/api/v1/purchase/payables?page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc')
      .set(auth)
      .expect(200);
    expect(payables.body.data[0]).toMatchObject({ originalAmount: '85', outstandingAmount: '85' });
  });

  it('posts purchase return against its original batch and adjusts payable', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const returned = await request(app.getHttpServer())
      .post('/api/v1/purchase/returns')
      .set(auth)
      .send({
        purchaseReceiptId: receiptId,
        locationId,
        occurredAt: '2026-07-16T02:00:00.000Z',
        reason: '来料不符',
        items: [{ purchaseReceiptItemId: receiptItemId, quantity: '2' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase/returns/${returned.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'e2e-purchase-return')
      .expect(201);
    const payables = await request(app.getHttpServer())
      .get('/api/v1/purchase/payables?page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc')
      .set(auth)
      .expect(200);
    expect(payables.body.data[0]).toMatchObject({ adjustedAmount: '17', outstandingAmount: '68' });
  });
});

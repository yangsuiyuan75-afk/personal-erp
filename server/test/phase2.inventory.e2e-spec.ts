import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './database-cleanup';

describe('Phase 2 inventory API (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let accessToken: string;
  let categoryId: string;
  let skuId: string;
  let mainLocationId: string;
  let externalLocationId: string;

  beforeAll(async () => {
    await cleanDatabase(prisma);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    const bootstrap = await request(app.getHttpServer())
      .post('/api/v1/auth/bootstrap')
      .send({ username: 'admin', password: 'StrongPassword!2026' })
      .expect(201);
    accessToken = bootstrap.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it('creates inventory master references and real physical/channel locations', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const category = await request(app.getHttpServer())
      .post('/api/v1/master-data/categories')
      .set(auth)
      .send({ code: 'STORAGE', name: '收纳' })
      .expect(201);
    categoryId = category.body.data.id;
    const unit = await request(app.getHttpServer())
      .post('/api/v1/master-data/units')
      .set(auth)
      .send({ code: 'PCS', name: '件', decimalScale: 0 })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post('/api/v1/master-data/products')
      .set(auth)
      .send({ code: 'BOX', name: '收纳盒', categoryId: category.body.data.id })
      .expect(201);
    const sku = await request(app.getHttpServer())
      .post('/api/v1/master-data/skus')
      .set(auth)
      .send({
        code: 'SKU-BOX',
        barcode: 'BOX-0001',
        name: '透明收纳盒',
        productId: product.body.data.id,
        baseUnitId: unit.body.data.id,
      })
      .expect(201);
    skuId = sku.body.data.id;
    const channel = await request(app.getHttpServer())
      .post('/api/v1/master-data/sales-channels')
      .set(auth)
      .send({
        code: 'ALI',
        name: 'AliExpress',
        inventoryMode: 'EXTERNAL_WAREHOUSE',
      })
      .expect(201);
    const main = await request(app.getHttpServer())
      .post('/api/v1/inventory/locations')
      .set(auth)
      .send({ code: 'MAIN', name: '主仓', type: 'PHYSICAL_WAREHOUSE', isLeaf: true })
      .expect(201);
    mainLocationId = main.body.data.id;
    const external = await request(app.getHttpServer())
      .post('/api/v1/inventory/locations')
      .set(auth)
      .send({
        code: 'ALI-WH',
        name: 'AliExpress 平台仓',
        type: 'EXTERNAL_WAREHOUSE',
        salesChannelId: channel.body.data.id,
        isLeaf: true,
      })
      .expect(201);
    externalLocationId = external.body.data.id;
  });

  it('previews and confirms opening inventory with idempotent posting', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const rows = [
      {
        locationCode: 'MAIN',
        skuCode: 'SKU-BOX',
        stockStatus: 'AVAILABLE',
        quantity: '20',
        unitCost: '12.5',
        batchNo: 'OPEN-BOX-001',
      },
    ];
    const preview = await request(app.getHttpServer())
      .post('/api/v1/inventory/openings/preview')
      .set(auth)
      .send({ rows })
      .expect(201);
    expect(preview.body.data).toMatchObject({
      valid: true,
      validCount: 1,
      totalQuantity: '20.0000',
    });

    const opening = await request(app.getHttpServer())
      .post('/api/v1/inventory/openings')
      .set(auth)
      .send({
        importKey: 'e2e-opening-box',
        occurredAt: '2026-07-16T00:00:00.000Z',
        rows,
      })
      .expect(201);
    const first = await request(app.getHttpServer())
      .post(`/api/v1/inventory/openings/${opening.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'e2e-opening-post')
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post(`/api/v1/inventory/openings/${opening.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'e2e-opening-post')
      .expect(201);
    expect(repeated.body.data.transactionId).toBe(first.body.data.transactionId);
  });

  it('posts a platform-warehouse transfer and exposes paginated balances and trace batches', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const transfer = await request(app.getHttpServer())
      .post('/api/v1/inventory/transfers')
      .set(auth)
      .send({
        fromLocationId: mainLocationId,
        toLocationId: externalLocationId,
        occurredAt: '2026-07-16T01:00:00.000Z',
        items: [{ skuId, stockStatus: 'AVAILABLE', quantity: '5' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/inventory/transfers/${transfer.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'e2e-transfer-post')
      .expect(201);

    const balances = await request(app.getHttpServer())
      .get('/api/v1/inventory/balances?page=1&pageSize=20&sortBy=updatedAt&sortOrder=desc')
      .set(auth)
      .expect(200);
    expect(balances.body.meta.total).toBe(2);
    expect(balances.body.data.map((row: { onHandQuantity: string }) => row.onHandQuantity)).toEqual(
      expect.arrayContaining(['15', '5']),
    );
    const categoryBalances = await request(app.getHttpServer())
      .get(
        `/api/v1/inventory/balances?page=1&pageSize=20&sortBy=updatedAt&sortOrder=desc&categoryId=${categoryId}`,
      )
      .set(auth)
      .expect(200);
    expect(categoryBalances.body.meta.total).toBe(2);
    const emptyCategoryBalances = await request(app.getHttpServer())
      .get(
        '/api/v1/inventory/balances?page=1&pageSize=20&sortBy=updatedAt&sortOrder=desc&categoryId=00000000-0000-4000-8000-000000000000',
      )
      .set(auth)
      .expect(200);
    expect(emptyCategoryBalances.body.meta.total).toBe(0);
    const batches = await request(app.getHttpServer())
      .get('/api/v1/inventory/batches?page=1&pageSize=20&sortBy=receivedAt&sortOrder=asc')
      .set(auth)
      .expect(200);
    expect(batches.body.data[0]).toMatchObject({
      batchNo: 'OPEN-BOX-001',
      remainingQuantity: '20',
    });
  });
});

import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './database-cleanup';

describe('Phase 7 files API (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let token: string;
  let productId: string;

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
    const category = await prisma.category.create({
      data: { code: 'FILE-E2E-CAT', name: '文件 E2E 类目' },
    });
    const product = await prisma.product.create({
      data: { code: 'FILE-E2E-PROD', name: '文件 E2E 商品', categoryId: category.id },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await app.close();
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it('exposes the complete missing-configuration state without blocking local files', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/onedrive/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data).toMatchObject({
      code: 'CLIENT_ID_MISSING',
      label: '未配置 Client ID',
      externalConfigurationStatus: 'WAITING_FOR_EXTERNAL_CONFIGURATION',
      mockProviderAvailable: true,
    });
  });

  it('uploads, displays, sorts, switches primary and deletes product images', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const uploaded = await request(app.getHttpServer())
      .post(`/api/v1/files/products/${productId}/images`)
      .set(auth)
      .field('isPrimary', 'true')
      .attach('files', Buffer.from('first-image'), {
        filename: 'first.png',
        contentType: 'image/png',
      })
      .attach('files', Buffer.from('second-image'), {
        filename: 'second.webp',
        contentType: 'image/webp',
      })
      .expect(201);
    const images = uploaded.body.data.images;
    expect(images).toHaveLength(2);
    expect(images.filter((image: { isPrimary: boolean }) => image.isPrimary)).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/api/v1/files/${images[0].fileAssetId}/content`)
      .set(auth)
      .expect(200)
      .expect('content-type', /image\/png/);

    const reversed = [...images].reverse().map((image: { id: string }) => image.id);
    await request(app.getHttpServer())
      .patch(`/api/v1/files/products/${productId}/images/reorder`)
      .set(auth)
      .send({ imageIds: reversed })
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.images.map((image: { id: string }) => image.id)).toEqual(reversed),
      );
    await request(app.getHttpServer())
      .post(`/api/v1/files/products/${productId}/images/${reversed[0]}/primary`)
      .set(auth)
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/files/products/${productId}/images/${reversed[0]}`)
      .set(auth)
      .expect(204);
    const gallery = await request(app.getHttpServer())
      .get(`/api/v1/files/products/${productId}/images`)
      .set(auth)
      .expect(200);
    expect(gallery.body.data.images).toHaveLength(1);
    expect(gallery.body.data.images[0].isPrimary).toBe(true);
  });

  it('serves paginated filtered FileAsset lists and CSV while rejecting SVG', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const list = await request(app.getHttpServer())
      .get(
        `/api/v1/files?page=1&pageSize=10&keyword=second&provider=MOCK_LOCAL&fileStatus=DELETED&sortBy=fileName&sortOrder=asc`,
      )
      .set(auth)
      .expect(200);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 10, total: 1 });
    await request(app.getHttpServer())
      .get('/api/v1/files/export?page=1&pageSize=10&sortBy=createdAt&sortOrder=desc')
      .set(auth)
      .expect(200)
      .expect('content-type', /text\/csv/);
    await request(app.getHttpServer())
      .post('/api/v1/files')
      .set(auth)
      .field('logicalPath', 'Quality/test')
      .attach('file', Buffer.from('<svg/>'), {
        filename: 'unsafe.svg',
        contentType: 'image/svg+xml',
      })
      .expect(422);
  });
});

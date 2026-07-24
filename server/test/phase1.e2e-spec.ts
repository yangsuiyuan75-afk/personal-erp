import type { INestApplication } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { cleanDatabase } from './database-cleanup'

describe('Phase 1 auth and master data API (e2e)', () => {
  const prisma = new PrismaClient()
  let app: INestApplication
  let accessToken: string
  let categoryId: string
  let unitId: string
  let productId: string

  beforeAll(async () => {
    await cleanDatabase(prisma)
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.setGlobalPrefix('api/v1')
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await cleanDatabase(prisma)
    await prisma.$disconnect()
  })

  it('bootstraps the only administrator', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/status')
      .expect(200)
      .expect(({ body }) => expect(body.data.initialized).toBe(false))

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/bootstrap')
      .send({ username: 'admin', password: 'StrongPassword!2026' })
      .expect(201)
    accessToken = response.body.data.accessToken
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly')
  })

  it('rejects unauthenticated master-data access', () =>
    request(app.getHttpServer()).get('/api/v1/master-data/categories').expect(401))

  it('creates and queries Category, Unit, Product and SKU', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` }
    const category = await request(app.getHttpServer())
      .post('/api/v1/master-data/categories')
      .set(auth)
      .send({ code: 'AUDIO', name: '音频设备' })
      .expect(201)
    categoryId = category.body.data.id

    const unit = await request(app.getHttpServer())
      .post('/api/v1/master-data/units')
      .set(auth)
      .send({ code: 'PCS', name: '件', decimalScale: 0 })
      .expect(201)
    unitId = unit.body.data.id

    const product = await request(app.getHttpServer())
      .post('/api/v1/master-data/products')
      .set(auth)
      .send({ code: 'HEADSET', name: '无线耳机', categoryId })
      .expect(201)
    productId = product.body.data.id

    await request(app.getHttpServer())
      .post('/api/v1/master-data/skus')
      .set(auth)
      .send({
        code: 'SKU-1001',
        barcode: '6971234567890',
        name: '无线耳机 Pro',
        productId,
        baseUnitId: unitId,
        attributes: { color: '黑色' },
      })
      .expect(201)

    const list = await request(app.getHttpServer())
      .get('/api/v1/master-data/skus?page=1&pageSize=10&keyword=耳机&sortBy=code&sortOrder=asc')
      .set(auth)
      .expect(200)
    expect(list.body.meta).toMatchObject({ total: 1, page: 1, pageSize: 10 })
    expect(list.body.data[0].product.name).toBe('无线耳机')
  })

  it('forbids price fields on SKU and allows audited business code changes', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` }
    await request(app.getHttpServer())
      .post('/api/v1/master-data/skus')
      .set(auth)
      .send({
        code: 'SKU-BAD',
        barcode: '6971234567891',
        name: '错误 SKU',
        productId,
        baseUnitId: unitId,
        salePrice: '99.00',
      })
      .expect(400)

    const updatedCategory = await request(app.getHttpServer())
      .patch(`/api/v1/master-data/categories/${categoryId}`)
      .set(auth)
      .send({ code: 'CHANGED' })
      .expect(200)
    expect(updatedCategory.body.data.code).toBe('CHANGED')
  })

  it('streams safe CSV and records audit history', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` }
    const csv = await request(app.getHttpServer())
      .get('/api/v1/master-data/categories/export?page=1&pageSize=20')
      .set(auth)
      .expect(200)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.text).toContain('CHANGED')

    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?page=1&pageSize=20')
      .set(auth)
      .expect(200)
    expect(audit.body.meta.total).toBeGreaterThanOrEqual(5)
  })
})

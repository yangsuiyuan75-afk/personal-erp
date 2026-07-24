import type { INestApplication } from '@nestjs/common'
import { ExpenseCategory, FinancialTransactionCategory, PrismaClient } from '@prisma/client'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { cleanDatabase } from './database-cleanup'

describe('Phase 6 finance API (e2e)', () => {
  const prisma = new PrismaClient()
  let app: INestApplication
  let token: string
  let accountId: string
  let payableId: string
  let receivableId: string

  beforeAll(async () => {
    await cleanDatabase(prisma)
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.setGlobalPrefix('api/v1')
    await app.init()
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/bootstrap')
      .send({ username: 'admin', password: 'StrongPassword!2026' })
      .expect(201)
    token = login.body.data.accessToken
    const [purchaseChannel, salesChannel] = await Promise.all([
      prisma.purchaseChannel.create({
        data: { code: 'FINE-PC', name: '财务 E2E 采购渠道', type: 'PLATFORM' },
      }),
      prisma.salesChannel.create({
        data: {
          code: 'FINE-SC',
          name: '财务 E2E 销售渠道',
          inventoryMode: 'DIRECT_FROM_LOCATION',
        },
      }),
    ])
    const [supplier, buyer, customer] = await Promise.all([
      prisma.supplier.create({
        data: { code: 'FINE-SUP', name: '财务 E2E 供应商', purchaseChannelId: purchaseChannel.id },
      }),
      prisma.buyer.create({ data: { code: 'FINE-BUY', name: '财务 E2E 采购员' } }),
      prisma.customer.create({
        data: {
          code: 'FINE-CUS',
          name: '财务 E2E 客户',
          defaultSalesChannelId: salesChannel.id,
        },
      }),
    ])
    const [payable, receivable] = await Promise.all([
      prisma.payable.create({
        data: {
          payableNo: 'FINE-AP-001',
          supplierId: supplier.id,
          purchaseChannelId: purchaseChannel.id,
          buyerId: buyer.id,
          sourceType: 'E2E_PURCHASE',
          sourceId: 'finance-e2e-payable',
          originalAmount: '80',
          outstandingAmount: '80',
          occurredAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      }),
      prisma.receivable.create({
        data: {
          receivableNo: 'FINE-AR-001',
          customerId: customer.id,
          salesChannelId: salesChannel.id,
          sourceType: 'E2E_SALES',
          sourceId: 'finance-e2e-receivable',
          originalAmount: '120',
          outstandingAmount: '120',
          occurredAt: new Date('2026-07-02T00:00:00.000Z'),
        },
      }),
    ])
    payableId = payable.id
    receivableId = receivable.id
  })

  afterAll(async () => {
    await app.close()
    await cleanDatabase(prisma)
    await prisma.$disconnect()
  })

  it('creates an account and posts an auditable opening adjustment', async () => {
    const auth = { Authorization: `Bearer ${token}` }
    const account = await request(app.getHttpServer())
      .post('/api/v1/finance/accounts')
      .set(auth)
      .send({ code: 'FINE-BANK', name: '财务 E2E 银行卡', type: 'BANK', currency: 'CNY' })
      .expect(201)
    accountId = account.body.data.id
    const adjustment = await request(app.getHttpServer())
      .post('/api/v1/finance/adjustments')
      .set(auth)
      .send({
        accountId,
        direction: 'IN',
        category: FinancialTransactionCategory.ACCOUNT_ADJUSTMENT,
        amount: '50',
        occurredAt: '2026-07-01T00:00:00.000Z',
        reason: 'E2E 期初资金',
      })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/api/v1/finance/adjustments/${adjustment.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'fine-opening')
      .expect(201)
    const accounts = await request(app.getHttpServer())
      .get('/api/v1/finance/accounts?page=1&pageSize=20&sortBy=code&sortOrder=asc')
      .set(auth)
      .expect(200)
    expect(accounts.body.data[0]).toMatchObject({ code: 'FINE-BANK', balance: '50' })
  })

  it('posts partial payment and receipt allocations into real fund transactions', async () => {
    const auth = { Authorization: `Bearer ${token}` }
    const payment = await request(app.getHttpServer())
      .post('/api/v1/finance/payments')
      .set(auth)
      .send({
        accountId,
        amount: '30',
        occurredAt: '2026-07-10T00:00:00.000Z',
        settlementPeriod: '2026-07',
        allocations: [{ payableId, amount: '30' }],
      })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/api/v1/finance/payments/${payment.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'fine-payment')
      .expect(201)
    const receipt = await request(app.getHttpServer())
      .post('/api/v1/finance/receipts')
      .set(auth)
      .send({
        accountId,
        amount: '40',
        occurredAt: '2026-07-11T00:00:00.000Z',
        settlementPeriod: '2026-07',
        allocations: [{ receivableId, amount: '40' }],
      })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/api/v1/finance/receipts/${receipt.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'fine-receipt')
      .expect(201)
    const transactions = await request(app.getHttpServer())
      .get('/api/v1/finance/transactions?page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc')
      .set(auth)
      .expect(200)
    expect(transactions.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'PURCHASE_PAYMENT', amount: '30' }),
        expect.objectContaining({ category: 'SALES_RECEIPT', amount: '40' }),
      ]),
    )
    const [payable, receivable] = await Promise.all([
      prisma.payable.findUniqueOrThrow({ where: { id: payableId } }),
      prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } }),
    ])
    expect(payable.outstandingAmount.toString()).toBe('50')
    expect(receivable.outstandingAmount.toString()).toBe('80')
  })

  it('returns month-filtered cash, obligation and dimension analysis', async () => {
    const auth = { Authorization: `Bearer ${token}` }
    const analytics = await request(app.getHttpServer())
      .get(
        '/api/v1/finance/analytics?month=2026-07&page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc',
      )
      .set(auth)
      .expect(200)
    expect(analytics.body.data.summary).toMatchObject({
      income: '90',
      outflow: '30',
      netCashFlow: '60',
      outstandingPayable: '50',
      outstandingReceivable: '80',
    })
    expect(analytics.body.data.dimensions.salesChannels[0]).toMatchObject({ amount: '40' })
    expect(analytics.body.data.dimensions.suppliers[0]).toMatchObject({ amount: '30' })
  })

  it('creates and posts a daily expense bill into the finance summary', async () => {
    const auth = { Authorization: `Bearer ${token}` }
    const bill = await request(app.getHttpServer())
      .post('/api/v1/finance/expenses')
      .set(auth)
      .send({
        accountId,
        expenseCategory: ExpenseCategory.QUALIFICATION,
        reason: '营业执照年审服务',
        payee: '企业服务中心',
        amount: '68',
        occurredAt: '2026-07-22T00:00:00.000Z',
      })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/api/v1/finance/expenses/${bill.body.data.id}/post`)
      .set(auth)
      .set('Idempotency-Key', 'fine-expense-bill')
      .expect(201)

    const expenses = await request(app.getHttpServer())
      .get(
        '/api/v1/finance/expenses?month=2026-07&page=1&pageSize=20&sortBy=occurredAt&sortOrder=desc',
      )
      .set(auth)
      .expect(200)
    expect(expenses.body.data[0]).toMatchObject({
      adjustmentNo: expect.stringMatching(/^EXP-/),
      expenseCategory: 'QUALIFICATION',
      status: 'POSTED',
      amount: '68',
    })
    expect(expenses.body.summary).toMatchObject({
      postedAmount: '68',
      pendingAmount: '0',
      billCount: 1,
    })
    const transaction = await prisma.financialTransaction.findUniqueOrThrow({
      where: {
        sourceType_sourceId: { sourceType: 'EXPENSE_BILL', sourceId: bill.body.data.id },
      },
    })
    expect(transaction.category).toBe(FinancialTransactionCategory.OTHER_EXPENSE)
  })
})

import {
  ClaimResolutionType,
  DocumentStatus,
  FinancialDirection,
  FinancialTransactionCategory,
  PayableStatus,
  PrismaClient,
  ReceivableStatus,
} from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { SortOrder } from '../src/common/dto/list-query.dto';
import { AuditService } from '../src/modules/audit/audit.service';
import { FinanceService } from '../src/modules/finance/finance.service';
import { cleanDatabase } from './database-cleanup';

describe('Phase 6 finance integration', () => {
  const prisma = new PrismaService();
  const audit = new AuditService(prisma);
  const finance = new FinanceService(prisma, audit);
  let actor: { id: string; username: string };
  let accountId: string;
  let payableId: string;
  let receivableId: string;
  let supplierCreditId: string;
  let compensationReceivableId: string;
  let supplierId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDatabase(prisma as PrismaClient);
    const user = await prisma.adminUser.create({
      data: { username: 'finance-integration', passwordHash: 'not-used' },
    });
    actor = { id: user.id, username: user.username };
    const [purchaseChannel, salesChannel] = await Promise.all([
      prisma.purchaseChannel.create({
        data: { code: 'FIN-PUR', name: '财务采购渠道', type: 'PLATFORM' },
      }),
      prisma.salesChannel.create({
        data: {
          code: 'FIN-SALES',
          name: '财务销售渠道',
          inventoryMode: 'DIRECT_FROM_LOCATION',
        },
      }),
    ]);
    const [supplier, buyer, customer] = await Promise.all([
      prisma.supplier.create({
        data: { code: 'FIN-SUP', name: '财务供应商', purchaseChannelId: purchaseChannel.id },
      }),
      prisma.buyer.create({
        data: {
          code: 'FIN-BUY',
          name: '财务采购员',
          channels: { create: { purchaseChannelId: purchaseChannel.id } },
        },
      }),
      prisma.customer.create({
        data: {
          code: 'FIN-CUS',
          name: '财务客户',
          defaultSalesChannelId: salesChannel.id,
        },
      }),
    ]);
    supplierId = supplier.id;
    const account = await finance.createAccount(
      { code: 'FIN-BANK', name: '经营银行卡', type: 'BANK', currency: 'CNY' },
      actor,
    );
    accountId = account.id;
    const [payable, receivable, credit, claim] = await Promise.all([
      prisma.payable.create({
        data: {
          payableNo: 'FIN-AP-001',
          supplierId: supplier.id,
          purchaseChannelId: purchaseChannel.id,
          buyerId: buyer.id,
          sourceType: 'TEST_PURCHASE_RECEIPT',
          sourceId: 'finance-payable-source',
          originalAmount: '100',
          outstandingAmount: '100',
          occurredAt: new Date('2026-07-02T00:00:00.000Z'),
        },
      }),
      prisma.receivable.create({
        data: {
          receivableNo: 'FIN-AR-001',
          customerId: customer.id,
          salesChannelId: salesChannel.id,
          sourceType: 'TEST_SALES_ISSUE',
          sourceId: 'finance-receivable-source',
          originalAmount: '150',
          outstandingAmount: '150',
          occurredAt: new Date('2026-07-03T00:00:00.000Z'),
        },
      }),
      prisma.supplierCredit.create({
        data: {
          creditNo: 'FIN-SC-001',
          supplierId: supplier.id,
          amount: '20',
        },
      }),
      prisma.supplierClaim.create({
        data: {
          claimNo: 'FIN-CLM-001',
          supplierId: supplier.id,
          claimedAmount: '10',
          settledAmount: '10',
          submittedAt: new Date('2026-07-04T00:00:00.000Z'),
          status: 'SETTLED',
        },
      }),
    ]);
    payableId = payable.id;
    receivableId = receivable.id;
    supplierCreditId = credit.id;
    const settlement = await prisma.supplierClaimSettlement.create({
      data: {
        settlementNo: 'FIN-SCS-001',
        supplierClaimId: claim.id,
        resolutionType: ClaimResolutionType.CASH_COMPENSATION,
        status: DocumentStatus.POSTED,
        amount: '10',
        occurredAt: new Date('2026-07-05T00:00:00.000Z'),
        postedAt: new Date('2026-07-05T00:00:00.000Z'),
      },
    });
    const compensation = await prisma.supplierCompensationReceivable.create({
      data: {
        receivableNo: 'FIN-COMP-001',
        supplierId: supplier.id,
        supplierClaimSettlementId: settlement.id,
        originalAmount: '10',
        outstandingAmount: '10',
        occurredAt: new Date('2026-07-05T00:00:00.000Z'),
      },
    });
    compensationReceivableId = compensation.id;
  });

  afterAll(async () => {
    await cleanDatabase(prisma as PrismaClient);
    await prisma.$disconnect();
  });

  it('posts allocated cash payments and supplier-credit settlement separately', async () => {
    const payment = await finance.createPayment(
      {
        accountId,
        amount: '30',
        occurredAt: '2026-07-10T00:00:00.000Z',
        settlementPeriod: '2026-07',
        allocations: [
          {
            payableId,
            amount: '30',
            supplierCreditId,
            creditAmount: '20',
          },
        ],
      },
      actor,
    );
    const posted = await finance.postPayment(payment.id, 'fin-payment-post', actor);
    const replayed = await finance.postPayment(payment.id, 'fin-payment-post', actor);
    const [payable, credit, transaction] = await Promise.all([
      prisma.payable.findUniqueOrThrow({ where: { id: payableId } }),
      prisma.supplierCredit.findUniqueOrThrow({ where: { id: supplierCreditId } }),
      prisma.financialTransaction.findUniqueOrThrow({
        where: { sourceType_sourceId: { sourceType: 'PAYMENT', sourceId: payment.id } },
      }),
    ]);
    expect(posted.status).toBe(DocumentStatus.POSTED);
    expect(replayed.id).toBe(posted.id);
    expect(payable.paidAmount.toString()).toBe('30');
    expect(payable.creditedAmount.toString()).toBe('20');
    expect(payable.outstandingAmount.toString()).toBe('50');
    expect(payable.status).toBe(PayableStatus.PARTIALLY_PAID);
    expect(credit.appliedAmount.toString()).toBe('20');
    expect(transaction.amount.toString()).toBe('30');
    expect(transaction.direction).toBe(FinancialDirection.OUT);
    expect(await prisma.financialTransaction.count({ where: { sourceId: payment.id } })).toBe(1);
  });

  it('posts partial customer receipt and supplier compensation as distinct inflows', async () => {
    const salesReceipt = await finance.createReceipt(
      {
        accountId,
        amount: '60',
        occurredAt: '2026-07-11T00:00:00.000Z',
        settlementPeriod: '2026-07',
        allocations: [{ receivableId, amount: '60' }],
      },
      actor,
    );
    await finance.postReceipt(salesReceipt.id, 'fin-sales-receipt', actor);
    const compensationReceipt = await finance.createReceipt(
      {
        accountId,
        amount: '10',
        occurredAt: '2026-07-12T00:00:00.000Z',
        allocations: [{ supplierCompensationReceivableId: compensationReceivableId, amount: '10' }],
      },
      actor,
    );
    await finance.postReceipt(compensationReceipt.id, 'fin-compensation-receipt', actor);
    const [receivable, compensation, transactions] = await Promise.all([
      prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } }),
      prisma.supplierCompensationReceivable.findUniqueOrThrow({
        where: { id: compensationReceivableId },
      }),
      prisma.financialTransaction.findMany({
        where: { sourceId: { in: [salesReceipt.id, compensationReceipt.id] } },
      }),
    ]);
    expect(receivable.receivedAmount.toString()).toBe('60');
    expect(receivable.outstandingAmount.toString()).toBe('90');
    expect(receivable.status).toBe(ReceivableStatus.PARTIALLY_RECEIVED);
    expect(compensation.outstandingAmount.toString()).toBe('0');
    expect(compensation.status).toBe(ReceivableStatus.SETTLED);
    expect(transactions.map((row) => row.category).sort()).toEqual([
      FinancialTransactionCategory.SALES_RECEIPT,
      FinancialTransactionCategory.SUPPLIER_COMPENSATION,
    ]);
  });

  it('derives account balances and monthly multidimensional analysis only from posted flows', async () => {
    const opening = await finance.createAdjustment(
      {
        accountId,
        direction: FinancialDirection.IN,
        category: FinancialTransactionCategory.ACCOUNT_ADJUSTMENT,
        amount: '100',
        occurredAt: '2026-07-01T00:00:00.000Z',
        reason: '账户期初余额',
      },
      actor,
    );
    await finance.postAdjustment(opening.id, 'fin-opening-adjustment', actor);
    const platformFee = await finance.createAdjustment(
      {
        accountId,
        direction: FinancialDirection.OUT,
        category: FinancialTransactionCategory.PLATFORM_FEE,
        amount: '5',
        occurredAt: '2026-07-13T00:00:00.000Z',
        reason: '平台服务费',
      },
      actor,
    );
    await finance.postAdjustment(platformFee.id, 'fin-platform-fee', actor);
    const [accounts, analytics] = await Promise.all([
      finance.listAccounts({ page: 1, pageSize: 20, sortBy: 'code', sortOrder: SortOrder.ASC }),
      finance.analytics({
        page: 1,
        pageSize: 20,
        sortBy: 'occurredAt',
        sortOrder: SortOrder.DESC,
        month: '2026-07',
      }),
    ]);
    expect(accounts.data[0].balance.toString()).toBe('135');
    expect(analytics.summary.income.toString()).toBe('170');
    expect(analytics.summary.outflow.toString()).toBe('35');
    expect(analytics.summary.netCashFlow.toString()).toBe('135');
    expect(analytics.summary.platformFee.toString()).toBe('5');
    expect(analytics.summary.supplierCompensation.toString()).toBe('10');
    expect(analytics.summary.outstandingPayable.toString()).toBe('50');
    expect(analytics.summary.outstandingReceivable.toString()).toBe('90');
    expect(analytics.dimensions.suppliers[0]).toMatchObject({ id: supplierId });
    expect(analytics.monthly).toHaveLength(1);
  });
});

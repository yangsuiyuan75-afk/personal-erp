import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentStatus,
  FinancialDirection,
  FinancialTransactionCategory,
  MasterDataStatus,
  PayableStatus,
  Prisma,
  ReceivableStatus,
  SupplierCreditStatus,
} from '@prisma/client';
import { paginationMeta } from '../../common/dto/list-query.dto';
import { serializableTransaction } from '../../common/utils/serializable-transaction';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import type {
  CreateAccountAdjustmentDto,
  CreateFinancialAccountDto,
  CreatePaymentDto,
  CreateReceiptDto,
  FinanceQueryDto,
  UpdateFinancialAccountDto,
} from './dto/finance.dto';

const ACCOUNT_SORT = ['createdAt', 'code', 'name', 'type', 'updatedAt'] as const;
const DOCUMENT_SORT = ['createdAt', 'occurredAt', 'amount'] as const;
const OBLIGATION_SORT = ['createdAt', 'occurredAt', 'originalAmount', 'outstandingAmount'] as const;
const TRANSACTION_SORT = ['createdAt', 'occurredAt', 'amount', 'transactionNo'] as const;

function businessNo(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function decimal(value: string, label: string, allowZero = false): Prisma.Decimal {
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(value);
  } catch {
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}格式无效`,
    });
  }
  if (!parsed.isFinite() || parsed.isNegative() || (!allowZero && parsed.isZero()))
    throw new UnprocessableEntityException({
      code: 'DECIMAL_INVALID',
      message: `${label}${allowZero ? '不能为负数' : '必须大于 0'}`,
    });
  return parsed;
}

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values: Array<string | null | undefined>): string | undefined {
  const filtered = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return filtered.length === 1 ? filtered[0] : undefined;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAccounts(query: FinanceQueryDto) {
    this.assertSort(query.sortBy, ACCOUNT_SORT);
    const where: Prisma.FinancialAccountWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { name: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.financialAccount.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.financialAccount.count({ where }),
    ]);
    const totals = rows.length
      ? await this.prisma.financialTransaction.groupBy({
          by: ['accountId', 'direction'],
          where: { accountId: { in: rows.map((row) => row.id) } },
          _sum: { amount: true },
        })
      : [];
    return {
      data: rows.map((row) => {
        const incoming = totals.find(
          (item) => item.accountId === row.id && item.direction === FinancialDirection.IN,
        )?._sum.amount;
        const outgoing = totals.find(
          (item) => item.accountId === row.id && item.direction === FinancialDirection.OUT,
        )?._sum.amount;
        return {
          ...row,
          balance: (incoming ?? new Prisma.Decimal(0)).minus(outgoing ?? 0),
        };
      }),
      meta: paginationMeta(query.page, query.pageSize, total),
    };
  }

  async createAccount(payload: CreateFinancialAccountDto, actor: AuthUser, requestId?: string) {
    const code = payload.code.trim().toUpperCase();
    if (await this.prisma.financialAccount.findUnique({ where: { code } }))
      throw new ConflictException({ code: 'CODE_EXISTS', message: '资金账户代码已存在' });
    const data = await this.prisma.financialAccount.create({
      data: {
        code,
        name: payload.name.trim(),
        type: payload.type,
        currency: payload.currency.toUpperCase(),
      },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'FINANCE',
      action: 'CREATE_ACCOUNT',
      entityType: 'FinancialAccount',
      entityId: data.id,
      after: data,
      requestId,
    });
    return { ...data, balance: new Prisma.Decimal(0) };
  }

  async updateAccount(
    id: string,
    payload: UpdateFinancialAccountDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    const before = await this.prisma.financialAccount.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: '资金账户不存在' });
    const data = await this.prisma.financialAccount.update({
      where: { id },
      data: {
        ...(payload.name ? { name: payload.name.trim() } : {}),
        ...(payload.type ? { type: payload.type } : {}),
        ...(payload.status ? { status: payload.status } : {}),
      },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'FINANCE',
      action: 'UPDATE_ACCOUNT',
      entityType: 'FinancialAccount',
      entityId: id,
      before,
      after: data,
      requestId,
    });
    return data;
  }

  async listPayables(query: FinanceQueryDto) {
    this.assertSort(query.sortBy, OBLIGATION_SORT);
    const where: Prisma.PayableWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.purchaseChannelId ? { purchaseChannelId: query.purchaseChannelId } : {}),
      ...(query.buyerId ? { buyerId: query.buyerId } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as PayableStatus } : {}),
      ...this.dateWhere(query, 'occurredAt'),
      ...(query.keyword
        ? {
            OR: [
              { payableNo: { contains: query.keyword, mode: 'insensitive' } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    return this.page(this.prisma.payable, where, query, {
      supplier: true,
      purchaseChannel: true,
      buyer: true,
    });
  }

  async listReceivables(query: FinanceQueryDto) {
    this.assertSort(query.sortBy, OBLIGATION_SORT);
    const where: Prisma.ReceivableWhereInput = {
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as ReceivableStatus } : {}),
      ...this.dateWhere(query, 'occurredAt'),
      ...(query.keyword
        ? {
            OR: [
              { receivableNo: { contains: query.keyword, mode: 'insensitive' } },
              { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { salesChannel: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    return this.page(this.prisma.receivable, where, query, { customer: true, salesChannel: true });
  }

  async listPayments(query: FinanceQueryDto) {
    this.assertSort(query.sortBy, DOCUMENT_SORT);
    const where: Prisma.PaymentWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.purchaseChannelId ? { purchaseChannelId: query.purchaseChannelId } : {}),
      ...(query.buyerId ? { buyerId: query.buyerId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as DocumentStatus } : {}),
      ...this.dateWhere(query, 'occurredAt'),
      ...(query.keyword
        ? {
            OR: [
              { paymentNo: { contains: query.keyword, mode: 'insensitive' } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    return this.page(this.prisma.payment, where, query, {
      account: true,
      supplier: true,
      customer: true,
      purchaseChannel: true,
      buyer: true,
      salesChannel: true,
      allocations: { include: { payable: true, customerRefund: true, supplierCredit: true } },
      transaction: true,
    });
  }

  async listReceipts(query: FinanceQueryDto) {
    this.assertSort(query.sortBy, DOCUMENT_SORT);
    const where: Prisma.ReceiptWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as DocumentStatus } : {}),
      ...this.dateWhere(query, 'occurredAt'),
      ...(query.keyword
        ? {
            OR: [
              { receiptNo: { contains: query.keyword, mode: 'insensitive' } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    return this.page(this.prisma.receipt, where, query, {
      account: true,
      supplier: true,
      customer: true,
      salesChannel: true,
      allocations: {
        include: { receivable: true, supplierCompensationReceivable: true },
      },
      transaction: true,
    });
  }

  async listAdjustments(query: FinanceQueryDto) {
    this.assertSort(query.sortBy, DOCUMENT_SORT);
    const where: Prisma.AccountAdjustmentWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.purchaseChannelId ? { purchaseChannelId: query.purchaseChannelId } : {}),
      ...(query.buyerId ? { buyerId: query.buyerId } : {}),
      ...(query.documentStatus ? { status: query.documentStatus as DocumentStatus } : {}),
      ...this.dateWhere(query, 'occurredAt'),
      ...(query.keyword
        ? {
            OR: [
              { adjustmentNo: { contains: query.keyword, mode: 'insensitive' } },
              { reason: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.page(this.prisma.accountAdjustment, where, query, {
      account: true,
      salesChannel: true,
      customer: true,
      supplier: true,
      purchaseChannel: true,
      buyer: true,
      transaction: true,
    });
  }

  async listTransactions(query: FinanceQueryDto) {
    this.assertSort(query.sortBy, TRANSACTION_SORT);
    const where: Prisma.FinancialTransactionWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.purchaseChannelId ? { purchaseChannelId: query.purchaseChannelId } : {}),
      ...(query.buyerId ? { buyerId: query.buyerId } : {}),
      ...this.dateWhere(query, 'occurredAt'),
      ...(query.keyword
        ? {
            OR: [
              { transactionNo: { contains: query.keyword, mode: 'insensitive' } },
              { remark: { contains: query.keyword, mode: 'insensitive' } },
              { supplier: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { customer: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    return this.page(this.prisma.financialTransaction, where, query, {
      account: true,
      salesChannel: true,
      customer: true,
      supplier: true,
      purchaseChannel: true,
      buyer: true,
    });
  }

  async createPayment(payload: CreatePaymentDto, actor: AuthUser, requestId?: string) {
    const account = await this.activeAccount(payload.accountId);
    const amount = decimal(payload.amount, '付款金额');
    const normalized = payload.allocations.map((item) => ({
      ...item,
      amount: decimal(item.amount, '分配金额', true),
      creditAmount: decimal(item.creditAmount ?? '0', '抵扣金额', true),
    }));
    const payableKind = normalized.every((item) => item.payableId && !item.customerRefundId);
    const refundKind = normalized.every((item) => item.customerRefundId && !item.payableId);
    if (!payableKind && !refundKind)
      throw new UnprocessableEntityException({
        code: 'PAYMENT_TARGET_INVALID',
        message: '一张付款单只能分配同类应付或客户退款，且每行必须选择一个目标',
      });
    if (
      !normalized.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0)).equals(amount)
    )
      throw new UnprocessableEntityException({
        code: 'ALLOCATION_TOTAL_MISMATCH',
        message: '付款分配的现金金额合计必须等于付款金额',
      });
    if (normalized.some((item) => item.amount.plus(item.creditAmount).lessThanOrEqualTo(0)))
      throw new UnprocessableEntityException({
        code: 'ALLOCATION_ZERO',
        message: '每条付款分配的现金加抵扣必须大于 0',
      });
    const targetIds = normalized.map((item) => item.payableId ?? item.customerRefundId!);
    if (new Set(targetIds).size !== targetIds.length)
      throw new UnprocessableEntityException({
        code: 'ALLOCATION_DUPLICATE',
        message: '同一付款目标不能重复分配',
      });

    let supplierId: string | undefined;
    let customerId: string | undefined;
    let purchaseChannelId: string | undefined;
    let buyerId: string | undefined;
    let salesChannelId: string | undefined;
    if (payableKind) {
      const payables = await this.prisma.payable.findMany({
        where: { id: { in: normalized.map((item) => item.payableId!) } },
      });
      if (payables.length !== normalized.length)
        throw new NotFoundException({ code: 'PAYABLE_NOT_FOUND', message: '部分应付不存在' });
      supplierId = this.sameDimension(
        payables.map((row) => row.supplierId),
        '供应商',
      );
      purchaseChannelId = this.sameDimension(
        payables.map((row) => row.purchaseChannelId),
        '采购渠道',
      );
      buyerId = this.sameDimension(
        payables.map((row) => row.buyerId),
        '采购员',
      );
      const creditTotals = new Map<string, Prisma.Decimal>();
      for (const item of normalized) {
        const payable = payables.find((row) => row.id === item.payableId)!;
        if (item.amount.plus(item.creditAmount).greaterThan(payable.outstandingAmount))
          throw new UnprocessableEntityException({
            code: 'PAYABLE_AMOUNT_EXCEEDED',
            message: `应付 ${payable.payableNo} 分配金额超过未付余额`,
          });
        if (item.creditAmount.greaterThan(0) && !item.supplierCreditId)
          throw new UnprocessableEntityException({
            code: 'SUPPLIER_CREDIT_REQUIRED',
            message: '填写抵扣金额时必须选择 Supplier Credit',
          });
        if (item.supplierCreditId)
          creditTotals.set(
            item.supplierCreditId,
            (creditTotals.get(item.supplierCreditId) ?? new Prisma.Decimal(0)).plus(
              item.creditAmount,
            ),
          );
      }
      if (creditTotals.size) {
        const credits = await this.prisma.supplierCredit.findMany({
          where: { id: { in: [...creditTotals.keys()] } },
        });
        if (credits.length !== creditTotals.size)
          throw new NotFoundException({
            code: 'SUPPLIER_CREDIT_NOT_FOUND',
            message: '部分 Supplier Credit 不存在',
          });
        for (const credit of credits) {
          if (credit.supplierId !== supplierId)
            throw new UnprocessableEntityException({
              code: 'SUPPLIER_CREDIT_MISMATCH',
              message: 'Supplier Credit 与应付供应商不一致',
            });
          if (
            credit.status !== SupplierCreditStatus.OPEN &&
            credit.status !== SupplierCreditStatus.PARTIALLY_APPLIED
          )
            throw new ConflictException({
              code: 'SUPPLIER_CREDIT_INACTIVE',
              message: `${credit.creditNo} 不可继续抵扣`,
            });
          const remaining = credit.amount.minus(credit.appliedAmount);
          if (creditTotals.get(credit.id)!.greaterThan(remaining))
            throw new UnprocessableEntityException({
              code: 'SUPPLIER_CREDIT_EXCEEDED',
              message: `抵扣金额超过 ${credit.creditNo} 可用余额`,
            });
        }
      }
    } else {
      if (normalized.some((item) => item.creditAmount.greaterThan(0) || item.supplierCreditId))
        throw new UnprocessableEntityException({
          code: 'CUSTOMER_REFUND_CREDIT_INVALID',
          message: '客户退款不能使用 Supplier Credit',
        });
      const refunds = await this.prisma.customerRefund.findMany({
        where: { id: { in: normalized.map((item) => item.customerRefundId!) } },
      });
      if (refunds.length !== normalized.length)
        throw new NotFoundException({ code: 'REFUND_NOT_FOUND', message: '部分客户退款不存在' });
      customerId = this.sameOptionalDimension(
        refunds.map((row) => row.customerId),
        '客户',
      );
      salesChannelId = this.sameDimension(
        refunds.map((row) => row.salesChannelId),
        '销售渠道',
      );
      for (const item of normalized) {
        const refund = refunds.find((row) => row.id === item.customerRefundId)!;
        if (item.amount.greaterThan(refund.amount.minus(refund.paidAmount)))
          throw new UnprocessableEntityException({
            code: 'REFUND_AMOUNT_EXCEEDED',
            message: `客户退款 ${refund.refundNo} 分配金额超过未退余额`,
          });
      }
    }
    if (account.currency !== 'CNY')
      throw new UnprocessableEntityException({
        code: 'CURRENCY_UNSUPPORTED',
        message: '第一版仅支持 CNY 资金结算',
      });
    const data = await this.prisma.payment.create({
      data: {
        paymentNo: businessNo('PAY'),
        accountId: account.id,
        supplierId,
        customerId,
        purchaseChannelId,
        buyerId,
        salesChannelId,
        amount,
        occurredAt: new Date(payload.occurredAt),
        settlementPeriod: payload.settlementPeriod,
        remark: payload.remark,
        allocations: {
          create: normalized.map((item) => ({
            payableId: item.payableId,
            customerRefundId: item.customerRefundId,
            supplierCreditId: item.supplierCreditId,
            amount: item.amount,
            creditAmount: item.creditAmount,
          })),
        },
      },
      include: { allocations: true, account: true },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'FINANCE',
      action: 'CREATE_PAYMENT',
      entityType: 'Payment',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async postPayment(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    this.requireKey(idempotencyKey, '付款过账');
    const scope = `FINANCE_PAYMENT_POST:${id}`;
    const replay = await this.replay(scope, idempotencyKey, id);
    if (replay) return this.paymentDetail(replay);
    const paymentId = await serializableTransaction(this.prisma, async (transaction) => {
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_key: { scope, key: idempotencyKey } },
      });
      if (existing) return String((existing.responseJson as { id: string }).id);
      const payment = await transaction.payment.findUnique({
        where: { id },
        include: {
          account: true,
          allocations: { include: { payable: true, customerRefund: true, supplierCredit: true } },
        },
      });
      if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: '付款单不存在' });
      if (payment.status !== DocumentStatus.DRAFT)
        throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '付款单已过账或不可过账' });
      if (payment.account.status !== MasterDataStatus.ACTIVE)
        throw new ConflictException({ code: 'ACCOUNT_INACTIVE', message: '资金账户已停用' });
      const isSupplierPayment = payment.allocations.every((item) => item.payableId);
      const isCustomerRefund = payment.allocations.every((item) => item.customerRefundId);
      if (!isSupplierPayment && !isCustomerRefund)
        throw new UnprocessableEntityException({
          code: 'PAYMENT_TARGET_INVALID',
          message: '付款目标类型不一致',
        });
      const cashTotal = payment.allocations.reduce(
        (sum, item) => sum.plus(item.amount),
        new Prisma.Decimal(0),
      );
      if (!cashTotal.equals(payment.amount))
        throw new UnprocessableEntityException({
          code: 'ALLOCATION_TOTAL_MISMATCH',
          message: '付款分配金额与付款金额不一致',
        });
      for (const item of payment.allocations) {
        if (item.payable) {
          const settled = item.amount.plus(item.creditAmount);
          if (settled.greaterThan(item.payable.outstandingAmount))
            throw new UnprocessableEntityException({
              code: 'PAYABLE_AMOUNT_EXCEEDED',
              message: `应付 ${item.payable.payableNo} 未付余额不足`,
            });
          if (item.creditAmount.greaterThan(0)) {
            if (!item.supplierCredit)
              throw new UnprocessableEntityException({
                code: 'SUPPLIER_CREDIT_REQUIRED',
                message: 'Supplier Credit 不存在',
              });
            const nextApplied = item.supplierCredit.appliedAmount.plus(item.creditAmount);
            if (nextApplied.greaterThan(item.supplierCredit.amount))
              throw new UnprocessableEntityException({
                code: 'SUPPLIER_CREDIT_EXCEEDED',
                message: 'Supplier Credit 可用余额不足',
              });
            await transaction.supplierCredit.update({
              where: { id: item.supplierCredit.id },
              data: {
                appliedAmount: nextApplied,
                status: nextApplied.equals(item.supplierCredit.amount)
                  ? SupplierCreditStatus.APPLIED
                  : SupplierCreditStatus.PARTIALLY_APPLIED,
              },
            });
          }
          const outstanding = item.payable.outstandingAmount.minus(settled);
          await transaction.payable.update({
            where: { id: item.payable.id },
            data: {
              paidAmount: { increment: item.amount },
              creditedAmount: { increment: item.creditAmount },
              outstandingAmount: outstanding,
              status: outstanding.isZero() ? PayableStatus.SETTLED : PayableStatus.PARTIALLY_PAID,
            },
          });
        } else if (item.customerRefund) {
          const remaining = item.customerRefund.amount.minus(item.customerRefund.paidAmount);
          if (item.amount.greaterThan(remaining))
            throw new UnprocessableEntityException({
              code: 'REFUND_AMOUNT_EXCEEDED',
              message: `客户退款 ${item.customerRefund.refundNo} 未退余额不足`,
            });
          const paid = item.customerRefund.paidAmount.plus(item.amount);
          await transaction.customerRefund.update({
            where: { id: item.customerRefund.id },
            data: {
              paidAmount: paid,
              status: paid.equals(item.customerRefund.amount) ? 'PAID' : 'PARTIALLY_PAID',
            },
          });
        }
      }
      const financialTransaction = await transaction.financialTransaction.create({
        data: {
          transactionNo: businessNo('FTX'),
          accountId: payment.accountId,
          direction: FinancialDirection.OUT,
          category: isSupplierPayment
            ? FinancialTransactionCategory.PURCHASE_PAYMENT
            : FinancialTransactionCategory.CUSTOMER_REFUND,
          amount: payment.amount,
          currency: payment.currency,
          sourceType: 'PAYMENT',
          sourceId: payment.id,
          supplierId: payment.supplierId,
          customerId: payment.customerId,
          purchaseChannelId: payment.purchaseChannelId,
          buyerId: payment.buyerId,
          salesChannelId: payment.salesChannelId,
          occurredAt: payment.occurredAt,
          remark: payment.remark,
        },
      });
      await transaction.payment.update({
        where: { id: payment.id },
        data: {
          status: DocumentStatus.POSTED,
          postedAt: new Date(),
          transactionId: financialTransaction.id,
        },
      });
      await transaction.idempotencyRecord.create({
        data: {
          scope,
          key: idempotencyKey,
          requestHash: requestHash(id),
          responseJson: { id: payment.id },
          statusCode: 200,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      return payment.id;
    });
    const data = await this.paymentDetail(paymentId);
    await this.audit.record({
      userId: actor.id,
      module: 'FINANCE',
      action: 'POST_PAYMENT',
      entityType: 'Payment',
      entityId: paymentId,
      after: data,
      requestId,
    });
    return data;
  }

  async createReceipt(payload: CreateReceiptDto, actor: AuthUser, requestId?: string) {
    const account = await this.activeAccount(payload.accountId);
    const amount = decimal(payload.amount, '收款金额');
    const normalized = payload.allocations.map((item) => ({
      ...item,
      amount: decimal(item.amount, '分配金额'),
    }));
    const salesKind = normalized.every(
      (item) => item.receivableId && !item.supplierCompensationReceivableId,
    );
    const compensationKind = normalized.every(
      (item) => item.supplierCompensationReceivableId && !item.receivableId,
    );
    if (!salesKind && !compensationKind)
      throw new UnprocessableEntityException({
        code: 'RECEIPT_TARGET_INVALID',
        message: '一张收款单只能分配销售应收或供应商赔付应收，且每行必须选择一个目标',
      });
    if (
      !normalized.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0)).equals(amount)
    )
      throw new UnprocessableEntityException({
        code: 'ALLOCATION_TOTAL_MISMATCH',
        message: '收款分配金额合计必须等于收款金额',
      });
    const targetIds = normalized.map(
      (item) => item.receivableId ?? item.supplierCompensationReceivableId!,
    );
    if (new Set(targetIds).size !== targetIds.length)
      throw new UnprocessableEntityException({
        code: 'ALLOCATION_DUPLICATE',
        message: '同一收款目标不能重复分配',
      });
    let customerId: string | undefined;
    let salesChannelId: string | undefined;
    let supplierId: string | undefined;
    if (salesKind) {
      const receivables = await this.prisma.receivable.findMany({
        where: { id: { in: normalized.map((item) => item.receivableId!) } },
      });
      if (receivables.length !== normalized.length)
        throw new NotFoundException({
          code: 'RECEIVABLE_NOT_FOUND',
          message: '部分销售应收不存在',
        });
      customerId = this.sameOptionalDimension(
        receivables.map((row) => row.customerId),
        '客户',
      );
      salesChannelId = this.sameDimension(
        receivables.map((row) => row.salesChannelId),
        '销售渠道',
      );
      for (const item of normalized) {
        const receivable = receivables.find((row) => row.id === item.receivableId)!;
        if (item.amount.greaterThan(receivable.outstandingAmount))
          throw new UnprocessableEntityException({
            code: 'RECEIVABLE_AMOUNT_EXCEEDED',
            message: `应收 ${receivable.receivableNo} 分配金额超过未收余额`,
          });
      }
    } else {
      const receivables = await this.prisma.supplierCompensationReceivable.findMany({
        where: {
          id: { in: normalized.map((item) => item.supplierCompensationReceivableId!) },
        },
      });
      if (receivables.length !== normalized.length)
        throw new NotFoundException({
          code: 'COMPENSATION_NOT_FOUND',
          message: '部分赔付应收不存在',
        });
      supplierId = this.sameDimension(
        receivables.map((row) => row.supplierId),
        '供应商',
      );
      for (const item of normalized) {
        const receivable = receivables.find(
          (row) => row.id === item.supplierCompensationReceivableId,
        )!;
        if (item.amount.greaterThan(receivable.outstandingAmount))
          throw new UnprocessableEntityException({
            code: 'RECEIVABLE_AMOUNT_EXCEEDED',
            message: `赔付应收 ${receivable.receivableNo} 分配金额超过未收余额`,
          });
      }
    }
    if (account.currency !== 'CNY')
      throw new UnprocessableEntityException({
        code: 'CURRENCY_UNSUPPORTED',
        message: '第一版仅支持 CNY 资金结算',
      });
    const data = await this.prisma.receipt.create({
      data: {
        receiptNo: businessNo('RCP'),
        accountId: account.id,
        customerId,
        salesChannelId,
        supplierId,
        amount,
        occurredAt: new Date(payload.occurredAt),
        settlementPeriod: payload.settlementPeriod,
        remark: payload.remark,
        allocations: {
          create: normalized.map((item) => ({
            receivableId: item.receivableId,
            supplierCompensationReceivableId: item.supplierCompensationReceivableId,
            amount: item.amount,
          })),
        },
      },
      include: { allocations: true, account: true },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'FINANCE',
      action: 'CREATE_RECEIPT',
      entityType: 'Receipt',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async postReceipt(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    this.requireKey(idempotencyKey, '收款过账');
    const scope = `FINANCE_RECEIPT_POST:${id}`;
    const replay = await this.replay(scope, idempotencyKey, id);
    if (replay) return this.receiptDetail(replay);
    const receiptId = await serializableTransaction(this.prisma, async (transaction) => {
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_key: { scope, key: idempotencyKey } },
      });
      if (existing) return String((existing.responseJson as { id: string }).id);
      const receipt = await transaction.receipt.findUnique({
        where: { id },
        include: {
          account: true,
          allocations: { include: { receivable: true, supplierCompensationReceivable: true } },
        },
      });
      if (!receipt) throw new NotFoundException({ code: 'NOT_FOUND', message: '收款单不存在' });
      if (receipt.status !== DocumentStatus.DRAFT)
        throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '收款单已过账或不可过账' });
      if (receipt.account.status !== MasterDataStatus.ACTIVE)
        throw new ConflictException({ code: 'ACCOUNT_INACTIVE', message: '资金账户已停用' });
      const salesReceipt = receipt.allocations.every((item) => item.receivableId);
      const compensationReceipt = receipt.allocations.every(
        (item) => item.supplierCompensationReceivableId,
      );
      if (!salesReceipt && !compensationReceipt)
        throw new UnprocessableEntityException({
          code: 'RECEIPT_TARGET_INVALID',
          message: '收款目标类型不一致',
        });
      const total = receipt.allocations.reduce(
        (sum, item) => sum.plus(item.amount),
        new Prisma.Decimal(0),
      );
      if (!total.equals(receipt.amount))
        throw new UnprocessableEntityException({
          code: 'ALLOCATION_TOTAL_MISMATCH',
          message: '收款分配金额与收款金额不一致',
        });
      for (const item of receipt.allocations) {
        if (item.receivable) {
          if (item.amount.greaterThan(item.receivable.outstandingAmount))
            throw new UnprocessableEntityException({
              code: 'RECEIVABLE_AMOUNT_EXCEEDED',
              message: `应收 ${item.receivable.receivableNo} 未收余额不足`,
            });
          const outstanding = item.receivable.outstandingAmount.minus(item.amount);
          await transaction.receivable.update({
            where: { id: item.receivable.id },
            data: {
              receivedAmount: { increment: item.amount },
              outstandingAmount: outstanding,
              status: outstanding.isZero()
                ? ReceivableStatus.SETTLED
                : ReceivableStatus.PARTIALLY_RECEIVED,
            },
          });
        } else if (item.supplierCompensationReceivable) {
          if (item.amount.greaterThan(item.supplierCompensationReceivable.outstandingAmount))
            throw new UnprocessableEntityException({
              code: 'RECEIVABLE_AMOUNT_EXCEEDED',
              message: `赔付应收 ${item.supplierCompensationReceivable.receivableNo} 未收余额不足`,
            });
          const outstanding = item.supplierCompensationReceivable.outstandingAmount.minus(
            item.amount,
          );
          await transaction.supplierCompensationReceivable.update({
            where: { id: item.supplierCompensationReceivable.id },
            data: {
              receivedAmount: { increment: item.amount },
              outstandingAmount: outstanding,
              status: outstanding.isZero()
                ? ReceivableStatus.SETTLED
                : ReceivableStatus.PARTIALLY_RECEIVED,
            },
          });
        }
      }
      const financialTransaction = await transaction.financialTransaction.create({
        data: {
          transactionNo: businessNo('FTX'),
          accountId: receipt.accountId,
          direction: FinancialDirection.IN,
          category: salesReceipt
            ? FinancialTransactionCategory.SALES_RECEIPT
            : FinancialTransactionCategory.SUPPLIER_COMPENSATION,
          amount: receipt.amount,
          currency: receipt.currency,
          sourceType: 'RECEIPT',
          sourceId: receipt.id,
          supplierId: receipt.supplierId,
          customerId: receipt.customerId,
          salesChannelId: receipt.salesChannelId,
          occurredAt: receipt.occurredAt,
          remark: receipt.remark,
        },
      });
      await transaction.receipt.update({
        where: { id: receipt.id },
        data: {
          status: DocumentStatus.POSTED,
          postedAt: new Date(),
          transactionId: financialTransaction.id,
        },
      });
      await transaction.idempotencyRecord.create({
        data: {
          scope,
          key: idempotencyKey,
          requestHash: requestHash(id),
          responseJson: { id: receipt.id },
          statusCode: 200,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      return receipt.id;
    });
    const data = await this.receiptDetail(receiptId);
    await this.audit.record({
      userId: actor.id,
      module: 'FINANCE',
      action: 'POST_RECEIPT',
      entityType: 'Receipt',
      entityId: receiptId,
      after: data,
      requestId,
    });
    return data;
  }

  async createAdjustment(payload: CreateAccountAdjustmentDto, actor: AuthUser, requestId?: string) {
    const account = await this.activeAccount(payload.accountId);
    const amount = decimal(payload.amount, '调整金额');
    const incoming: FinancialTransactionCategory[] = [
      FinancialTransactionCategory.OTHER_INCOME,
      FinancialTransactionCategory.SALES_RECEIPT,
      FinancialTransactionCategory.SUPPLIER_COMPENSATION,
    ];
    const outgoing: FinancialTransactionCategory[] = [
      FinancialTransactionCategory.PLATFORM_FEE,
      FinancialTransactionCategory.LOGISTICS_FEE,
      FinancialTransactionCategory.OTHER_EXPENSE,
      FinancialTransactionCategory.PURCHASE_PAYMENT,
      FinancialTransactionCategory.CUSTOMER_REFUND,
    ];
    if (
      (incoming.includes(payload.category) && payload.direction !== FinancialDirection.IN) ||
      (outgoing.includes(payload.category) && payload.direction !== FinancialDirection.OUT)
    )
      throw new UnprocessableEntityException({
        code: 'DIRECTION_CATEGORY_MISMATCH',
        message: '资金方向与业务分类不匹配',
      });
    const data = await this.prisma.accountAdjustment.create({
      data: {
        adjustmentNo: businessNo('ADJ'),
        accountId: account.id,
        direction: payload.direction,
        category: payload.category,
        amount,
        currency: account.currency,
        salesChannelId: payload.salesChannelId,
        customerId: payload.customerId,
        supplierId: payload.supplierId,
        purchaseChannelId: payload.purchaseChannelId,
        buyerId: payload.buyerId,
        occurredAt: new Date(payload.occurredAt),
        reason: payload.reason.trim(),
      },
      include: { account: true },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'FINANCE',
      action: 'CREATE_ADJUSTMENT',
      entityType: 'AccountAdjustment',
      entityId: data.id,
      after: data,
      requestId,
    });
    return data;
  }

  async postAdjustment(id: string, idempotencyKey: string, actor: AuthUser, requestId?: string) {
    this.requireKey(idempotencyKey, '账户调整过账');
    const scope = `FINANCE_ADJUSTMENT_POST:${id}`;
    const replay = await this.replay(scope, idempotencyKey, id);
    if (replay) return this.adjustmentDetail(replay);
    const adjustmentId = await serializableTransaction(this.prisma, async (transaction) => {
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_key: { scope, key: idempotencyKey } },
      });
      if (existing) return String((existing.responseJson as { id: string }).id);
      const adjustment = await transaction.accountAdjustment.findUnique({
        where: { id },
        include: { account: true },
      });
      if (!adjustment)
        throw new NotFoundException({ code: 'NOT_FOUND', message: '账户调整单不存在' });
      if (adjustment.status !== DocumentStatus.DRAFT)
        throw new ConflictException({ code: 'DOCUMENT_POSTED', message: '账户调整单已过账' });
      if (adjustment.account.status !== MasterDataStatus.ACTIVE)
        throw new ConflictException({ code: 'ACCOUNT_INACTIVE', message: '资金账户已停用' });
      const financialTransaction = await transaction.financialTransaction.create({
        data: {
          transactionNo: businessNo('FTX'),
          accountId: adjustment.accountId,
          direction: adjustment.direction,
          category: adjustment.category,
          amount: adjustment.amount,
          currency: adjustment.currency,
          sourceType: 'ACCOUNT_ADJUSTMENT',
          sourceId: adjustment.id,
          salesChannelId: adjustment.salesChannelId,
          customerId: adjustment.customerId,
          supplierId: adjustment.supplierId,
          purchaseChannelId: adjustment.purchaseChannelId,
          buyerId: adjustment.buyerId,
          occurredAt: adjustment.occurredAt,
          remark: adjustment.reason,
        },
      });
      await transaction.accountAdjustment.update({
        where: { id: adjustment.id },
        data: {
          status: DocumentStatus.POSTED,
          postedAt: new Date(),
          transactionId: financialTransaction.id,
        },
      });
      await transaction.idempotencyRecord.create({
        data: {
          scope,
          key: idempotencyKey,
          requestHash: requestHash(id),
          responseJson: { id: adjustment.id },
          statusCode: 200,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      return adjustment.id;
    });
    const data = await this.adjustmentDetail(adjustmentId);
    await this.audit.record({
      userId: actor.id,
      module: 'FINANCE',
      action: 'POST_ADJUSTMENT',
      entityType: 'AccountAdjustment',
      entityId: adjustmentId,
      after: data,
      requestId,
    });
    return data;
  }

  async analytics(query: FinanceQueryDto) {
    const range = this.range(query);
    const transactionWhere: Prisma.FinancialTransactionWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.purchaseChannelId ? { purchaseChannelId: query.purchaseChannelId } : {}),
      ...(query.buyerId ? { buyerId: query.buyerId } : {}),
      ...(range ? { occurredAt: range } : {}),
    };
    const issueWhere: Prisma.SalesIssueWhereInput = {
      status: DocumentStatus.POSTED,
      ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(range ? { occurredAt: range } : {}),
    };
    const qualityWhere: Prisma.QualityIssueWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const [transactions, issues, qualityIssues, receivableAggregate, payableAggregate] =
      await Promise.all([
        this.prisma.financialTransaction.findMany({
          where: transactionWhere,
          include: {
            salesChannel: true,
            customer: true,
            supplier: true,
            purchaseChannel: true,
            buyer: true,
          },
          orderBy: { occurredAt: 'asc' },
        }),
        this.prisma.salesIssue.findMany({ where: issueWhere }),
        this.prisma.qualityIssue.findMany({ where: qualityWhere }),
        this.prisma.receivable.aggregate({
          where: {
            ...(query.salesChannelId ? { salesChannelId: query.salesChannelId } : {}),
            ...(query.customerId ? { customerId: query.customerId } : {}),
            ...(range?.lt ? { occurredAt: { lt: range.lt } } : {}),
            status: { in: [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_RECEIVED] },
          },
          _sum: { outstandingAmount: true },
        }),
        this.prisma.payable.aggregate({
          where: {
            ...(query.supplierId ? { supplierId: query.supplierId } : {}),
            ...(query.purchaseChannelId ? { purchaseChannelId: query.purchaseChannelId } : {}),
            ...(query.buyerId ? { buyerId: query.buyerId } : {}),
            ...(range?.lt ? { occurredAt: { lt: range.lt } } : {}),
            status: { in: [PayableStatus.OPEN, PayableStatus.PARTIALLY_PAID] },
          },
          _sum: { outstandingAmount: true },
        }),
      ]);
    const zero = new Prisma.Decimal(0);
    const sumTransactions = (
      predicate: (row: (typeof transactions)[number]) => boolean,
    ): Prisma.Decimal =>
      transactions.reduce(
        (sum, row) => (predicate(row) ? sum.plus(row.amount) : sum),
        new Prisma.Decimal(0),
      );
    const income = sumTransactions((row) => row.direction === FinancialDirection.IN);
    const outflow = sumTransactions((row) => row.direction === FinancialDirection.OUT);
    const salesRevenue = issues.reduce(
      (sum, row) => sum.plus(row.totalRevenue),
      new Prisma.Decimal(0),
    );
    const salesCost = issues.reduce((sum, row) => sum.plus(row.totalCost), new Prisma.Decimal(0));
    const qualityLoss = qualityIssues.reduce(
      (sum, row) => sum.plus(row.estimatedLoss),
      new Prisma.Decimal(0),
    );
    const platformFee = sumTransactions(
      (row) => row.category === FinancialTransactionCategory.PLATFORM_FEE,
    );
    const logisticsFee = sumTransactions(
      (row) => row.category === FinancialTransactionCategory.LOGISTICS_FEE,
    );
    const otherExpense = sumTransactions(
      (row) => row.category === FinancialTransactionCategory.OTHER_EXPENSE,
    );
    const supplierCompensation = sumTransactions(
      (row) => row.category === FinancialTransactionCategory.SUPPLIER_COMPENSATION,
    );
    const grossProfit = salesRevenue.minus(salesCost);
    const operatingResult = grossProfit
      .minus(platformFee)
      .minus(logisticsFee)
      .minus(otherExpense)
      .minus(qualityLoss)
      .plus(supplierCompensation);
    const monthly = new Map<
      string,
      {
        month: string;
        income: Prisma.Decimal;
        outflow: Prisma.Decimal;
        salesRevenue: Prisma.Decimal;
        salesCost: Prisma.Decimal;
        qualityLoss: Prisma.Decimal;
      }
    >();
    const monthRow = (date: Date) => {
      const key = date.toISOString().slice(0, 7);
      const existing = monthly.get(key) ?? {
        month: key,
        income: new Prisma.Decimal(0),
        outflow: new Prisma.Decimal(0),
        salesRevenue: new Prisma.Decimal(0),
        salesCost: new Prisma.Decimal(0),
        qualityLoss: new Prisma.Decimal(0),
      };
      monthly.set(key, existing);
      return existing;
    };
    transactions.forEach((row) => {
      const item = monthRow(row.occurredAt);
      if (row.direction === FinancialDirection.IN) item.income = item.income.plus(row.amount);
      else item.outflow = item.outflow.plus(row.amount);
    });
    issues.forEach((row) => {
      const item = monthRow(row.occurredAt);
      item.salesRevenue = item.salesRevenue.plus(row.totalRevenue);
      item.salesCost = item.salesCost.plus(row.totalCost);
    });
    qualityIssues.forEach((row) => {
      const item = monthRow(row.createdAt);
      item.qualityLoss = item.qualityLoss.plus(row.estimatedLoss);
    });
    return {
      summary: {
        income,
        outflow,
        netCashFlow: income.minus(outflow),
        salesRevenue,
        salesCost,
        grossProfit,
        platformFee,
        logisticsFee,
        otherExpense,
        qualityLoss,
        supplierCompensation,
        operatingResult,
        outstandingReceivable: receivableAggregate._sum.outstandingAmount ?? zero,
        outstandingPayable: payableAggregate._sum.outstandingAmount ?? zero,
      },
      monthly: [...monthly.values()]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((row) => ({
          ...row,
          netCashFlow: row.income.minus(row.outflow),
          grossProfit: row.salesRevenue.minus(row.salesCost),
        })),
      dimensions: {
        salesChannels: this.dimensionRows(transactions, 'salesChannel', FinancialDirection.IN),
        customers: this.dimensionRows(transactions, 'customer', FinancialDirection.IN),
        suppliers: this.dimensionRows(transactions, 'supplier', FinancialDirection.OUT),
        purchaseChannels: this.dimensionRows(
          transactions,
          'purchaseChannel',
          FinancialDirection.OUT,
        ),
        buyers: this.dimensionRows(transactions, 'buyer', FinancialDirection.OUT),
      },
    };
  }

  private dimensionRows(
    rows: Array<{
      direction: FinancialDirection;
      amount: Prisma.Decimal;
      salesChannel: { id: string; name: string } | null;
      customer: { id: string; name: string } | null;
      supplier: { id: string; name: string } | null;
      purchaseChannel: { id: string; name: string } | null;
      buyer: { id: string; name: string } | null;
    }>,
    key: 'salesChannel' | 'customer' | 'supplier' | 'purchaseChannel' | 'buyer',
    direction: FinancialDirection,
  ) {
    const values = new Map<string, { id: string; name: string; amount: Prisma.Decimal }>();
    for (const row of rows) {
      const dimension = row[key];
      if (!dimension || row.direction !== direction) continue;
      const current = values.get(dimension.id) ?? {
        id: dimension.id,
        name: dimension.name,
        amount: new Prisma.Decimal(0),
      };
      current.amount = current.amount.plus(row.amount);
      values.set(dimension.id, current);
    }
    return [...values.values()].sort((a, b) => b.amount.comparedTo(a.amount));
  }

  private async paymentDetail(id: string) {
    return this.prisma.payment.findUniqueOrThrow({
      where: { id },
      include: {
        account: true,
        supplier: true,
        customer: true,
        purchaseChannel: true,
        buyer: true,
        salesChannel: true,
        allocations: { include: { payable: true, customerRefund: true, supplierCredit: true } },
        transaction: true,
      },
    });
  }

  private async receiptDetail(id: string) {
    return this.prisma.receipt.findUniqueOrThrow({
      where: { id },
      include: {
        account: true,
        supplier: true,
        customer: true,
        salesChannel: true,
        allocations: {
          include: { receivable: true, supplierCompensationReceivable: true },
        },
        transaction: true,
      },
    });
  }

  private async adjustmentDetail(id: string) {
    return this.prisma.accountAdjustment.findUniqueOrThrow({
      where: { id },
      include: {
        account: true,
        salesChannel: true,
        customer: true,
        supplier: true,
        purchaseChannel: true,
        buyer: true,
        transaction: true,
      },
    });
  }

  private async activeAccount(id: string) {
    const account = await this.prisma.financialAccount.findUnique({ where: { id } });
    if (!account)
      throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: '资金账户不存在' });
    if (account.status !== MasterDataStatus.ACTIVE)
      throw new ConflictException({ code: 'ACCOUNT_INACTIVE', message: '资金账户已停用' });
    return account;
  }

  private sameDimension(values: string[], label: string): string {
    const value = unique(values);
    if (!value)
      throw new UnprocessableEntityException({
        code: 'DIMENSION_MISMATCH',
        message: `同一收付款单的${label}必须一致`,
      });
    return value;
  }

  private sameOptionalDimension(values: Array<string | null>, label: string): string | undefined {
    const normalized = [...new Set(values.map((value) => value ?? 'NULL'))];
    if (normalized.length !== 1)
      throw new UnprocessableEntityException({
        code: 'DIMENSION_MISMATCH',
        message: `同一收付款单的${label}必须一致`,
      });
    return values[0] ?? undefined;
  }

  private requireKey(value: string, action: string) {
    if (!value?.trim())
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: `${action}必须提供 Idempotency-Key`,
      });
  }

  private async replay(scope: string, key: string, value: string): Promise<string | undefined> {
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (!existing) return undefined;
    if (existing.requestHash !== requestHash(value))
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: '相同幂等键已用于不同请求',
      });
    return String((existing.responseJson as { id: string }).id);
  }

  private range(query: FinanceQueryDto): { gte?: Date; lt?: Date } | undefined {
    if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      return {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lt: new Date(Date.UTC(year, month, 1)),
      };
    }
    if (!query.createdFrom && !query.createdTo) return undefined;
    return {
      ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
      ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
    };
  }

  private dateWhere(query: FinanceQueryDto, field: string): Record<string, unknown> {
    const range = this.range(query);
    return range ? { [field]: range } : {};
  }

  private async page(delegate: object, where: object, query: FinanceQueryDto, include: object) {
    const operations = delegate as {
      findMany(args: object): Promise<unknown[]>;
      count(args: object): Promise<number>;
    };
    const [data, total] = await Promise.all([
      operations.findMany({
        where,
        include,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      operations.count({ where }),
    ]);
    return { data, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  private assertSort(value: string, allowed: readonly string[]) {
    if (!allowed.includes(value))
      throw new UnprocessableEntityException({
        code: 'SORT_FIELD_INVALID',
        message: `不支持按 ${value} 排序`,
      });
  }
}

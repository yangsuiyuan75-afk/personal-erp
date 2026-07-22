-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('BANK', 'ALIPAY', 'PAYPAL', 'PLATFORM_BALANCE', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "FinancialTransactionCategory" AS ENUM ('SALES_RECEIPT', 'SUPPLIER_COMPENSATION', 'PURCHASE_PAYMENT', 'CUSTOMER_REFUND', 'PLATFORM_FEE', 'LOGISTICS_FEE', 'OTHER_INCOME', 'OTHER_EXPENSE', 'ACCOUNT_ADJUSTMENT');

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinancialAccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "supplierId" UUID,
    "customerId" UUID,
    "purchaseChannelId" UUID,
    "buyerId" UUID,
    "salesChannelId" UUID,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "amount" DECIMAL(30,4) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "settlementPeriod" TEXT,
    "remark" TEXT,
    "transactionId" UUID,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "payableId" UUID,
    "customerRefundId" UUID,
    "supplierCreditId" UUID,
    "amount" DECIMAL(30,4) NOT NULL,
    "creditAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "customerId" UUID,
    "supplierId" UUID,
    "salesChannelId" UUID,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "amount" DECIMAL(30,4) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "settlementPeriod" TEXT,
    "remark" TEXT,
    "transactionId" UUID,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptAllocation" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "receivableId" UUID,
    "supplierCompensationReceivableId" UUID,
    "amount" DECIMAL(30,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountAdjustment" (
    "id" UUID NOT NULL,
    "adjustmentNo" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "direction" "FinancialDirection" NOT NULL,
    "category" "FinancialTransactionCategory" NOT NULL,
    "amount" DECIMAL(30,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "salesChannelId" UUID,
    "customerId" UUID,
    "supplierId" UUID,
    "purchaseChannelId" UUID,
    "buyerId" UUID,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "transactionId" UUID,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" UUID NOT NULL,
    "transactionNo" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "direction" "FinancialDirection" NOT NULL,
    "category" "FinancialTransactionCategory" NOT NULL,
    "amount" DECIMAL(30,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "salesChannelId" UUID,
    "customerId" UUID,
    "supplierId" UUID,
    "purchaseChannelId" UUID,
    "buyerId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_code_key" ON "FinancialAccount"("code");

-- CreateIndex
CREATE INDEX "FinancialAccount_status_type_createdAt_idx" ON "FinancialAccount"("status", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentNo_key" ON "Payment"("paymentNo");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "Payment_accountId_status_occurredAt_idx" ON "Payment"("accountId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Payment_supplierId_purchaseChannelId_buyerId_occurredAt_idx" ON "Payment"("supplierId", "purchaseChannelId", "buyerId", "occurredAt");

-- CreateIndex
CREATE INDEX "Payment_customerId_salesChannelId_occurredAt_idx" ON "Payment"("customerId", "salesChannelId", "occurredAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_payableId_idx" ON "PaymentAllocation"("payableId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_customerRefundId_idx" ON "PaymentAllocation"("customerRefundId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_supplierCreditId_idx" ON "PaymentAllocation"("supplierCreditId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNo_key" ON "Receipt"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_transactionId_key" ON "Receipt"("transactionId");

-- CreateIndex
CREATE INDEX "Receipt_accountId_status_occurredAt_idx" ON "Receipt"("accountId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Receipt_customerId_salesChannelId_occurredAt_idx" ON "Receipt"("customerId", "salesChannelId", "occurredAt");

-- CreateIndex
CREATE INDEX "Receipt_supplierId_occurredAt_idx" ON "Receipt"("supplierId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReceiptAllocation_receiptId_idx" ON "ReceiptAllocation"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptAllocation_receivableId_idx" ON "ReceiptAllocation"("receivableId");

-- CreateIndex
CREATE INDEX "ReceiptAllocation_supplierCompensationReceivableId_idx" ON "ReceiptAllocation"("supplierCompensationReceivableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountAdjustment_adjustmentNo_key" ON "AccountAdjustment"("adjustmentNo");

-- CreateIndex
CREATE UNIQUE INDEX "AccountAdjustment_transactionId_key" ON "AccountAdjustment"("transactionId");

-- CreateIndex
CREATE INDEX "AccountAdjustment_accountId_status_occurredAt_idx" ON "AccountAdjustment"("accountId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountAdjustment_category_occurredAt_idx" ON "AccountAdjustment"("category", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_transactionNo_key" ON "FinancialTransaction"("transactionNo");

-- CreateIndex
CREATE INDEX "FinancialTransaction_accountId_occurredAt_idx" ON "FinancialTransaction"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_direction_category_occurredAt_idx" ON "FinancialTransaction"("direction", "category", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_salesChannelId_customerId_occurredAt_idx" ON "FinancialTransaction"("salesChannelId", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_supplierId_purchaseChannelId_buyerId_o_idx" ON "FinancialTransaction"("supplierId", "purchaseChannelId", "buyerId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_sourceType_sourceId_key" ON "FinancialTransaction"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_purchaseChannelId_fkey" FOREIGN KEY ("purchaseChannelId") REFERENCES "PurchaseChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_customerRefundId_fkey" FOREIGN KEY ("customerRefundId") REFERENCES "CustomerRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_supplierCreditId_fkey" FOREIGN KEY ("supplierCreditId") REFERENCES "SupplierCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_supplierCompensationReceivableId_fkey" FOREIGN KEY ("supplierCompensationReceivableId") REFERENCES "SupplierCompensationReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_purchaseChannelId_fkey" FOREIGN KEY ("purchaseChannelId") REFERENCES "PurchaseChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdjustment" ADD CONSTRAINT "AccountAdjustment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_purchaseChannelId_fkey" FOREIGN KEY ("purchaseChannelId") REFERENCES "PurchaseChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

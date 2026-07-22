-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_ISSUED', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PARTIALLY_RECEIVED', 'SETTLED', 'VOID');

-- CreateEnum
CREATE TYPE "CustomerRefundStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "ChannelAllocationItem" ADD COLUMN     "consumedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SalesPrice" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "salesChannelId" UUID,
    "customerId" UUID,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "price" DECIMAL(18,6) NOT NULL,
    "minQuantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL,
    "orderNo" TEXT NOT NULL,
    "salesChannelId" UUID NOT NULL,
    "customerId" UUID,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "totalAmount" DECIMAL(30,4) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "lineAmount" DECIMAL(30,4) NOT NULL,
    "issuedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "returnedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "remark" TEXT,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesIssue" (
    "id" UUID NOT NULL,
    "issueNo" TEXT NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "salesChannelId" UUID NOT NULL,
    "customerId" UUID,
    "locationId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "totalRevenue" DECIMAL(30,4) NOT NULL,
    "totalCost" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3),
    "transactionId" UUID,
    "receivableId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesIssueItem" (
    "id" UUID NOT NULL,
    "salesIssueId" UUID NOT NULL,
    "salesOrderItemId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "returnedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "revenueAmount" DECIMAL(30,4) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "transactionLineId" UUID,
    "remark" TEXT,

    CONSTRAINT "SalesIssueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" UUID NOT NULL,
    "returnNo" TEXT NOT NULL,
    "salesIssueId" UUID NOT NULL,
    "salesChannelId" UUID NOT NULL,
    "customerId" UUID,
    "qcLocationId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "totalRefund" DECIMAL(30,4) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "transactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnItem" (
    "id" UUID NOT NULL,
    "salesReturnId" UUID NOT NULL,
    "salesIssueItemId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "inspectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "refundAmount" DECIMAL(30,4) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "remark" TEXT,

    CONSTRAINT "SalesReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnBatchTrace" (
    "id" UUID NOT NULL,
    "salesReturnItemId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "SalesReturnBatchTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" UUID NOT NULL,
    "receivableNo" TEXT NOT NULL,
    "customerId" UUID,
    "salesChannelId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "originalAmount" DECIMAL(30,4) NOT NULL,
    "adjustedAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "receivedAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(30,4) NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivableAdjustment" (
    "id" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DECIMAL(30,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivableAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRefund" (
    "id" UUID NOT NULL,
    "refundNo" TEXT NOT NULL,
    "customerId" UUID,
    "salesChannelId" UUID NOT NULL,
    "salesReturnId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "amount" DECIMAL(30,4) NOT NULL,
    "paidAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "status" "CustomerRefundStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesPrice_skuId_customerId_salesChannelId_effectiveFrom_idx" ON "SalesPrice"("skuId", "customerId", "salesChannelId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SalesPrice_status_effectiveFrom_idx" ON "SalesPrice"("status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNo_key" ON "SalesOrder"("orderNo");

-- CreateIndex
CREATE INDEX "SalesOrder_salesChannelId_status_orderDate_idx" ON "SalesOrder"("salesChannelId", "status", "orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_orderDate_idx" ON "SalesOrder"("customerId", "orderDate");

-- CreateIndex
CREATE INDEX "SalesOrderItem_salesOrderId_idx" ON "SalesOrderItem"("salesOrderId");

-- CreateIndex
CREATE INDEX "SalesOrderItem_skuId_salesOrderId_idx" ON "SalesOrderItem"("skuId", "salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesIssue_issueNo_key" ON "SalesIssue"("issueNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesIssue_transactionId_key" ON "SalesIssue"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesIssue_receivableId_key" ON "SalesIssue"("receivableId");

-- CreateIndex
CREATE INDEX "SalesIssue_salesChannelId_status_occurredAt_idx" ON "SalesIssue"("salesChannelId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesIssue_customerId_occurredAt_idx" ON "SalesIssue"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesIssue_salesOrderId_idx" ON "SalesIssue"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesIssueItem_transactionLineId_key" ON "SalesIssueItem"("transactionLineId");

-- CreateIndex
CREATE INDEX "SalesIssueItem_skuId_salesIssueId_idx" ON "SalesIssueItem"("skuId", "salesIssueId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesIssueItem_salesIssueId_salesOrderItemId_key" ON "SalesIssueItem"("salesIssueId", "salesOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_returnNo_key" ON "SalesReturn"("returnNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_transactionId_key" ON "SalesReturn"("transactionId");

-- CreateIndex
CREATE INDEX "SalesReturn_salesChannelId_status_occurredAt_idx" ON "SalesReturn"("salesChannelId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesReturn_customerId_occurredAt_idx" ON "SalesReturn"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesReturn_salesIssueId_idx" ON "SalesReturn"("salesIssueId");

-- CreateIndex
CREATE INDEX "SalesReturnItem_skuId_salesReturnId_idx" ON "SalesReturnItem"("skuId", "salesReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturnItem_salesReturnId_salesIssueItemId_key" ON "SalesReturnItem"("salesReturnId", "salesIssueItemId");

-- CreateIndex
CREATE INDEX "SalesReturnBatchTrace_batchId_idx" ON "SalesReturnBatchTrace"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturnBatchTrace_salesReturnItemId_batchId_key" ON "SalesReturnBatchTrace"("salesReturnItemId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_receivableNo_key" ON "Receivable"("receivableNo");

-- CreateIndex
CREATE INDEX "Receivable_customerId_status_occurredAt_idx" ON "Receivable"("customerId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Receivable_salesChannelId_occurredAt_idx" ON "Receivable"("salesChannelId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_sourceType_sourceId_key" ON "Receivable"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ReceivableAdjustment_sourceType_sourceId_idx" ON "ReceivableAdjustment"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivableAdjustment_receivableId_sourceType_sourceId_key" ON "ReceivableAdjustment"("receivableId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRefund_refundNo_key" ON "CustomerRefund"("refundNo");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRefund_salesReturnId_key" ON "CustomerRefund"("salesReturnId");

-- CreateIndex
CREATE INDEX "CustomerRefund_customerId_status_createdAt_idx" ON "CustomerRefund"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerRefund_salesChannelId_status_createdAt_idx" ON "CustomerRefund"("salesChannelId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "SalesPrice" ADD CONSTRAINT "SalesPrice_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPrice" ADD CONSTRAINT "SalesPrice_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPrice" ADD CONSTRAINT "SalesPrice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIssue" ADD CONSTRAINT "SalesIssue_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIssue" ADD CONSTRAINT "SalesIssue_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIssue" ADD CONSTRAINT "SalesIssue_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIssue" ADD CONSTRAINT "SalesIssue_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIssue" ADD CONSTRAINT "SalesIssue_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIssueItem" ADD CONSTRAINT "SalesIssueItem_salesIssueId_fkey" FOREIGN KEY ("salesIssueId") REFERENCES "SalesIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIssueItem" ADD CONSTRAINT "SalesIssueItem_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIssueItem" ADD CONSTRAINT "SalesIssueItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIssueItem" ADD CONSTRAINT "SalesIssueItem_transactionLineId_fkey" FOREIGN KEY ("transactionLineId") REFERENCES "InventoryTransactionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_salesIssueId_fkey" FOREIGN KEY ("salesIssueId") REFERENCES "SalesIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_qcLocationId_fkey" FOREIGN KEY ("qcLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_salesIssueItemId_fkey" FOREIGN KEY ("salesIssueItemId") REFERENCES "SalesIssueItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnBatchTrace" ADD CONSTRAINT "SalesReturnBatchTrace_salesReturnItemId_fkey" FOREIGN KEY ("salesReturnItemId") REFERENCES "SalesReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnBatchTrace" ADD CONSTRAINT "SalesReturnBatchTrace_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableAdjustment" ADD CONSTRAINT "ReceivableAdjustment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRefund" ADD CONSTRAINT "CustomerRefund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRefund" ADD CONSTRAINT "CustomerRefund_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRefund" ADD CONSTRAINT "CustomerRefund_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

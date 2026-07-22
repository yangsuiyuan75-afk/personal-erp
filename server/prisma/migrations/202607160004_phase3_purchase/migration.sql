CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'SETTLED', 'VOID');
CREATE TYPE "SupplierCreditStatus" AS ENUM ('OPEN', 'PARTIALLY_APPLIED', 'APPLIED', 'VOID');

CREATE TABLE "PurchasePrice" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "buyerId" UUID,
    "purchaseChannelId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "price" DECIMAL(18,6) NOT NULL,
    "minQuantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchasePrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "orderNo" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "buyerId" UUID NOT NULL,
    "purchaseChannelId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedAt" TIMESTAMP(3),
    "remark" TEXT,
    "totalAmount" DECIMAL(30,4) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderItem" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "lineAmount" DECIMAL(30,4) NOT NULL,
    "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "returnedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "remark" TEXT,
    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseReceipt" (
    "id" UUID NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "totalAmount" DECIMAL(30,4) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "transactionId" UUID,
    "payableId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseReceiptItem" (
    "id" UUID NOT NULL,
    "purchaseReceiptId" UUID NOT NULL,
    "purchaseOrderItemId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "returnedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "lineAmount" DECIMAL(30,4) NOT NULL,
    "batchNo" TEXT NOT NULL,
    "remark" TEXT,
    CONSTRAINT "PurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseReturn" (
    "id" UUID NOT NULL,
    "returnNo" TEXT NOT NULL,
    "purchaseReceiptId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "totalAmount" DECIMAL(30,4) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "transactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseReturnItem" (
    "id" UUID NOT NULL,
    "purchaseReturnId" UUID NOT NULL,
    "purchaseReceiptItemId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "amount" DECIMAL(30,4) NOT NULL,
    "remark" TEXT,
    CONSTRAINT "PurchaseReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payable" (
    "id" UUID NOT NULL,
    "payableNo" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseChannelId" UUID NOT NULL,
    "buyerId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "originalAmount" DECIMAL(30,4) NOT NULL,
    "adjustedAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(30,4) NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayableAdjustment" (
    "id" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DECIMAL(30,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayableAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierCredit" (
    "id" UUID NOT NULL,
    "creditNo" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseReturnId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "amount" DECIMAL(30,4) NOT NULL,
    "appliedAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "status" "SupplierCreditStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierCredit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchasePrice_skuId_supplierId_purchaseChannelId_effectiveF_idx" ON "PurchasePrice"("skuId", "supplierId", "purchaseChannelId", "effectiveFrom");
CREATE INDEX "PurchasePrice_buyerId_status_effectiveFrom_idx" ON "PurchasePrice"("buyerId", "status", "effectiveFrom");
CREATE UNIQUE INDEX "PurchaseOrder_orderNo_key" ON "PurchaseOrder"("orderNo");
CREATE INDEX "PurchaseOrder_supplierId_status_orderDate_idx" ON "PurchaseOrder"("supplierId", "status", "orderDate");
CREATE INDEX "PurchaseOrder_purchaseChannelId_buyerId_orderDate_idx" ON "PurchaseOrder"("purchaseChannelId", "buyerId", "orderDate");
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX "PurchaseOrderItem_skuId_purchaseOrderId_idx" ON "PurchaseOrderItem"("skuId", "purchaseOrderId");
CREATE UNIQUE INDEX "PurchaseReceipt_receiptNo_key" ON "PurchaseReceipt"("receiptNo");
CREATE UNIQUE INDEX "PurchaseReceipt_transactionId_key" ON "PurchaseReceipt"("transactionId");
CREATE UNIQUE INDEX "PurchaseReceipt_payableId_key" ON "PurchaseReceipt"("payableId");
CREATE INDEX "PurchaseReceipt_purchaseOrderId_status_occurredAt_idx" ON "PurchaseReceipt"("purchaseOrderId", "status", "occurredAt");
CREATE INDEX "PurchaseReceipt_locationId_occurredAt_idx" ON "PurchaseReceipt"("locationId", "occurredAt");
CREATE INDEX "PurchaseReceiptItem_skuId_purchaseReceiptId_idx" ON "PurchaseReceiptItem"("skuId", "purchaseReceiptId");
CREATE UNIQUE INDEX "PurchaseReceiptItem_purchaseReceiptId_purchaseOrderItemId_key" ON "PurchaseReceiptItem"("purchaseReceiptId", "purchaseOrderItemId");
CREATE UNIQUE INDEX "PurchaseReceiptItem_batchNo_key" ON "PurchaseReceiptItem"("batchNo");
CREATE UNIQUE INDEX "PurchaseReturn_returnNo_key" ON "PurchaseReturn"("returnNo");
CREATE UNIQUE INDEX "PurchaseReturn_transactionId_key" ON "PurchaseReturn"("transactionId");
CREATE INDEX "PurchaseReturn_supplierId_status_occurredAt_idx" ON "PurchaseReturn"("supplierId", "status", "occurredAt");
CREATE INDEX "PurchaseReturn_purchaseReceiptId_idx" ON "PurchaseReturn"("purchaseReceiptId");
CREATE UNIQUE INDEX "PurchaseReturnItem_purchaseReturnId_purchaseReceiptItemId_key" ON "PurchaseReturnItem"("purchaseReturnId", "purchaseReceiptItemId");
CREATE UNIQUE INDEX "Payable_payableNo_key" ON "Payable"("payableNo");
CREATE INDEX "Payable_supplierId_status_occurredAt_idx" ON "Payable"("supplierId", "status", "occurredAt");
CREATE INDEX "Payable_purchaseChannelId_buyerId_occurredAt_idx" ON "Payable"("purchaseChannelId", "buyerId", "occurredAt");
CREATE UNIQUE INDEX "Payable_sourceType_sourceId_key" ON "Payable"("sourceType", "sourceId");
CREATE INDEX "PayableAdjustment_sourceType_sourceId_idx" ON "PayableAdjustment"("sourceType", "sourceId");
CREATE UNIQUE INDEX "PayableAdjustment_payableId_sourceType_sourceId_key" ON "PayableAdjustment"("payableId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "SupplierCredit_creditNo_key" ON "SupplierCredit"("creditNo");
CREATE UNIQUE INDEX "SupplierCredit_purchaseReturnId_key" ON "SupplierCredit"("purchaseReturnId");
CREATE INDEX "SupplierCredit_supplierId_status_createdAt_idx" ON "SupplierCredit"("supplierId", "status", "createdAt");
CREATE UNIQUE INDEX "InventoryBatch_purchaseReceiptItemId_key" ON "InventoryBatch"("purchaseReceiptItemId");

ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_purchaseReceiptItemId_fkey" FOREIGN KEY ("purchaseReceiptItemId") REFERENCES "PurchaseReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchasePrice" ADD CONSTRAINT "PurchasePrice_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchasePrice" ADD CONSTRAINT "PurchasePrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchasePrice" ADD CONSTRAINT "PurchasePrice_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchasePrice" ADD CONSTRAINT "PurchasePrice_purchaseChannelId_fkey" FOREIGN KEY ("purchaseChannelId") REFERENCES "PurchaseChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseChannelId_fkey" FOREIGN KEY ("purchaseChannelId") REFERENCES "PurchaseChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_purchaseReceiptItemId_fkey" FOREIGN KEY ("purchaseReceiptItemId") REFERENCES "PurchaseReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_purchaseChannelId_fkey" FOREIGN KEY ("purchaseChannelId") REFERENCES "PurchaseChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayableAdjustment" ADD CONSTRAINT "PayableAdjustment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

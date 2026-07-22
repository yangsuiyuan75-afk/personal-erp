CREATE TYPE "InventoryStockStatus" AS ENUM ('AVAILABLE', 'QC_PENDING', 'DEFECTIVE', 'SUPPLIER_CLAIM', 'SCRAPPED');
CREATE TYPE "InventoryLocationType" AS ENUM ('PHYSICAL_WAREHOUSE', 'EXTERNAL_WAREHOUSE', 'QC_AREA', 'DEFECTIVE_AREA', 'CLAIM_AREA', 'SCRAP_AREA');
CREATE TYPE "InventoryTransactionType" AS ENUM ('OPENING_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'PURCHASE_RECEIPT', 'PURCHASE_RETURN', 'SALES_ISSUE', 'SALES_RETURN_QC', 'QC_RELEASE', 'QC_DEFECTIVE', 'QC_CLAIM', 'SCRAP', 'SUPPLIER_REPLACEMENT', 'REVERSAL');
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
CREATE TYPE "AdjustmentDirection" AS ENUM ('IN', 'OUT');

DROP INDEX "IdempotencyRecord_key_key";
ALTER TABLE "IdempotencyRecord" ADD COLUMN "scope" TEXT NOT NULL;
ALTER TABLE "SalesChannel" ADD COLUMN "defaultLocationId" UUID;
ALTER TABLE "SystemSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "InventoryLocation" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InventoryLocationType" NOT NULL,
    "parentId" UUID,
    "salesChannelId" UUID,
    "isLeaf" BOOLEAN NOT NULL DEFAULT true,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryBalance" (
    "locationId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "stockStatus" "InventoryStockStatus" NOT NULL,
    "onHandQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reservedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "inventoryValue" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("locationId","skuId","stockStatus")
);

CREATE TABLE "InventoryTransaction" (
    "id" UUID NOT NULL,
    "transactionNo" TEXT NOT NULL,
    "type" "InventoryTransactionType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversedTransactionId" UUID,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryTransactionLine" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "stockStatus" "InventoryStockStatus" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "amount" DECIMAL(30,4) NOT NULL,
    "remark" TEXT,
    CONSTRAINT "InventoryTransactionLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryBatch" (
    "id" UUID NOT NULL,
    "batchNo" TEXT NOT NULL,
    "skuId" UUID NOT NULL,
    "supplierId" UUID,
    "purchaseReceiptItemId" UUID,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "receivedQuantity" DECIMAL(18,4) NOT NULL,
    "remainingQuantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryBatchAllocation" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "transactionLineId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    CONSTRAINT "InventoryBatchAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryOpening" (
    "id" UUID NOT NULL,
    "openingNo" TEXT NOT NULL,
    "importKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "postedAt" TIMESTAMP(3),
    "transactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryOpening_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryOpeningItem" (
    "id" UUID NOT NULL,
    "openingId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "stockStatus" "InventoryStockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "batchNo" TEXT NOT NULL,
    "remark" TEXT,
    CONSTRAINT "InventoryOpeningItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryAdjustment" (
    "id" UUID NOT NULL,
    "adjustmentNo" TEXT NOT NULL,
    "direction" "AdjustmentDirection" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "transactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryAdjustmentItem" (
    "id" UUID NOT NULL,
    "adjustmentId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "stockStatus" "InventoryStockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,6),
    "remark" TEXT,
    CONSTRAINT "InventoryAdjustmentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryTransfer" (
    "id" UUID NOT NULL,
    "transferNo" TEXT NOT NULL,
    "fromLocationId" UUID NOT NULL,
    "toLocationId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "postedAt" TIMESTAMP(3),
    "transactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryTransferItem" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "stockStatus" "InventoryStockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "quantity" DECIMAL(18,4) NOT NULL,
    "remark" TEXT,
    CONSTRAINT "InventoryTransferItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelAllocation" (
    "id" UUID NOT NULL,
    "allocationNo" TEXT NOT NULL,
    "salesChannelId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelAllocationItem" (
    "id" UUID NOT NULL,
    "channelAllocationId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    CONSTRAINT "ChannelAllocationItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryLocation_code_key" ON "InventoryLocation"("code");
CREATE INDEX "InventoryLocation_type_status_createdAt_idx" ON "InventoryLocation"("type", "status", "createdAt");
CREATE INDEX "InventoryLocation_salesChannelId_status_idx" ON "InventoryLocation"("salesChannelId", "status");
CREATE INDEX "InventoryBalance_skuId_stockStatus_updatedAt_idx" ON "InventoryBalance"("skuId", "stockStatus", "updatedAt");
CREATE INDEX "InventoryBalance_locationId_stockStatus_updatedAt_idx" ON "InventoryBalance"("locationId", "stockStatus", "updatedAt");
CREATE UNIQUE INDEX "InventoryTransaction_transactionNo_key" ON "InventoryTransaction"("transactionNo");
CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON "InventoryTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "InventoryTransaction_reversedTransactionId_key" ON "InventoryTransaction"("reversedTransactionId");
CREATE INDEX "InventoryTransaction_type_occurredAt_idx" ON "InventoryTransaction"("type", "occurredAt");
CREATE INDEX "InventoryTransaction_sourceType_sourceId_idx" ON "InventoryTransaction"("sourceType", "sourceId");
CREATE INDEX "InventoryTransactionLine_locationId_skuId_stockStatus_idx" ON "InventoryTransactionLine"("locationId", "skuId", "stockStatus");
CREATE INDEX "InventoryTransactionLine_skuId_transactionId_idx" ON "InventoryTransactionLine"("skuId", "transactionId");
CREATE UNIQUE INDEX "InventoryBatch_batchNo_key" ON "InventoryBatch"("batchNo");
CREATE INDEX "InventoryBatch_skuId_receivedAt_idx" ON "InventoryBatch"("skuId", "receivedAt");
CREATE INDEX "InventoryBatch_supplierId_receivedAt_idx" ON "InventoryBatch"("supplierId", "receivedAt");
CREATE INDEX "InventoryBatchAllocation_transactionLineId_idx" ON "InventoryBatchAllocation"("transactionLineId");
CREATE UNIQUE INDEX "InventoryBatchAllocation_batchId_transactionLineId_key" ON "InventoryBatchAllocation"("batchId", "transactionLineId");
CREATE UNIQUE INDEX "InventoryOpening_openingNo_key" ON "InventoryOpening"("openingNo");
CREATE UNIQUE INDEX "InventoryOpening_importKey_key" ON "InventoryOpening"("importKey");
CREATE UNIQUE INDEX "InventoryOpening_transactionId_key" ON "InventoryOpening"("transactionId");
CREATE INDEX "InventoryOpening_status_occurredAt_idx" ON "InventoryOpening"("status", "occurredAt");
CREATE UNIQUE INDEX "InventoryOpeningItem_openingId_locationId_skuId_stockStatus_key" ON "InventoryOpeningItem"("openingId", "locationId", "skuId", "stockStatus");
CREATE UNIQUE INDEX "InventoryAdjustment_adjustmentNo_key" ON "InventoryAdjustment"("adjustmentNo");
CREATE UNIQUE INDEX "InventoryAdjustment_transactionId_key" ON "InventoryAdjustment"("transactionId");
CREATE INDEX "InventoryAdjustment_status_occurredAt_idx" ON "InventoryAdjustment"("status", "occurredAt");
CREATE INDEX "InventoryAdjustmentItem_adjustmentId_idx" ON "InventoryAdjustmentItem"("adjustmentId");
CREATE UNIQUE INDEX "InventoryTransfer_transferNo_key" ON "InventoryTransfer"("transferNo");
CREATE UNIQUE INDEX "InventoryTransfer_transactionId_key" ON "InventoryTransfer"("transactionId");
CREATE INDEX "InventoryTransfer_status_occurredAt_idx" ON "InventoryTransfer"("status", "occurredAt");
CREATE INDEX "InventoryTransfer_fromLocationId_toLocationId_idx" ON "InventoryTransfer"("fromLocationId", "toLocationId");
CREATE INDEX "InventoryTransferItem_transferId_idx" ON "InventoryTransferItem"("transferId");
CREATE UNIQUE INDEX "ChannelAllocation_allocationNo_key" ON "ChannelAllocation"("allocationNo");
CREATE INDEX "ChannelAllocation_salesChannelId_locationId_idx" ON "ChannelAllocation"("salesChannelId", "locationId");
CREATE UNIQUE INDEX "ChannelAllocationItem_channelAllocationId_skuId_key" ON "ChannelAllocationItem"("channelAllocationId", "skuId");
CREATE UNIQUE INDEX "IdempotencyRecord_scope_key_key" ON "IdempotencyRecord"("scope", "key");

ALTER TABLE "SalesChannel" ADD CONSTRAINT "SalesChannel_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_reversedTransactionId_fkey" FOREIGN KEY ("reversedTransactionId") REFERENCES "InventoryTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransactionLine" ADD CONSTRAINT "InventoryTransactionLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "InventoryTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransactionLine" ADD CONSTRAINT "InventoryTransactionLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransactionLine" ADD CONSTRAINT "InventoryTransactionLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatchAllocation" ADD CONSTRAINT "InventoryBatchAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatchAllocation" ADD CONSTRAINT "InventoryBatchAllocation_transactionLineId_fkey" FOREIGN KEY ("transactionLineId") REFERENCES "InventoryTransactionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryOpeningItem" ADD CONSTRAINT "InventoryOpeningItem_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "InventoryOpening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryOpeningItem" ADD CONSTRAINT "InventoryOpeningItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryOpeningItem" ADD CONSTRAINT "InventoryOpeningItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustmentItem" ADD CONSTRAINT "InventoryAdjustmentItem_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "InventoryAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustmentItem" ADD CONSTRAINT "InventoryAdjustmentItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustmentItem" ADD CONSTRAINT "InventoryAdjustmentItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransferItem" ADD CONSTRAINT "InventoryTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "InventoryTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransferItem" ADD CONSTRAINT "InventoryTransferItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelAllocation" ADD CONSTRAINT "ChannelAllocation_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelAllocation" ADD CONSTRAINT "ChannelAllocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelAllocationItem" ADD CONSTRAINT "ChannelAllocationItem_channelAllocationId_fkey" FOREIGN KEY ("channelAllocationId") REFERENCES "ChannelAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelAllocationItem" ADD CONSTRAINT "ChannelAllocationItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

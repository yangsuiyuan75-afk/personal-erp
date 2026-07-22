-- CreateEnum
CREATE TYPE "QualityResponsibility" AS ENUM ('UNKNOWN', 'SUPPLIER', 'CUSTOMER', 'LOGISTICS', 'INTERNAL');

-- CreateEnum
CREATE TYPE "QualityInspectionStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "QualityIssueStatus" AS ENUM ('OPEN', 'CLAIMED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupplierClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PARTIALLY_SETTLED', 'SETTLED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClaimResolutionType" AS ENUM ('REPLACEMENT', 'CASH_COMPENSATION', 'CREDIT_COMPENSATION', 'REJECTED', 'SELF_BEAR', 'SCRAP');

-- AlterTable
ALTER TABLE "SupplierCredit" ADD COLUMN     "supplierClaimSettlementId" UUID,
ALTER COLUMN "purchaseReturnId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "QualityInspection" (
    "id" UUID NOT NULL,
    "inspectionNo" TEXT NOT NULL,
    "salesReturnId" UUID NOT NULL,
    "status" "QualityInspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "inspectedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityInspectionItem" (
    "id" UUID NOT NULL,
    "qualityInspectionId" UUID NOT NULL,
    "salesReturnItemId" UUID NOT NULL,
    "goodQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "defectiveQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "supplierClaimQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "scrapQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "responsibility" "QualityResponsibility" NOT NULL DEFAULT 'UNKNOWN',
    "supplierId" UUID,
    "defectDescription" TEXT,
    "estimatedLoss" DECIMAL(30,4) NOT NULL DEFAULT 0,

    CONSTRAINT "QualityInspectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityInventoryMovement" (
    "id" UUID NOT NULL,
    "qualityInspectionId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityInventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityIssue" (
    "id" UUID NOT NULL,
    "issueNo" TEXT NOT NULL,
    "qualityInspectionItemId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "supplierId" UUID,
    "responsibility" "QualityResponsibility" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "estimatedLoss" DECIMAL(30,4) NOT NULL,
    "defectDescription" TEXT NOT NULL,
    "status" "QualityIssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierClaim" (
    "id" UUID NOT NULL,
    "claimNo" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "status" "SupplierClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "claimedAmount" DECIMAL(30,4) NOT NULL,
    "settledAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierClaimItem" (
    "id" UUID NOT NULL,
    "supplierClaimId" UUID NOT NULL,
    "qualityIssueId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "claimAmount" DECIMAL(30,4) NOT NULL,

    CONSTRAINT "SupplierClaimItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierClaimSettlement" (
    "id" UUID NOT NULL,
    "settlementNo" TEXT NOT NULL,
    "supplierClaimId" UUID NOT NULL,
    "resolutionType" "ClaimResolutionType" NOT NULL,
    "quantity" DECIMAL(18,4),
    "amount" DECIMAL(30,4),
    "replacementLocationId" UUID,
    "claimStockLocationId" UUID,
    "scrapLocationId" UUID,
    "disposeQuantity" DECIMAL(18,4),
    "batchNo" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "inventoryTransactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierClaimSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCompensationReceivable" (
    "id" UUID NOT NULL,
    "receivableNo" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierClaimSettlementId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "originalAmount" DECIMAL(30,4) NOT NULL,
    "receivedAmount" DECIMAL(30,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(30,4) NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierCompensationReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspection_inspectionNo_key" ON "QualityInspection"("inspectionNo");

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspection_salesReturnId_key" ON "QualityInspection"("salesReturnId");

-- CreateIndex
CREATE INDEX "QualityInspection_status_inspectedAt_idx" ON "QualityInspection"("status", "inspectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspectionItem_salesReturnItemId_key" ON "QualityInspectionItem"("salesReturnItemId");

-- CreateIndex
CREATE INDEX "QualityInspectionItem_responsibility_qualityInspectionId_idx" ON "QualityInspectionItem"("responsibility", "qualityInspectionId");

-- CreateIndex
CREATE INDEX "QualityInspectionItem_supplierId_idx" ON "QualityInspectionItem"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityInventoryMovement_transactionId_key" ON "QualityInventoryMovement"("transactionId");

-- CreateIndex
CREATE INDEX "QualityInventoryMovement_qualityInspectionId_idx" ON "QualityInventoryMovement"("qualityInspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityIssue_issueNo_key" ON "QualityIssue"("issueNo");

-- CreateIndex
CREATE UNIQUE INDEX "QualityIssue_qualityInspectionItemId_key" ON "QualityIssue"("qualityInspectionItemId");

-- CreateIndex
CREATE INDEX "QualityIssue_supplierId_responsibility_createdAt_idx" ON "QualityIssue"("supplierId", "responsibility", "createdAt");

-- CreateIndex
CREATE INDEX "QualityIssue_skuId_status_createdAt_idx" ON "QualityIssue"("skuId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierClaim_claimNo_key" ON "SupplierClaim"("claimNo");

-- CreateIndex
CREATE INDEX "SupplierClaim_supplierId_status_submittedAt_idx" ON "SupplierClaim"("supplierId", "status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierClaimItem_qualityIssueId_key" ON "SupplierClaimItem"("qualityIssueId");

-- CreateIndex
CREATE INDEX "SupplierClaimItem_supplierClaimId_idx" ON "SupplierClaimItem"("supplierClaimId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierClaimSettlement_settlementNo_key" ON "SupplierClaimSettlement"("settlementNo");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierClaimSettlement_inventoryTransactionId_key" ON "SupplierClaimSettlement"("inventoryTransactionId");

-- CreateIndex
CREATE INDEX "SupplierClaimSettlement_supplierClaimId_occurredAt_idx" ON "SupplierClaimSettlement"("supplierClaimId", "occurredAt");

-- CreateIndex
CREATE INDEX "SupplierClaimSettlement_resolutionType_occurredAt_idx" ON "SupplierClaimSettlement"("resolutionType", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCompensationReceivable_receivableNo_key" ON "SupplierCompensationReceivable"("receivableNo");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCompensationReceivable_supplierClaimSettlementId_key" ON "SupplierCompensationReceivable"("supplierClaimSettlementId");

-- CreateIndex
CREATE INDEX "SupplierCompensationReceivable_supplierId_status_occurredAt_idx" ON "SupplierCompensationReceivable"("supplierId", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCredit_supplierClaimSettlementId_key" ON "SupplierCredit"("supplierClaimSettlementId");

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_supplierClaimSettlementId_fkey" FOREIGN KEY ("supplierClaimSettlementId") REFERENCES "SupplierClaimSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspectionItem" ADD CONSTRAINT "QualityInspectionItem_qualityInspectionId_fkey" FOREIGN KEY ("qualityInspectionId") REFERENCES "QualityInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspectionItem" ADD CONSTRAINT "QualityInspectionItem_salesReturnItemId_fkey" FOREIGN KEY ("salesReturnItemId") REFERENCES "SalesReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInventoryMovement" ADD CONSTRAINT "QualityInventoryMovement_qualityInspectionId_fkey" FOREIGN KEY ("qualityInspectionId") REFERENCES "QualityInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInventoryMovement" ADD CONSTRAINT "QualityInventoryMovement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "InventoryTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityIssue" ADD CONSTRAINT "QualityIssue_qualityInspectionItemId_fkey" FOREIGN KEY ("qualityInspectionItemId") REFERENCES "QualityInspectionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityIssue" ADD CONSTRAINT "QualityIssue_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityIssue" ADD CONSTRAINT "QualityIssue_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimItem" ADD CONSTRAINT "SupplierClaimItem_supplierClaimId_fkey" FOREIGN KEY ("supplierClaimId") REFERENCES "SupplierClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimItem" ADD CONSTRAINT "SupplierClaimItem_qualityIssueId_fkey" FOREIGN KEY ("qualityIssueId") REFERENCES "QualityIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimSettlement" ADD CONSTRAINT "SupplierClaimSettlement_supplierClaimId_fkey" FOREIGN KEY ("supplierClaimId") REFERENCES "SupplierClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimSettlement" ADD CONSTRAINT "SupplierClaimSettlement_replacementLocationId_fkey" FOREIGN KEY ("replacementLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimSettlement" ADD CONSTRAINT "SupplierClaimSettlement_claimStockLocationId_fkey" FOREIGN KEY ("claimStockLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimSettlement" ADD CONSTRAINT "SupplierClaimSettlement_scrapLocationId_fkey" FOREIGN KEY ("scrapLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimSettlement" ADD CONSTRAINT "SupplierClaimSettlement_inventoryTransactionId_fkey" FOREIGN KEY ("inventoryTransactionId") REFERENCES "InventoryTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCompensationReceivable" ADD CONSTRAINT "SupplierCompensationReceivable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCompensationReceivable" ADD CONSTRAINT "SupplierCompensationReceivable_supplierClaimSettlementId_fkey" FOREIGN KEY ("supplierClaimSettlementId") REFERENCES "SupplierClaimSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

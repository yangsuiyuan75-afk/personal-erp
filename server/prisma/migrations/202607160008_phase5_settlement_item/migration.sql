-- AlterTable
ALTER TABLE "SupplierClaimSettlement" ADD COLUMN     "supplierClaimItemId" UUID;

-- CreateIndex
CREATE INDEX "SupplierClaimSettlement_supplierClaimItemId_occurredAt_idx" ON "SupplierClaimSettlement"("supplierClaimItemId", "occurredAt");

-- AddForeignKey
ALTER TABLE "SupplierClaimSettlement" ADD CONSTRAINT "SupplierClaimSettlement_supplierClaimItemId_fkey" FOREIGN KEY ("supplierClaimItemId") REFERENCES "SupplierClaimItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

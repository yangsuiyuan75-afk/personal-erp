-- AlterTable
ALTER TABLE "SupplierClaimSettlement" ADD COLUMN     "postedAt" TIMESTAMP(3),
ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT';

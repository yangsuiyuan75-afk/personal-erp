-- Preserve the distinction between real cash payments and supplier-credit settlement.
ALTER TABLE "Payable"
ADD COLUMN "creditedAmount" DECIMAL(30,4) NOT NULL DEFAULT 0;

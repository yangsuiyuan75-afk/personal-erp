CREATE TYPE "ExpenseCategory" AS ENUM (
  'OFFICE_SUPPLIES',
  'QUALIFICATION',
  'PREMISES',
  'UTILITIES',
  'TRAVEL',
  'OTHER'
);

ALTER TABLE "AccountAdjustment"
  ADD COLUMN "expenseCategory" "ExpenseCategory",
  ADD COLUMN "payee" TEXT;

CREATE INDEX "AccountAdjustment_expenseCategory_status_occurredAt_idx"
  ON "AccountAdjustment"("expenseCategory", "status", "occurredAt");

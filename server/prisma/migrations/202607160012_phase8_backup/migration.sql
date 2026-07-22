CREATE TYPE "BackupStatus" AS ENUM ('CREATING', 'UPLOADING', 'VERIFIED', 'FAILED', 'EXPIRED');

CREATE TYPE "BackupFormat" AS ENUM ('POSTGRES_CUSTOM');

CREATE TYPE "BackupTrigger" AS ENUM ('MANUAL', 'STARTUP_COMPENSATION', 'OPERATION_THRESHOLD', 'PRE_RESTORE', 'BOOTSTRAP_IMPORT');

CREATE TABLE "BackupHistory" (
    "id" UUID NOT NULL,
    "backupNo" TEXT NOT NULL,
    "fileAssetId" UUID,
    "createdById" UUID,
    "status" "BackupStatus" NOT NULL DEFAULT 'CREATING',
    "format" "BackupFormat" NOT NULL DEFAULT 'POSTGRES_CUSTOM',
    "trigger" "BackupTrigger" NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "postgresVersion" TEXT,
    "sha256" TEXT,
    "size" BIGINT NOT NULL DEFAULT 0,
    "manifest" JSONB,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "localAvailable" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "cloudUploadedAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackupHistory_backupNo_key" ON "BackupHistory"("backupNo");
CREATE UNIQUE INDEX "BackupHistory_fileAssetId_key" ON "BackupHistory"("fileAssetId");
CREATE INDEX "BackupHistory_status_startedAt_idx" ON "BackupHistory"("status", "startedAt");
CREATE INDEX "BackupHistory_trigger_startedAt_idx" ON "BackupHistory"("trigger", "startedAt");
CREATE INDEX "BackupHistory_locked_completedAt_idx" ON "BackupHistory"("locked", "completedAt");

ALTER TABLE "BackupHistory"
ADD CONSTRAINT "BackupHistory_fileAssetId_fkey"
FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BackupHistory"
ADD CONSTRAINT "BackupHistory_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

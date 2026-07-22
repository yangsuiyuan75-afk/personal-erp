-- CreateEnum
CREATE TYPE "StorageProviderType" AS ENUM ('ONEDRIVE', 'MOCK_LOCAL');

-- CreateEnum
CREATE TYPE "FileAssetStatus" AS ENUM ('PENDING', 'UPLOADING', 'SYNCED', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" UUID NOT NULL,
    "provider" "StorageProviderType" NOT NULL,
    "driveId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "parentItemId" TEXT,
    "logicalPath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "eTag" TEXT,
    "status" "FileAssetStatus" NOT NULL DEFAULT 'SYNCED',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "fileAssetId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAssociation" (
    "id" UUID NOT NULL,
    "fileAssetId" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileAsset_status_createdAt_idx" ON "FileAsset"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FileAsset_provider_logicalPath_idx" ON "FileAsset"("provider", "logicalPath");

-- CreateIndex
CREATE INDEX "FileAsset_sha256_idx" ON "FileAsset"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_provider_driveId_itemId_key" ON "FileAsset"("provider", "driveId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_fileAssetId_key" ON "ProductImage"("fileAssetId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_isPrimary_sortOrder_idx" ON "ProductImage"("productId", "isPrimary", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_sortOrder_key" ON "ProductImage"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "FileAssociation_module_entityType_entityId_idx" ON "FileAssociation"("module", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FileAssociation_fileAssetId_module_entityType_entityId_key" ON "FileAssociation"("fileAssetId", "module", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAssociation" ADD CONSTRAINT "FileAssociation_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

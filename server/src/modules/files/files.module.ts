import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FilesService } from './files.service';
import { OneDriveController } from './onedrive.controller';
import { OneDriveService } from './onedrive/onedrive.service';
import { OneDriveTokenCacheService } from './onedrive/onedrive-token-cache.service';
import { MockStorageProvider } from './storage/mock-storage.provider';
import { OneDriveStorageProvider } from './storage/onedrive-storage.provider';
import { ProductImagesController } from './product-images.controller';

@Module({
  imports: [AuditModule],
  controllers: [ProductImagesController, OneDriveController],
  providers: [
    FilesService,
    OneDriveService,
    OneDriveTokenCacheService,
    MockStorageProvider,
    OneDriveStorageProvider,
  ],
  exports: [FilesService, OneDriveService],
})
export class FilesModule {}

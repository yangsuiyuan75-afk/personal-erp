import { ConfigService } from '@nestjs/config';
import { FileAssetStatus, PrismaClient, StorageProviderType } from '@prisma/client';
import type { TokenCacheContext } from '@azure/msal-node';
import { SortOrder } from '../src/common/dto/list-query.dto';
import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { FilesService } from '../src/modules/files/files.service';
import { OneDriveService } from '../src/modules/files/onedrive/onedrive.service';
import { OneDriveTokenCacheService } from '../src/modules/files/onedrive/onedrive-token-cache.service';
import { MockStorageProvider } from '../src/modules/files/storage/mock-storage.provider';
import { OneDriveStorageProvider } from '../src/modules/files/storage/onedrive-storage.provider';
import { cleanDatabase } from './database-cleanup';

describe('Phase 7 files integration', () => {
  const prisma = new PrismaService();
  const config = new ConfigService({
    NODE_ENV: 'test',
    JWT_REFRESH_SECRET: 'phase7-test-refresh-secret-at-least-32-characters',
    MICROSOFT_CLIENT_ID: '',
    MICROSOFT_AUTHORITY: 'https://login.microsoftonline.com/consumers',
    ONEDRIVE_ROOT_FOLDER: 'ERP_STORAGE',
  });
  const audit = new AuditService(prisma);
  const tokenCache = new OneDriveTokenCacheService(prisma, config);
  const oneDrive = new OneDriveService(prisma, config, tokenCache);
  const mockProvider = new MockStorageProvider(config);
  const oneDriveProvider = new OneDriveStorageProvider(oneDrive);
  const files = new FilesService(prisma, audit, oneDrive, mockProvider, oneDriveProvider);
  let actor: { id: string; username: string };
  let productId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDatabase(prisma as PrismaClient);
    const user = await prisma.adminUser.create({
      data: { username: 'files-integration', passwordHash: 'not-used' },
    });
    actor = { id: user.id, username: user.username };
    const category = await prisma.category.create({
      data: { code: 'FILES-CAT', name: '文件测试类目' },
    });
    const product = await prisma.product.create({
      data: { code: 'FILES-PROD', name: '图片测试商品', categoryId: category.id },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await cleanDatabase(prisma as PrismaClient);
    await prisma.$disconnect();
  });

  it('reports missing external configuration while keeping the mock provider available', async () => {
    await expect(oneDrive.status()).resolves.toMatchObject({
      code: 'CLIENT_ID_MISSING',
      label: '未配置 Client ID',
      externalConfigurationStatus: 'WAITING_FOR_EXTERNAL_CONFIGURATION',
      mockProviderAvailable: true,
    });
  });

  it('encrypts the complete MSAL cache before persisting it', async () => {
    const plaintext = JSON.stringify({
      AccessToken: { secret: 'access-token-must-not-be-readable' },
      RefreshToken: { secret: 'refresh-token-must-not-be-readable' },
    });
    await tokenCache.afterCacheAccess({
      cacheHasChanged: true,
      tokenCache: { serialize: () => plaintext },
    } as TokenCacheContext);
    const setting = await prisma.systemSetting.findUniqueOrThrow({
      where: { key: 'onedrive.msal-cache.encrypted' },
    });
    expect(JSON.stringify(setting.value)).not.toContain('access-token-must-not-be-readable');
    expect(JSON.stringify(setting.value)).not.toContain('refresh-token-must-not-be-readable');
    let restored = '';
    await tokenCache.beforeCacheAccess({
      tokenCache: { deserialize: (value: string) => (restored = value) },
    } as unknown as TokenCacheContext);
    expect(restored).toBe(plaintext);
  });

  it('uploads multiple product images, maintains one primary image and reorders atomically', async () => {
    const result = await files.uploadProductImages(
      productId,
      [
        {
          originalname: Buffer.from('车充-front.png').toString('latin1'),
          mimetype: 'image/png',
          size: 8,
          buffer: Buffer.from('png-front'),
        },
        {
          originalname: 'detail.webp',
          mimetype: 'image/webp',
          size: 10,
          buffer: Buffer.from('webp-detail'),
        },
      ],
      { isPrimary: true },
      actor,
    );
    expect(result.images).toHaveLength(2);
    expect(result.images.filter((image) => image.isPrimary)).toHaveLength(1);
    expect(result.images[0].fileAsset).toMatchObject({
      fileName: '车充-front.png',
      provider: StorageProviderType.MOCK_LOCAL,
      status: FileAssetStatus.SYNCED,
    });

    const reversed = [...result.images].reverse().map((image) => image.id);
    const reordered = await files.reorderProductImages(productId, { imageIds: reversed }, actor);
    expect(reordered.images.map((image) => image.id)).toEqual(reversed);
    await files.setPrimary(productId, reversed[0], actor);
    const afterPrimary = await files.productImages(productId);
    expect(afterPrimary.images.find((image) => image.isPrimary)?.id).toBe(reversed[0]);

    const content = await files.content(afterPrimary.images[0].fileAssetId);
    expect(content.content.length).toBeGreaterThan(0);
  });

  it('supports server pagination, search, filters and safe product image deletion', async () => {
    const page = await files.list({
      page: 1,
      pageSize: 10,
      keyword: 'front',
      sortBy: 'fileName',
      sortOrder: SortOrder.ASC,
      productId,
      provider: StorageProviderType.MOCK_LOCAL,
      fileStatus: FileAssetStatus.SYNCED,
    });
    expect(page.meta).toMatchObject({ page: 1, pageSize: 10, total: 1 });
    const gallery = await files.productImages(productId);
    const primary = gallery.images.find((image) => image.isPrimary)!;
    await files.deleteProductImage(productId, primary.id, actor);
    const remaining = await files.productImages(productId);
    expect(remaining.images).toHaveLength(1);
    expect(remaining.images[0].isPrimary).toBe(true);
    expect(
      await prisma.fileAsset.findUniqueOrThrow({ where: { id: primary.fileAssetId } }),
    ).toMatchObject({ status: FileAssetStatus.DELETED });
  });
});

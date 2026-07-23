import { createHash } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  FileAssetStatus,
  MasterDataStatus,
  StorageProviderType,
  type FileAsset,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { OneDriveService } from './onedrive/onedrive.service';
import { MockStorageProvider } from './storage/mock-storage.provider';
import { OneDriveStorageProvider } from './storage/onedrive-storage.provider';
import type { StorageObjectReference, StorageProvider } from './storage/storage-provider';

interface InternalAssociation {
  module: string;
  entityType: string;
  entityId: string;
  label?: string;
}

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BLOCKED_EXTENSIONS = new Set([
  'bat',
  'cmd',
  'com',
  'dll',
  'exe',
  'html',
  'htm',
  'jar',
  'js',
  'mjs',
  'msi',
  'ps1',
  'scr',
  'svg',
  'vbs',
]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_PRODUCT_IMAGES = 12;

export interface InternalFileInput {
  logicalPath: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
  association?: InternalAssociation;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly oneDrive: OneDriveService,
    private readonly mockProvider: MockStorageProvider,
    private readonly oneDriveProvider: OneDriveStorageProvider,
  ) {}

  async storeInternal(
    input: InternalFileInput,
    actor?: AuthUser,
    requestId?: string,
  ): Promise<FileAsset> {
    if (!input.content.length) {
      throw new UnprocessableEntityException({
        code: 'FILE_REQUIRED',
        message: '备份文件内容为空',
      });
    }
    if (input.content.length > 2_000_000_000) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: '内部备份文件超过 2 GB，请先归档历史数据后重试',
      });
    }
    const asset = await this.storeFile(
      {
        originalname: input.fileName,
        mimetype: input.mimeType,
        size: input.content.length,
        buffer: input.content,
      },
      input.logicalPath,
      input.association,
      actor,
      requestId,
    );
    if (asset.status === FileAssetStatus.FAILED) this.throwSyncFailed(asset);
    return asset;
  }

  async uploadProductImages(
    productId: string,
    files: UploadedFile[],
    actor: AuthUser,
    requestId?: string,
  ) {
    if (!files.length) {
      throw new UnprocessableEntityException({ code: 'FILE_REQUIRED', message: '请选择商品图片' });
    }
    files.forEach((file) => this.assertProductImage(file));

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: '商品不存在' });
    if (product.status !== MasterDataStatus.ACTIVE) {
      throw new UnprocessableEntityException({
        code: 'PRODUCT_INACTIVE',
        message: '停用商品不能新增图片',
      });
    }
    const count = await this.prisma.productImage.count({ where: { productId } });
    if (count + files.length > MAX_PRODUCT_IMAGES) {
      throw new UnprocessableEntityException({
        code: 'PRODUCT_IMAGE_LIMIT',
        message: `每个商品最多 ${MAX_PRODUCT_IMAGES} 张图片`,
      });
    }

    const created = [];
    for (const file of files) {
      const asset = await this.storeFile(
        file,
        `Products/${productId}`,
        undefined,
        actor,
        requestId,
        false,
      );
      if (asset.status === FileAssetStatus.FAILED) this.throwSyncFailed(asset, '产品图片');
      try {
        const image = await this.prisma.$transaction(async (tx) => {
          const aggregate = await tx.productImage.aggregate({
            where: { productId },
            _max: { sortOrder: true },
            _count: true,
          });
          return tx.productImage.create({
            data: {
              productId,
              fileAssetId: asset.id,
              isPrimary: aggregate._count === 0,
              sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
            },
            include: { fileAsset: true },
          });
        });
        created.push(image);
      } catch (error) {
        await this.deleteStoredAsset(asset);
        throw error;
      }
    }
    await this.audit.record({
      userId: actor.id,
      module: 'PRODUCTS',
      action: 'UPLOAD_IMAGES',
      entityType: 'Product',
      entityId: productId,
      after: created.map((image) => ({ id: image.id, fileAssetId: image.fileAssetId })),
      requestId,
    });
    return this.productImages(productId);
  }

  async productImages(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, code: true, name: true },
    });
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: '商品不存在' });
    const images = await this.prisma.productImage.findMany({
      where: { productId, fileAsset: { status: FileAssetStatus.SYNCED } },
      include: { fileAsset: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { product, images };
  }

  async productImageContent(productId: string, fileAssetId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { productId, fileAssetId },
      include: { fileAsset: true },
    });
    if (!image || image.fileAsset.status !== FileAssetStatus.SYNCED) {
      throw new NotFoundException({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: '商品图片不存在' });
    }
    return this.providerFor(image.fileAsset.provider).download(this.reference(image.fileAsset));
  }

  async deleteProductImage(
    productId: string,
    imageId: string,
    actor: AuthUser,
    requestId?: string,
  ): Promise<void> {
    const image = await this.requireProductImage(productId, imageId);
    await this.providerFor(image.fileAsset.provider).delete(this.reference(image.fileAsset));
    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: image.id } });
      await tx.fileAsset.update({
        where: { id: image.fileAssetId },
        data: { status: FileAssetStatus.DELETED, lastError: null },
      });
      if (image.isPrimary) {
        const first = await tx.productImage.findFirst({
          where: { productId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        if (first)
          await tx.productImage.update({ where: { id: first.id }, data: { isPrimary: true } });
      }
    });
    await this.audit.record({
      userId: actor.id,
      module: 'PRODUCTS',
      action: 'DELETE_IMAGE',
      entityType: 'ProductImage',
      entityId: imageId,
      before: { productId, fileAssetId: image.fileAssetId, isPrimary: image.isPrimary },
      requestId,
    });
  }

  async content(id: string) {
    const file = await this.requireAsset(id);
    if (file.status === FileAssetStatus.DELETED) {
      throw new NotFoundException({ code: 'FILE_DELETED', message: '备份文件已删除' });
    }
    return this.providerFor(file.provider).download(this.reference(file));
  }

  async deleteInternalStorage(id: string, requestId?: string): Promise<void> {
    const file = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!file || file.status === FileAssetStatus.DELETED) return;
    await this.providerFor(file.provider).delete(this.reference(file));
    await this.prisma.fileAsset.update({
      where: { id },
      data: { status: FileAssetStatus.DELETED, lastError: null },
    });
    await this.audit.record({
      module: 'BACKUP',
      action: 'EXPIRE_INTERNAL_FILE',
      entityType: 'FileAsset',
      entityId: id,
      before: { provider: file.provider, logicalPath: file.logicalPath, fileName: file.fileName },
      requestId,
    });
  }

  private async storeFile(
    file: UploadedFile,
    logicalPath: string,
    association: InternalAssociation | undefined,
    actor?: AuthUser,
    requestId?: string,
    recordAudit = true,
  ): Promise<FileAsset> {
    const fileName = this.safeFileName(file.originalname);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    if (!(await this.oneDrive.isConnected())) {
      const stored = await this.mockProvider.upload({
        logicalPath,
        fileName,
        mimeType: file.mimetype,
        content: file.buffer,
      });
      try {
        const asset = await this.createAsset(stored, sha256, FileAssetStatus.SYNCED, association);
        if (recordAudit) await this.recordUpload(asset, actor, requestId);
        return asset;
      } catch (error) {
        await this.mockProvider.delete(stored).catch(() => undefined);
        throw error;
      }
    }

    const staged = await this.mockProvider.upload({
      logicalPath,
      fileName,
      mimeType: file.mimetype,
      content: file.buffer,
    });
    let asset: FileAsset;
    try {
      asset = await this.createAsset(staged, sha256, FileAssetStatus.UPLOADING, association);
    } catch (error) {
      await this.mockProvider.delete(staged).catch(() => undefined);
      throw error;
    }

    let remote: Awaited<ReturnType<OneDriveStorageProvider['upload']>> | undefined;
    try {
      remote = await this.oneDriveProvider.upload({
        logicalPath,
        fileName,
        mimeType: file.mimetype,
        content: file.buffer,
      });
      const synced = await this.prisma.fileAsset.update({
        where: { id: asset.id },
        data: {
          provider: remote.provider,
          driveId: remote.driveId,
          itemId: remote.itemId,
          parentItemId: remote.parentItemId,
          fileName: remote.fileName,
          mimeType: remote.mimeType,
          size: remote.size,
          eTag: remote.eTag,
          status: FileAssetStatus.SYNCED,
          lastError: null,
        },
      });
      await this.mockProvider.delete(staged).catch(() => undefined);
      if (recordAudit) await this.recordUpload(synced, actor, requestId);
      return synced;
    } catch (error) {
      if (remote) await this.oneDriveProvider.delete(remote).catch(() => undefined);
      return this.prisma.fileAsset.update({
        where: { id: asset.id },
        data: { status: FileAssetStatus.FAILED, lastError: this.safeError(error) },
      });
    }
  }

  private async createAsset(
    stored: Awaited<ReturnType<StorageProvider['upload']>>,
    sha256: string,
    status: FileAssetStatus,
    association?: InternalAssociation,
  ) {
    return this.prisma.fileAsset.create({
      data: {
        provider: stored.provider,
        driveId: stored.driveId,
        itemId: stored.itemId,
        parentItemId: stored.parentItemId,
        logicalPath: stored.logicalPath,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        size: stored.size,
        sha256,
        eTag: stored.eTag,
        status,
        associations: association
          ? {
              create: {
                module: association.module,
                entityType: association.entityType,
                entityId: association.entityId,
                label: association.label,
              },
            }
          : undefined,
      },
    });
  }

  private async requireAsset(id: string): Promise<FileAsset> {
    const file = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!file) throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: '备份文件不存在' });
    return file;
  }

  private async requireProductImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
      include: { fileAsset: true },
    });
    if (!image) {
      throw new NotFoundException({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: '商品图片不存在' });
    }
    return image;
  }

  private assertProductImage(file: UploadedFile): void {
    if (!file.buffer?.length) {
      throw new UnprocessableEntityException({ code: 'FILE_REQUIRED', message: '请选择商品图片' });
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: '单张图片不能超过 10 MB',
      });
    }
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (BLOCKED_EXTENSIONS.has(extension) || file.mimetype === 'image/svg+xml') {
      throw new UnprocessableEntityException({
        code: 'FILE_TYPE_BLOCKED',
        message: '不允许上传 SVG 或可执行文件',
      });
    }
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new UnprocessableEntityException({
        code: 'IMAGE_TYPE_INVALID',
        message: '商品图片仅支持 JPG、PNG、WEBP',
      });
    }
    if (!this.isImageContent(file)) {
      throw new UnprocessableEntityException({
        code: 'IMAGE_CONTENT_INVALID',
        message: '图片内容与文件类型不匹配',
      });
    }
  }

  private isImageContent(file: UploadedFile): boolean {
    const content = file.buffer;
    if (file.mimetype === 'image/jpeg')
      return (
        content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
      );
    if (file.mimetype === 'image/png')
      return (
        content.length >= 8 &&
        content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    return (
      content.length >= 12 &&
      content.subarray(0, 4).toString() === 'RIFF' &&
      content.subarray(8, 12).toString() === 'WEBP'
    );
  }

  private async deleteStoredAsset(asset: FileAsset): Promise<void> {
    await this.providerFor(asset.provider)
      .delete(this.reference(asset))
      .catch(() => undefined);
    await this.prisma.fileAsset
      .update({
        where: { id: asset.id },
        data: { status: FileAssetStatus.DELETED, lastError: null },
      })
      .catch(() => undefined);
  }

  private async recordUpload(asset: FileAsset, actor?: AuthUser, requestId?: string) {
    await this.audit.record({
      userId: actor?.id,
      module: 'BACKUP',
      action: 'STORE_INTERNAL_FILE',
      entityType: 'FileAsset',
      entityId: asset.id,
      after: {
        provider: asset.provider,
        logicalPath: asset.logicalPath,
        fileName: asset.fileName,
        size: asset.size,
        sha256: asset.sha256,
      },
      requestId,
    });
  }

  private providerFor(provider: StorageProviderType): StorageProvider {
    return provider === StorageProviderType.ONEDRIVE ? this.oneDriveProvider : this.mockProvider;
  }

  private reference(file: {
    driveId: string;
    itemId: string;
    logicalPath: string;
    fileName: string;
    mimeType: string;
    eTag?: string | null;
  }): StorageObjectReference {
    return file;
  }

  private safeFileName(input: string): string {
    const decoded = Buffer.from(input, 'latin1').toString('utf8');
    const original = Buffer.from(decoded, 'utf8').toString('latin1') === input ? decoded : input;
    const name = original.replace(/[\\/\0<>:"|?*]/g, '_').trim();
    if (!name || name === '.' || name === '..') {
      throw new UnprocessableEntityException({
        code: 'FILE_NAME_INVALID',
        message: '备份文件名无效',
      });
    }
    return name.slice(0, 180);
  }

  private safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'OneDrive 同步失败';
    return message.replace(/Bearer\s+\S+/gi, '[REDACTED]').slice(0, 500);
  }

  private throwSyncFailed(asset: FileAsset, subject = '备份文件'): never {
    throw new ServiceUnavailableException({
      code: 'FILE_SYNC_FAILED',
      message: `${subject}已安全暂存，但 OneDrive 同步失败；请检查 OneDrive 设置后重试`,
      fileAssetId: asset.id,
    });
  }
}

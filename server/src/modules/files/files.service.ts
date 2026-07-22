import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  FileAssetStatus,
  MasterDataStatus,
  Prisma,
  StorageProviderType,
  type FileAsset,
} from '@prisma/client';
import { paginationMeta } from '../../common/dto/list-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import type {
  FileListQueryDto,
  ReorderProductImagesDto,
  UploadFileDto,
  UploadProductImagesDto,
} from './dto/files.dto';
import { OneDriveService } from './onedrive/onedrive.service';
import { MockStorageProvider } from './storage/mock-storage.provider';
import { OneDriveStorageProvider } from './storage/onedrive-storage.provider';
import type { StorageObjectReference, StorageProvider } from './storage/storage-provider';

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
const MAX_FILE_SIZE = 250 * 1024 * 1024;
const MAX_PRODUCT_IMAGES = 12;
const FILE_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'fileName',
  'size',
  'status',
  'provider',
  'logicalPath',
]);

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface InternalFileInput {
  logicalPath: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
  association?: {
    module: string;
    entityType: string;
    entityId: string;
    label?: string;
  };
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

  async list(query: FileListQueryDto) {
    if (!FILE_SORT_FIELDS.has(query.sortBy)) {
      throw new BadRequestException({ code: 'SORT_INVALID', message: '排序字段不在白名单中' });
    }
    const where = this.buildWhere(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.fileAsset.findMany({
        where,
        include: {
          productImage: { include: { product: { select: { id: true, code: true, name: true } } } },
          associations: true,
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fileAsset.count({ where }),
    ]);
    return { data: rows, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async detail(id: string) {
    const file = await this.prisma.fileAsset.findUnique({
      where: { id },
      include: {
        productImage: { include: { product: { select: { id: true, code: true, name: true } } } },
        associations: true,
        backup: true,
      },
    });
    if (!file) throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: '文件不存在' });
    return file;
  }

  async upload(
    file: UploadedFile | undefined,
    payload: UploadFileDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    this.assertFile(file, false);
    this.assertAssociation(payload);
    const asset = await this.storeFile(file, payload.logicalPath, payload, actor, requestId);
    if (asset.status === FileAssetStatus.FAILED) this.throwUploadFailed(asset);
    return this.detail(asset.id);
  }

  async storeInternal(
    input: InternalFileInput,
    actor?: AuthUser,
    requestId?: string,
  ): Promise<FileAsset> {
    if (!input.content.length) {
      throw new UnprocessableEntityException({ code: 'FILE_REQUIRED', message: '文件内容为空' });
    }
    if (input.content.length > 2_000_000_000) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: '内部文件超过 2 GB，请先归档历史数据后重试',
      });
    }
    const association = input.association
      ? {
          logicalPath: input.logicalPath,
          ...input.association,
        }
      : undefined;
    const asset = await this.storeFile(
      {
        originalname: input.fileName,
        mimetype: input.mimeType,
        size: input.content.length,
        buffer: input.content,
      },
      input.logicalPath,
      association,
      actor,
      requestId,
    );
    if (asset.status === FileAssetStatus.FAILED) this.throwUploadFailed(asset);
    return asset;
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
      module: 'FILES',
      action: 'EXPIRE_INTERNAL_FILE',
      entityType: 'FileAsset',
      entityId: id,
      before: { provider: file.provider, logicalPath: file.logicalPath, fileName: file.fileName },
      requestId,
    });
  }

  async uploadProductImages(
    productId: string,
    files: UploadedFile[],
    payload: UploadProductImagesDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    if (!files.length) {
      throw new UnprocessableEntityException({ code: 'FILE_REQUIRED', message: '请选择商品图片' });
    }
    for (const file of files) this.assertFile(file, true);
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
    for (const [index, file] of files.entries()) {
      const asset = await this.storeFile(
        file,
        `Products/${productId}`,
        undefined,
        actor,
        requestId,
      );
      if (asset.status === FileAssetStatus.FAILED) this.throwUploadFailed(asset);
      try {
        const image = await this.prisma.$transaction(async (tx) => {
          const aggregate = await tx.productImage.aggregate({
            where: { productId },
            _max: { sortOrder: true },
            _count: true,
          });
          const isPrimary = Boolean(payload.isPrimary && index === 0) || aggregate._count === 0;
          if (isPrimary)
            await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
          return tx.productImage.create({
            data: {
              productId,
              fileAssetId: asset.id,
              isPrimary,
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
      module: 'FILES',
      action: 'UPLOAD_PRODUCT_IMAGES',
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

  async setPrimary(productId: string, imageId: string, actor: AuthUser, requestId?: string) {
    const image = await this.requireProductImage(productId, imageId);
    await this.prisma.$transaction([
      this.prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } }),
      this.prisma.productImage.update({ where: { id: image.id }, data: { isPrimary: true } }),
    ]);
    await this.audit.record({
      userId: actor.id,
      module: 'FILES',
      action: 'SET_PRIMARY_IMAGE',
      entityType: 'ProductImage',
      entityId: imageId,
      after: { productId, isPrimary: true },
      requestId,
    });
    return this.productImages(productId);
  }

  async reorderProductImages(
    productId: string,
    payload: ReorderProductImagesDto,
    actor: AuthUser,
    requestId?: string,
  ) {
    const existing = await this.prisma.productImage.findMany({
      where: { productId },
      select: { id: true },
    });
    const expected = new Set(existing.map((image) => image.id));
    if (
      payload.imageIds.length !== expected.size ||
      new Set(payload.imageIds).size !== payload.imageIds.length ||
      payload.imageIds.some((id) => !expected.has(id))
    ) {
      throw new UnprocessableEntityException({
        code: 'IMAGE_ORDER_INVALID',
        message: '排序必须包含该商品的全部图片且不能重复',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.updateMany({
        where: { productId },
        data: { sortOrder: { increment: 1000 } },
      });
      for (const [sortOrder, id] of payload.imageIds.entries()) {
        await tx.productImage.update({ where: { id }, data: { sortOrder } });
      }
    });
    await this.audit.record({
      userId: actor.id,
      module: 'FILES',
      action: 'REORDER_PRODUCT_IMAGES',
      entityType: 'Product',
      entityId: productId,
      after: { imageIds: payload.imageIds },
      requestId,
    });
    return this.productImages(productId);
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
      module: 'FILES',
      action: 'DELETE_PRODUCT_IMAGE',
      entityType: 'ProductImage',
      entityId: imageId,
      before: { productId, fileAssetId: image.fileAssetId, isPrimary: image.isPrimary },
      requestId,
    });
  }

  async content(id: string) {
    const file = await this.detail(id);
    if (file.status === FileAssetStatus.DELETED) {
      throw new NotFoundException({ code: 'FILE_DELETED', message: '文件已删除' });
    }
    return this.providerFor(file.provider).download(this.reference(file));
  }

  async delete(id: string, actor: AuthUser, requestId?: string): Promise<void> {
    const file = await this.detail(id);
    if (file.status === FileAssetStatus.DELETED) return;
    if (file.productImage || file.associations.length > 0 || file.backup) {
      throw new ConflictException({
        code: 'FILE_IN_USE',
        message: '文件仍被业务记录引用，请从对应业务入口删除',
      });
    }
    await this.providerFor(file.provider).delete(this.reference(file));
    await this.prisma.fileAsset.update({
      where: { id },
      data: { status: FileAssetStatus.DELETED, lastError: null },
    });
    await this.audit.record({
      userId: actor.id,
      module: 'FILES',
      action: 'DELETE',
      entityType: 'FileAsset',
      entityId: id,
      before: file,
      requestId,
    });
  }

  async retry(id: string, actor: AuthUser, requestId?: string) {
    const file = await this.detail(id);
    if (
      file.status !== FileAssetStatus.FAILED ||
      file.provider !== StorageProviderType.MOCK_LOCAL
    ) {
      throw new ConflictException({ code: 'FILE_NOT_RETRYABLE', message: '该文件无需重试' });
    }
    if (!(await this.oneDrive.isConnected())) {
      throw new ServiceUnavailableException({
        code: 'ONEDRIVE_NOT_CONNECTED',
        message: '请先完成 OneDrive 授权后再重试',
      });
    }
    const staged = await this.mockProvider.download(this.reference(file));
    await this.prisma.fileAsset.update({
      where: { id },
      data: { status: FileAssetStatus.UPLOADING, lastError: null },
    });
    let remote: Awaited<ReturnType<OneDriveStorageProvider['upload']>> | undefined;
    try {
      remote = await this.oneDriveProvider.upload({
        logicalPath: file.logicalPath,
        fileName: file.fileName,
        mimeType: file.mimeType,
        content: staged.content,
      });
      await this.prisma.fileAsset.update({
        where: { id },
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
    } catch (error) {
      if (remote) {
        await this.oneDriveProvider.delete(remote).catch(() => undefined);
      }
      await this.prisma.fileAsset.update({
        where: { id },
        data: { status: FileAssetStatus.FAILED, lastError: this.safeError(error) },
      });
      throw error;
    }
    await this.mockProvider.delete(this.reference(file)).catch(() => undefined);
    await this.audit.record({
      userId: actor.id,
      module: 'FILES',
      action: 'RETRY_UPLOAD',
      entityType: 'FileAsset',
      entityId: id,
      after: { provider: remote.provider, itemId: remote.itemId },
      requestId,
    });
    return this.detail(id);
  }

  exportCsv(query: FileListQueryDto): Readable {
    const limit = query.exportLimit ?? 10_000;
    const list = this.list.bind(this);
    const csvCell = this.csvCell.bind(this);
    return Readable.from(
      (async function* () {
        yield '\uFEFF文件名,存储提供方,状态,逻辑路径,MIME,大小,SHA-256,创建时间\r\n';
        let page = 1;
        let emitted = 0;
        while (emitted < limit) {
          const result = await list({ ...query, page, pageSize: 100 });
          for (const row of result.data) {
            if (emitted >= limit) break;
            const values = [
              row.fileName,
              row.provider,
              row.status,
              row.logicalPath,
              row.mimeType,
              row.size,
              row.sha256,
              row.createdAt.toISOString(),
            ];
            yield `${values.map(csvCell).join(',')}\r\n`;
            emitted += 1;
          }
          if (!result.meta.hasNextPage) break;
          page += 1;
        }
      })(),
    );
  }

  private async storeFile(
    file: UploadedFile,
    logicalPath: string,
    association: UploadFileDto | undefined,
    actor?: AuthUser,
    requestId?: string,
  ): Promise<FileAsset> {
    const fileName = this.safeFileName(file.originalname);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const useOneDrive = await this.oneDrive.isConnected();

    if (!useOneDrive) {
      const stored = await this.mockProvider.upload({
        logicalPath,
        fileName,
        mimeType: file.mimetype,
        content: file.buffer,
      });
      try {
        const asset = await this.createAsset(stored, sha256, FileAssetStatus.SYNCED, association);
        await this.recordUpload(asset, actor, requestId);
        return asset;
      } catch (error) {
        await this.mockProvider.delete(stored);
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
    let synced: FileAsset;
    try {
      remote = await this.oneDriveProvider.upload({
        logicalPath,
        fileName,
        mimeType: file.mimetype,
        content: file.buffer,
      });
      synced = await this.prisma.fileAsset.update({
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
    } catch (error) {
      if (remote) {
        await this.oneDriveProvider.delete(remote).catch(() => undefined);
      }
      return this.prisma.fileAsset.update({
        where: { id: asset.id },
        data: { status: FileAssetStatus.FAILED, lastError: this.safeError(error) },
      });
    }
    await this.mockProvider.delete(staged).catch(() => undefined);
    await this.recordUpload(synced, actor, requestId);
    return synced;
  }

  private async createAsset(
    stored: Awaited<ReturnType<StorageProvider['upload']>>,
    sha256: string,
    status: FileAssetStatus,
    association?: UploadFileDto,
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
        associations:
          association?.module && association.entityType && association.entityId
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

  private async recordUpload(asset: FileAsset, actor?: AuthUser, requestId?: string) {
    await this.audit.record({
      userId: actor?.id,
      module: 'FILES',
      action: 'UPLOAD',
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

  private async deleteStoredAsset(asset: FileAsset): Promise<void> {
    await this.providerFor(asset.provider).delete(this.reference(asset));
    await this.prisma.fileAsset.update({
      where: { id: asset.id },
      data: { status: FileAssetStatus.DELETED },
    });
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

  private buildWhere(query: FileListQueryDto): Prisma.FileAssetWhereInput {
    return {
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.fileStatus ? { status: query.fileStatus } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.keyword?.trim()
        ? {
            OR: [
              { fileName: { contains: query.keyword.trim(), mode: 'insensitive' } },
              { logicalPath: { contains: query.keyword.trim(), mode: 'insensitive' } },
              { sha256: { contains: query.keyword.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.module || query.entityType || query.entityId
        ? {
            associations: {
              some: {
                ...(query.module ? { module: query.module } : {}),
                ...(query.entityType ? { entityType: query.entityType } : {}),
                ...(query.entityId ? { entityId: query.entityId } : {}),
              },
            },
          }
        : {}),
      ...(query.productId ? { productImage: { productId: query.productId } } : {}),
    };
  }

  private assertFile(
    file: UploadedFile | undefined,
    imageOnly: boolean,
  ): asserts file is UploadedFile {
    if (!file?.buffer?.length) {
      throw new UnprocessableEntityException({ code: 'FILE_REQUIRED', message: '请选择文件' });
    }
    const max = imageOnly ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
    if (file.size > max) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: imageOnly ? '单张图片不能超过 10 MB' : '单文件不能超过 250 MB',
      });
    }
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (BLOCKED_EXTENSIONS.has(extension) || file.mimetype === 'image/svg+xml') {
      throw new UnprocessableEntityException({
        code: 'FILE_TYPE_BLOCKED',
        message: '不允许上传 SVG 或可执行文件',
      });
    }
    if (imageOnly && !IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new UnprocessableEntityException({
        code: 'IMAGE_TYPE_INVALID',
        message: '商品图片仅支持 JPG、PNG、WEBP',
      });
    }
  }

  private assertAssociation(payload: UploadFileDto): void {
    const values = [payload.module, payload.entityType, payload.entityId];
    const present = values.filter(Boolean).length;
    if (present !== 0 && present !== 3) {
      throw new UnprocessableEntityException({
        code: 'FILE_ASSOCIATION_INCOMPLETE',
        message: '业务关联必须同时提供模块、实体类型和实体 ID',
      });
    }
  }

  private safeFileName(input: string): string {
    const decoded = Buffer.from(input, 'latin1').toString('utf8');
    const original = Buffer.from(decoded, 'utf8').toString('latin1') === input ? decoded : input;
    const name = original.replace(/[\\/\0<>:"|?*]/g, '_').trim();
    if (!name || name === '.' || name === '..') {
      throw new UnprocessableEntityException({ code: 'FILE_NAME_INVALID', message: '文件名无效' });
    }
    return name.slice(0, 180);
  }

  private safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : '文件同步失败';
    return message.replace(/Bearer\s+\S+/gi, '[REDACTED]').slice(0, 500);
  }

  private throwUploadFailed(asset: FileAsset): never {
    throw new ServiceUnavailableException({
      code: 'FILE_SYNC_FAILED',
      message: '文件已安全暂存，OneDrive 同步失败，可在文件中心重试',
      fileAssetId: asset.id,
    });
  }

  private csvCell(value: unknown): string {
    const raw = value == null ? '' : String(value);
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  }
}

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProviderType } from '@prisma/client';
import type {
  StorageObjectReference,
  StorageProvider,
  StorageUploadInput,
  StoredContent,
  StoredObject,
} from './storage-provider';

@Injectable()
export class MockStorageProvider implements StorageProvider {
  readonly type = StorageProviderType.MOCK_LOCAL;
  private readonly root: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('FILE_STORAGE_DIR');
    this.root = configured
      ? resolve(configured)
      : config.get<string>('NODE_ENV') === 'test'
        ? resolve(tmpdir(), 'personal-erp-mock-storage')
        : resolve(process.cwd(), '.data', 'files');
  }

  async upload(input: StorageUploadInput): Promise<StoredObject> {
    const itemId = randomUUID();
    const target = this.objectPath(itemId);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, input.content, { flag: 'wx' });
    return {
      provider: this.type,
      driveId: 'mock-local',
      itemId,
      parentItemId: 'mock-local-root',
      logicalPath: input.logicalPath,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.content.length,
      eTag: `"${createHash('sha256').update(input.content).digest('hex')}"`,
    };
  }

  async download(reference: StorageObjectReference): Promise<StoredContent> {
    try {
      return {
        content: await readFile(this.objectPath(reference.itemId)),
        mimeType: reference.mimeType,
        fileName: reference.fileName,
        eTag: reference.eTag ?? undefined,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException({ code: 'FILE_CONTENT_NOT_FOUND', message: '文件内容不存在' });
      }
      throw error;
    }
  }

  async delete(reference: StorageObjectReference): Promise<void> {
    try {
      await unlink(this.objectPath(reference.itemId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private objectPath(itemId: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) {
      throw new NotFoundException({ code: 'FILE_CONTENT_NOT_FOUND', message: '文件内容不存在' });
    }
    const target = resolve(this.root, 'objects', itemId.slice(0, 2), itemId);
    if (!target.startsWith(`${this.root}${sep}`)) {
      throw new NotFoundException({ code: 'FILE_CONTENT_NOT_FOUND', message: '文件内容不存在' });
    }
    return target;
  }
}

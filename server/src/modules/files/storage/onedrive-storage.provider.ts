import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { StorageProviderType } from '@prisma/client'
import { OneDriveGraphError, OneDriveService } from '../onedrive/onedrive.service'
import type {
  StorageObjectReference,
  StorageProvider,
  StorageUploadInput,
  StoredContent,
  StoredObject,
} from './storage-provider'

const SIMPLE_UPLOAD_LIMIT = 10 * 1024 * 1024
const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024

interface DriveItem {
  id: string
  name: string
  size: number
  eTag?: string
  parentReference?: { id?: string; driveId?: string }
  file?: { mimeType?: string }
}

@Injectable()
export class OneDriveStorageProvider implements StorageProvider {
  readonly type = StorageProviderType.ONEDRIVE

  constructor(private readonly oneDrive: OneDriveService) {}

  async upload(input: StorageUploadInput): Promise<StoredObject> {
    try {
      const parent = await this.oneDrive.ensureFolderPath(input.logicalPath)
      const item =
        input.content.length <= SIMPLE_UPLOAD_LIMIT
          ? await this.simpleUpload(parent.id, input)
          : await this.sessionUpload(parent.id, input)
      return {
        provider: this.type,
        driveId: item.parentReference?.driveId ?? 'onedrive-personal',
        itemId: item.id,
        parentItemId: item.parentReference?.id ?? parent.id,
        logicalPath: input.logicalPath,
        fileName: item.name,
        mimeType: item.file?.mimeType ?? input.mimeType,
        size: item.size ?? input.content.length,
        eTag: item.eTag,
      }
    } catch (error) {
      this.oneDrive.reportRuntimeError(error)
      throw error
    }
  }

  async download(reference: StorageObjectReference): Promise<StoredContent> {
    const { response, data } = await this.oneDrive.graphBuffer(
      `/me/drive/items/${encodeURIComponent(reference.itemId)}/content`,
      { redirect: 'follow' },
    )
    return {
      content: data,
      mimeType: response.headers.get('content-type') ?? reference.mimeType,
      fileName: reference.fileName,
      eTag: response.headers.get('etag') ?? reference.eTag ?? undefined,
    }
  }

  async delete(reference: StorageObjectReference): Promise<void> {
    try {
      await this.oneDrive.graphFetch(`/me/drive/items/${encodeURIComponent(reference.itemId)}`, {
        method: 'DELETE',
      })
    } catch (error) {
      if (error instanceof OneDriveGraphError && error.status === 404) return
      this.oneDrive.reportRuntimeError(error)
      throw error
    }
  }

  private async simpleUpload(parentId: string, input: StorageUploadInput): Promise<DriveItem> {
    const fileName = await this.availableFileName(parentId, input.fileName)
    const name = encodeURIComponent(fileName)
    return this.oneDrive.graphJson<DriveItem>(
      `/me/drive/items/${encodeURIComponent(parentId)}:/${name}:/content`,
      {
        method: 'PUT',
        headers: { 'content-type': input.mimeType },
        body: this.arrayBuffer(input.content),
      },
    )
  }

  private async availableFileName(parentId: string, fileName: string): Promise<string> {
    try {
      await this.oneDrive.graphJson<DriveItem>(
        `/me/drive/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(fileName)}`,
      )
      const dot = fileName.lastIndexOf('.')
      const suffix = `-${randomUUID().slice(0, 8)}`
      return dot > 0
        ? `${fileName.slice(0, dot)}${suffix}${fileName.slice(dot)}`
        : `${fileName}${suffix}`
    } catch (error) {
      if (error instanceof OneDriveGraphError && error.status === 404) return fileName
      throw error
    }
  }

  private async sessionUpload(parentId: string, input: StorageUploadInput): Promise<DriveItem> {
    const session = await this.oneDrive.graphJson<{ uploadUrl: string }>(
      `/me/drive/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(input.fileName)}:/createUploadSession`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'rename',
            name: input.fileName,
            fileSize: input.content.length,
          },
        }),
      },
    )

    let finalItem: DriveItem | null = null
    for (let start = 0; start < input.content.length; start += UPLOAD_CHUNK_SIZE) {
      const end = Math.min(start + UPLOAD_CHUNK_SIZE, input.content.length) - 1
      const chunk = input.content.subarray(start, end + 1)
      const response = await this.putChunk(
        session.uploadUrl,
        chunk,
        start,
        end,
        input.content.length,
      )
      if (response.status === 200 || response.status === 201) {
        finalItem = (await response.json()) as DriveItem
      }
    }
    if (!finalItem) throw new OneDriveGraphError('GRAPH_ERROR', 'OneDrive 分片上传未完成')
    return finalItem
  }

  private async putChunk(
    uploadUrl: string,
    chunk: Buffer,
    start: number,
    end: number,
    total: number,
  ): Promise<Response> {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'content-length': String(chunk.length),
            'content-range': `bytes ${start}-${end}/${total}`,
          },
          body: this.arrayBuffer(chunk),
        })
        if (response.ok) return response
        if (response.status < 500 && response.status !== 429) {
          throw new OneDriveGraphError(
            /quota|space/i.test(await response.text()) ? 'STORAGE_FULL' : 'GRAPH_ERROR',
            'OneDrive 分片上传失败',
            response.status,
          )
        }
        lastError = new OneDriveGraphError('GRAPH_UNREACHABLE', 'Graph 不可达', response.status)
      } catch (error) {
        lastError = error
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
    throw lastError instanceof Error
      ? lastError
      : new OneDriveGraphError('GRAPH_UNREACHABLE', 'Graph 不可达')
  }

  private arrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer
  }
}

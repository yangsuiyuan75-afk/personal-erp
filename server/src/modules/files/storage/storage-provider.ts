import type { StorageProviderType } from '@prisma/client'

export interface StorageUploadInput {
  logicalPath: string
  fileName: string
  mimeType: string
  content: Buffer
}

export interface StoredObject {
  provider: StorageProviderType
  driveId: string
  itemId: string
  parentItemId?: string
  logicalPath: string
  fileName: string
  mimeType: string
  size: number
  eTag?: string
}

export interface StoredContent {
  content: Buffer
  mimeType: string
  fileName: string
  eTag?: string
}

export interface StorageObjectReference {
  driveId: string
  itemId: string
  logicalPath: string
  fileName: string
  mimeType: string
  eTag?: string | null
}

export interface StorageProvider {
  readonly type: StorageProviderType
  upload(input: StorageUploadInput): Promise<StoredObject>
  download(reference: StorageObjectReference): Promise<StoredContent>
  delete(reference: StorageObjectReference): Promise<void>
}

export const STORAGE_PROVIDERS = Symbol('STORAGE_PROVIDERS')

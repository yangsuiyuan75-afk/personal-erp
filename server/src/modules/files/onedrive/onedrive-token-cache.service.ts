import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { hostname, userInfo } from 'node:os'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import type { ICachePlugin, TokenCacheContext } from '@azure/msal-node'
import { PrismaService } from '../../../database/prisma.service'

const CACHE_SETTING_KEY = 'onedrive.msal-cache.encrypted'

interface EncryptedCache {
  version: 1
  algorithm: 'aes-256-gcm'
  iv: string
  authTag: string
  ciphertext: string
}

@Injectable()
export class OneDriveTokenCacheService implements ICachePlugin {
  private readonly encryptionKey: Buffer

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const applicationSecret = config.get<string>('JWT_REFRESH_SECRET') ?? 'personal-erp-local-only'
    const machineBinding = `${hostname()}:${userInfo().username}:personal-erp:onedrive-cache:v1`
    this.encryptionKey = createHash('sha256')
      .update(applicationSecret)
      .update(machineBinding)
      .digest()
  }

  async beforeCacheAccess(context: TokenCacheContext): Promise<void> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: CACHE_SETTING_KEY },
    })
    if (!setting) return
    context.tokenCache.deserialize(this.decrypt(setting.value))
  }

  async afterCacheAccess(context: TokenCacheContext): Promise<void> {
    if (!context.cacheHasChanged) return
    const encrypted = this.encrypt(context.tokenCache.serialize())
    await this.prisma.systemSetting.upsert({
      where: { key: CACHE_SETTING_KEY },
      create: { key: CACHE_SETTING_KEY, value: encrypted as unknown as Prisma.InputJsonValue },
      update: { value: encrypted as unknown as Prisma.InputJsonValue },
    })
  }

  async clear(): Promise<void> {
    await this.prisma.systemSetting.deleteMany({ where: { key: CACHE_SETTING_KEY } })
  }

  private encrypt(plaintext: string): EncryptedCache {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return {
      version: 1,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }
  }

  private decrypt(value: Prisma.JsonValue): string {
    const encrypted = value as unknown as Partial<EncryptedCache>
    if (
      encrypted.version !== 1 ||
      encrypted.algorithm !== 'aes-256-gcm' ||
      !encrypted.iv ||
      !encrypted.authTag ||
      !encrypted.ciphertext
    ) {
      throw new Error('ONEDRIVE_TOKEN_CACHE_INVALID')
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(encrypted.iv, 'base64'),
      )
      decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'))
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      throw new Error('ONEDRIVE_TOKEN_CACHE_DECRYPT_FAILED')
    }
  }
}

export { CACHE_SETTING_KEY }

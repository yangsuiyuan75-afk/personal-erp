import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  BackupStatus,
  BackupTrigger,
  Prisma,
  StorageProviderType,
  type BackupHistory,
} from '@prisma/client'
import { paginationMeta } from '../../common/dto/list-query.dto'
import { PrismaService } from '../../database/prisma.service'
import { AuditService } from '../audit/audit.service'
import { AuthService } from '../auth/auth.service'
import type { AuthUser } from '../auth/auth.types'
import { FilesService } from '../files/files.service'
import { selectExpiredBackupIds } from './backup-retention'
import type { BackupListQueryDto, BootstrapRestoreDto, RestoreBackupDto } from './dto/backup.dto'
import { MaintenanceService } from './maintenance.service'
import { PostgresBackupRunner } from './postgres-backup.runner'

const CURRENT_SCHEMA_VERSION = '202607160012_phase8_backup'
const APP_VERSION = '0.1.0'
const BACKUP_SORT_FIELDS = new Set([
  'backupNo',
  'status',
  'trigger',
  'size',
  'startedAt',
  'completedAt',
  'verifiedAt',
  'createdAt',
])
const BUSINESS_MODULES = ['INVENTORY', 'PURCHASE', 'SALES', 'QUALITY', 'FINANCE']

interface BackupManifest {
  backupNo: string
  createdAt: string
  appVersion: string
  schemaVersion: string
  postgresVersion: string
  fileSize: number
  sha256: string
  catalogEntries: number
  recordCounts: Record<string, number>
}

interface MaterializedBackup {
  path: string
  temporary: boolean
}

@Injectable()
export class BackupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackupService.name)
  private readonly backupDirectory: string
  private readonly autoAfterHours: number
  private readonly operationThreshold: number
  private readonly recoveryKey?: string
  private backupRunning = false
  private restoreRunning = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly files: FilesService,
    private readonly runner: PostgresBackupRunner,
    private readonly maintenance: MaintenanceService,
  ) {
    this.backupDirectory = resolve(
      config.get<string>('BACKUP_TEMP_DIR')?.trim() || resolve(process.cwd(), '.data', 'backups'),
    )
    this.autoAfterHours = Number(config.get<string>('BACKUP_AUTO_AFTER_HOURS') ?? 24)
    this.operationThreshold = Number(config.get<string>('BACKUP_OPERATION_THRESHOLD') ?? 50)
    this.recoveryKey = config.get<string>('BOOTSTRAP_RECOVERY_KEY')?.trim() || undefined
  }

  onApplicationBootstrap(): void {
    if (process.env.JEST_WORKER_ID || this.config.get<string>('NODE_ENV') === 'test') return
    setImmediate(() => {
      void this.runStartupCompensation().catch((error: unknown) => {
        this.logger.error(`启动补偿备份失败：${this.safeError(error)}`)
      })
    })
  }

  async list(query: BackupListQueryDto) {
    if (!BACKUP_SORT_FIELDS.has(query.sortBy)) {
      throw new BadRequestException({ code: 'SORT_INVALID', message: '排序字段不在白名单中' })
    }
    const where: Prisma.BackupHistoryWhereInput = {
      ...(query.backupStatus ? { status: query.backupStatus } : {}),
      ...(query.trigger ? { trigger: query.trigger } : {}),
      ...(query.locked !== undefined ? { locked: query.locked } : {}),
      ...(query.keyword?.trim()
        ? {
            OR: [
              { backupNo: { contains: query.keyword.trim(), mode: 'insensitive' } },
              { sha256: { contains: query.keyword.trim(), mode: 'insensitive' } },
              { schemaVersion: { contains: query.keyword.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            startedAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.backupHistory.findMany({
        where,
        include: { fileAsset: { select: { provider: true, status: true, fileName: true } } },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.backupHistory.count({ where }),
    ])
    return {
      data: rows.map((row) => this.serialize(row)),
      meta: paginationMeta(query.page, query.pageSize, total),
    }
  }

  async detail(id: string) {
    const backup = await this.prisma.backupHistory.findUnique({
      where: { id },
      include: { fileAsset: true },
    })
    if (!backup) {
      throw new NotFoundException({ code: 'BACKUP_NOT_FOUND', message: '备份记录不存在' })
    }
    return backup
  }

  async createManual(
    actor: AuthUser,
    locked = false,
    requestId?: string,
  ): Promise<Record<string, unknown>> {
    return this.createBackup(BackupTrigger.MANUAL, actor, locked, requestId)
  }

  async createBackup(
    trigger: BackupTrigger,
    actor?: AuthUser,
    locked = false,
    requestId?: string,
  ): Promise<Record<string, unknown>> {
    if (this.backupRunning) {
      throw new ConflictException({ code: 'BACKUP_RUNNING', message: '已有备份任务正在执行' })
    }
    this.backupRunning = true
    const backupNo = this.nextBackupNo(trigger)
    const folder = this.folderFor(new Date())
    const dumpPath = resolve(folder, `${backupNo}.dump`)
    const manifestPath = resolve(folder, `${backupNo}.manifest.json`)
    let record: BackupHistory | undefined
    try {
      await mkdir(folder, { recursive: true })
      record = await this.prisma.backupHistory.create({
        data: {
          backupNo,
          createdById: actor?.id,
          trigger,
          status: BackupStatus.CREATING,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          appVersion: APP_VERSION,
          locked,
        },
      })
      await this.runner.dump(dumpPath)
      const catalog = await this.runner.verify(dumpPath)
      const content = await readFile(dumpPath)
      const sha256 = this.hash(content)
      const postgresVersion = await this.postgresVersion()
      const recordCounts = await this.recordCounts()
      const manifest: BackupManifest = {
        backupNo,
        createdAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        postgresVersion,
        fileSize: content.length,
        sha256,
        catalogEntries: catalog.catalogEntries,
        recordCounts,
      }
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' })
      await this.prisma.backupHistory.update({
        where: { id: record.id },
        data: {
          status: BackupStatus.UPLOADING,
          postgresVersion,
          sha256,
          size: BigInt(content.length),
          manifest: manifest as unknown as Prisma.InputJsonValue,
          localAvailable: true,
        },
      })

      const logicalPath = this.logicalPathFor(new Date())
      const dumpAsset = await this.files.storeInternal(
        {
          logicalPath,
          fileName: `${backupNo}.dump`,
          mimeType: 'application/vnd.postgresql.custom-backup',
          content,
        },
        actor,
        requestId,
      )
      await this.prisma.backupHistory.update({
        where: { id: record.id },
        data: { fileAssetId: dumpAsset.id },
      })
      await this.files.storeInternal(
        {
          logicalPath,
          fileName: `${backupNo}.manifest.json`,
          mimeType: 'application/json',
          content: Buffer.from(JSON.stringify(manifest, null, 2)),
          association: {
            module: 'BACKUP',
            entityType: 'BackupHistory',
            entityId: record.id,
            label: 'manifest',
          },
        },
        actor,
        requestId,
      )
      const uploaded = await this.files.content(dumpAsset.id)
      if (this.hash(uploaded.content) !== sha256) {
        throw new UnprocessableEntityException({
          code: 'BACKUP_UPLOAD_HASH_MISMATCH',
          message: '备份上传后 SHA-256 校验失败',
        })
      }
      const completedAt = new Date()
      const completed = await this.prisma.backupHistory.update({
        where: { id: record.id },
        data: {
          status: BackupStatus.VERIFIED,
          completedAt,
          verifiedAt: completedAt,
          cloudUploadedAt:
            dumpAsset.provider === StorageProviderType.ONEDRIVE ? completedAt : undefined,
          errorMessage: null,
        },
        include: { fileAsset: true },
      })
      await this.audit.record({
        userId: actor?.id,
        module: 'BACKUP',
        action: `CREATE_${trigger}`,
        entityType: 'BackupHistory',
        entityId: record.id,
        after: {
          backupNo,
          sha256,
          size: content.length,
          provider: dumpAsset.provider,
          verifiedAt: completedAt,
        },
        requestId,
      })
      await this.applyRetention(requestId)
      return this.serialize(completed)
    } catch (error) {
      if (record) {
        await this.prisma.backupHistory
          .update({
            where: { id: record.id },
            data: {
              status: BackupStatus.FAILED,
              completedAt: new Date(),
              errorMessage: this.safeError(error),
            },
          })
          .catch(() => undefined)
        await this.audit
          .record({
            userId: actor?.id,
            module: 'BACKUP',
            action: `CREATE_${trigger}`,
            entityType: 'BackupHistory',
            entityId: record.id,
            result: 'FAILED',
            after: { backupNo, error: this.safeError(error) },
            requestId,
          })
          .catch(() => undefined)
      }
      throw error
    } finally {
      this.backupRunning = false
    }
  }

  async verify(id: string, actor: AuthUser, requestId?: string) {
    const backup = await this.detail(id)
    const materialized = await this.materialize(backup)
    try {
      const content = await readFile(materialized.path)
      const sha256 = this.hash(content)
      if (!backup.sha256 || sha256 !== backup.sha256) {
        await this.prisma.backupHistory.update({
          where: { id },
          data: { status: BackupStatus.FAILED, errorMessage: 'SHA-256 校验失败' },
        })
        throw new UnprocessableEntityException({
          code: 'BACKUP_HASH_MISMATCH',
          message: 'SHA-256 校验失败，禁止恢复该备份',
        })
      }
      const catalog = await this.runner.verify(materialized.path)
      const verifiedAt = new Date()
      const updated = await this.prisma.backupHistory.update({
        where: { id },
        data: { status: BackupStatus.VERIFIED, verifiedAt, errorMessage: null },
        include: { fileAsset: true },
      })
      await this.audit.record({
        userId: actor.id,
        module: 'BACKUP',
        action: 'VERIFY',
        entityType: 'BackupHistory',
        entityId: id,
        after: { sha256, catalogEntries: catalog.catalogEntries, verifiedAt },
        requestId,
      })
      return this.serialize(updated)
    } finally {
      await this.cleanupMaterialized(materialized)
    }
  }

  async download(id: string) {
    const backup = await this.detail(id)
    if (backup.status === BackupStatus.EXPIRED) {
      throw new NotFoundException({ code: 'BACKUP_EXPIRED', message: '该备份已按保留策略清理' })
    }
    if (backup.fileAssetId) {
      try {
        return await this.files.content(backup.fileAssetId)
      } catch {
        // Keep the independent local export as a recovery fallback.
      }
    }
    try {
      return {
        content: await readFile(this.dumpPath(backup.backupNo, backup.startedAt)),
        mimeType: 'application/vnd.postgresql.custom-backup',
        fileName: `${backup.backupNo}.dump`,
      }
    } catch {
      throw new NotFoundException({
        code: 'BACKUP_CONTENT_NOT_FOUND',
        message: '备份文件在本地和存储 Provider 中均不可用',
      })
    }
  }

  async lock(id: string, locked: boolean, actor: AuthUser, requestId?: string) {
    const before = await this.detail(id)
    const updated = await this.prisma.backupHistory.update({
      where: { id },
      data: { locked },
      include: { fileAsset: true },
    })
    await this.audit.record({
      userId: actor.id,
      module: 'BACKUP',
      action: locked ? 'LOCK' : 'UNLOCK',
      entityType: 'BackupHistory',
      entityId: id,
      before: { locked: before.locked },
      after: { locked },
      requestId,
    })
    return this.serialize(updated)
  }

  async systemStatus() {
    const latest = await this.prisma.backupHistory.findFirst({
      where: { status: BackupStatus.VERIFIED },
      orderBy: { completedAt: 'desc' },
    })
    const since = latest?.completedAt ?? new Date(0)
    const [changesSinceLast, operationsSinceLast] = await Promise.all([
      this.prisma.auditLog.count({
        where: { module: { in: BUSINESS_MODULES }, createdAt: { gt: since } },
      }),
      this.prisma.auditLog.count({
        where: {
          module: { in: BUSINESS_MODULES },
          createdAt: { gt: since },
          OR: [
            { action: { contains: 'POST', mode: 'insensitive' } },
            { action: { contains: 'CONFIRM', mode: 'insensitive' } },
            { action: { contains: 'RECEIVE', mode: 'insensitive' } },
            { action: { contains: 'ISSUE', mode: 'insensitive' } },
            { action: { contains: 'SETTLE', mode: 'insensitive' } },
          ],
        },
      }),
    ])
    return {
      maintenance: this.maintenance.status(),
      task: { backupRunning: this.backupRunning, restoreRunning: this.restoreRunning },
      latest: latest ? this.serialize(latest) : null,
      changesSinceLast,
      operationsSinceLast,
      operationThreshold: this.operationThreshold,
      backupRecommended: operationsSinceLast >= this.operationThreshold,
      autoAfterHours: this.autoAfterHours,
      recoveryConfigured: Boolean(this.recoveryKey),
    }
  }

  async restore(id: string, payload: RestoreBackupDto, actor: AuthUser, requestId?: string) {
    if (this.restoreRunning || this.backupRunning) {
      throw new ConflictException({
        code: 'BACKUP_TASK_RUNNING',
        message: '已有备份或恢复任务执行中',
      })
    }
    const backup = await this.detail(id)
    if (backup.status !== BackupStatus.VERIFIED || !backup.sha256) {
      throw new UnprocessableEntityException({
        code: 'BACKUP_NOT_VERIFIED',
        message: '只有校验通过的备份可以恢复',
      })
    }
    if (payload.confirmPhrase !== `RESTORE ${backup.backupNo}`) {
      throw new UnprocessableEntityException({
        code: 'RESTORE_CONFIRMATION_INVALID',
        message: `请输入确认短语：RESTORE ${backup.backupNo}`,
      })
    }
    await this.auth.verifyPassword(actor.id, payload.password)
    await this.assertCompatible(backup.manifest as unknown as BackupManifest | null)

    this.restoreRunning = true
    this.maintenance.enter(`正在恢复 ${backup.backupNo}`)
    let source: MaterializedBackup | undefined
    let preRestore: MaterializedBackup | undefined
    let disconnected = false
    try {
      source = await this.materialize(backup)
      const sourceContent = await readFile(source.path)
      if (this.hash(sourceContent) !== backup.sha256) {
        throw new UnprocessableEntityException({
          code: 'BACKUP_HASH_MISMATCH',
          message: '恢复前 SHA-256 校验失败',
        })
      }
      await this.runner.verify(source.path)
      const protection = await this.createBackup(BackupTrigger.PRE_RESTORE, actor, true, requestId)
      const protectionRecord = await this.detail(String(protection.id))
      preRestore = await this.materialize(protectionRecord)
      const preRestoreContent = await readFile(preRestore.path)

      await this.prisma.$disconnect()
      disconnected = true
      await this.runner.restore(source.path)
      await this.runner.migrate()
      await this.prisma.$connect()
      disconnected = false
      await this.assertDatabaseHealthy()
      await this.assertRecordCounts(backup.manifest as unknown as BackupManifest | null)
      await this.rehydrateRestoredBackup(backup, sourceContent, actor, requestId)
      await this.rehydrateRestoredBackup(protectionRecord, preRestoreContent, actor, requestId)
      await this.audit.record({
        userId: actor.id,
        module: 'BACKUP',
        action: 'RESTORE',
        entityType: 'BackupHistory',
        entityId: id,
        after: { backupNo: backup.backupNo, preRestoreBackupNo: protectionRecord.backupNo },
        requestId,
      })
      return {
        restored: true,
        backupNo: backup.backupNo,
        preRestoreBackupNo: protectionRecord.backupNo,
        health: 'operational',
      }
    } catch (error) {
      if (disconnected) {
        await this.prisma.$connect().catch(() => undefined)
        disconnected = false
      }
      if (preRestore) {
        try {
          await this.prisma.$disconnect()
          disconnected = true
          await this.runner.restore(preRestore.path)
          await this.runner.migrate()
          await this.prisma.$connect()
          disconnected = false
        } catch (rollbackError) {
          this.logger.error(`PRE_RESTORE 回滚失败：${this.safeError(rollbackError)}`)
        }
      }
      await this.audit
        .record({
          userId: actor.id,
          module: 'BACKUP',
          action: 'RESTORE',
          entityType: 'BackupHistory',
          entityId: id,
          result: 'FAILED',
          after: { backupNo: backup.backupNo, error: this.safeError(error) },
          requestId,
        })
        .catch(() => undefined)
      throw error
    } finally {
      if (disconnected) await this.prisma.$connect().catch(() => undefined)
      if (source) await this.cleanupMaterialized(source)
      if (preRestore) await this.cleanupMaterialized(preRestore)
      this.maintenance.exit()
      this.restoreRunning = false
    }
  }

  async bootstrapStatus() {
    const rows = await this.prisma.$queryRaw<Array<{ table_name: string | null }>>`
      SELECT to_regclass('public."AdminUser"')::text AS table_name
    `
    const schemaReady = Boolean(rows[0]?.table_name)
    let initialized = false
    if (schemaReady) initialized = (await this.prisma.adminUser.count()) > 0
    return {
      schemaReady,
      initialized,
      recoveryRequired: !schemaReady || !initialized,
      recoveryConfigured: Boolean(this.recoveryKey),
      confirmPhrase: 'BOOTSTRAP RESTORE',
    }
  }

  async bootstrapRestore(
    file: { originalname: string; size: number; buffer: Buffer } | undefined,
    payload: BootstrapRestoreDto,
    recoveryKey?: string,
  ) {
    this.verifyRecoveryKey(recoveryKey)
    const status = await this.bootstrapStatus()
    if (!status.recoveryRequired) {
      throw new ConflictException({
        code: 'BOOTSTRAP_RESTORE_DISABLED',
        message: '系统已存在管理员，请登录后使用受保护的恢复流程',
      })
    }
    if (!file?.buffer?.length || !file.originalname.toLowerCase().endsWith('.dump')) {
      throw new UnprocessableEntityException({
        code: 'BACKUP_FILE_INVALID',
        message: '请选择 PostgreSQL custom format 的 .dump 文件',
      })
    }
    if (payload.confirmPhrase !== 'BOOTSTRAP RESTORE') {
      throw new UnprocessableEntityException({
        code: 'RESTORE_CONFIRMATION_INVALID',
        message: '请输入确认短语：BOOTSTRAP RESTORE',
      })
    }
    if (this.restoreRunning || this.backupRunning) {
      throw new ConflictException({ code: 'BACKUP_TASK_RUNNING', message: '已有恢复任务执行中' })
    }

    const backupNo = this.nextBackupNo(BackupTrigger.BOOTSTRAP_IMPORT)
    const folder = this.folderFor(new Date())
    const path = resolve(folder, `${backupNo}.bootstrap.dump`)
    await mkdir(folder, { recursive: true })
    await writeFile(path, file.buffer, { flag: 'wx' })
    this.restoreRunning = true
    this.maintenance.enter('正在执行空数据库 Bootstrap 恢复')
    let disconnected = false
    try {
      await this.runner.verify(path)
      await this.prisma.$disconnect()
      disconnected = true
      await this.runner.restore(path)
      await this.runner.migrate()
      await this.prisma.$connect()
      disconnected = false
      await this.assertDatabaseHealthy()
      const manifest: BackupManifest = {
        backupNo,
        createdAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        postgresVersion: await this.postgresVersion(),
        fileSize: file.buffer.length,
        sha256: this.hash(file.buffer),
        catalogEntries: (await this.runner.verify(path)).catalogEntries,
        recordCounts: await this.recordCounts(),
      }
      const record = await this.prisma.backupHistory.create({
        data: {
          backupNo,
          trigger: BackupTrigger.BOOTSTRAP_IMPORT,
          status: BackupStatus.VERIFIED,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          appVersion: APP_VERSION,
          postgresVersion: manifest.postgresVersion,
          sha256: manifest.sha256,
          size: BigInt(file.buffer.length),
          manifest: manifest as unknown as Prisma.InputJsonValue,
          localAvailable: true,
          completedAt: new Date(),
          verifiedAt: new Date(),
        },
      })
      await this.audit.record({
        module: 'BACKUP',
        action: 'BOOTSTRAP_RESTORE',
        entityType: 'BackupHistory',
        entityId: record.id,
        after: { backupNo, sha256: manifest.sha256, sourceFileName: file.originalname },
      })
      return { restored: true, backupNo, health: 'operational' }
    } finally {
      if (disconnected) await this.prisma.$connect().catch(() => undefined)
      this.maintenance.exit()
      this.restoreRunning = false
    }
  }

  exportCsv(query: BackupListQueryDto): Readable {
    const list = this.list.bind(this)
    return Readable.from(
      (async function* () {
        yield '\uFEFF备份编号,状态,触发方式,格式,大小,SHA-256,Schema,锁定,完成时间\r\n'
        let page = 1
        let emitted = 0
        const limit = query.exportLimit ?? 10_000
        while (emitted < limit) {
          const result = await list({ ...query, page, pageSize: 100 })
          for (const row of result.data) {
            if (emitted >= limit) break
            const values = [
              row.backupNo,
              row.status,
              row.trigger,
              row.format,
              row.size,
              row.sha256,
              row.schemaVersion,
              row.locked,
              row.completedAt,
            ].map((value) => BackupService.csvCell(value))
            yield `${values.join(',')}\r\n`
            emitted += 1
          }
          if (!result.meta.hasNextPage) break
          page += 1
        }
      })(),
    )
  }

  private async runStartupCompensation(): Promise<void> {
    const status = await this.systemStatus()
    const latest = status.latest as { completedAt?: string } | null
    const latestAt = latest?.completedAt ? new Date(latest.completedAt) : new Date(0)
    const stale = Date.now() - latestAt.getTime() >= this.autoAfterHours * 3_600_000
    if (stale && status.changesSinceLast > 0) {
      await this.createBackup(BackupTrigger.STARTUP_COMPENSATION)
    }
  }

  private async applyRetention(requestId?: string): Promise<void> {
    const candidates = await this.prisma.backupHistory.findMany({
      where: {
        status: BackupStatus.VERIFIED,
        cloudUploadedAt: { not: null },
        verifiedAt: { not: null },
        completedAt: { not: null },
      },
      select: { id: true, completedAt: true, locked: true },
    })
    const expired = selectExpiredBackupIds(
      candidates.map((item) => ({ ...item, completedAt: item.completedAt! })),
      this.config.get<string>('APP_TIMEZONE') || 'Asia/Shanghai',
    )
    for (const id of expired) {
      const backup = await this.prisma.backupHistory.findUnique({
        where: { id },
        include: { fileAsset: true },
      })
      if (!backup || backup.locked) continue
      const associations = await this.prisma.fileAssociation.findMany({
        where: { module: 'BACKUP', entityType: 'BackupHistory', entityId: id },
        select: { fileAssetId: true },
      })
      const fileIds = new Set([
        ...(backup.fileAssetId ? [backup.fileAssetId] : []),
        ...associations.map((item) => item.fileAssetId),
      ])
      for (const fileId of fileIds) await this.files.deleteInternalStorage(fileId, requestId)
      await this.deleteLocalFiles(backup)
      await this.prisma.backupHistory.update({
        where: { id },
        data: { status: BackupStatus.EXPIRED, localAvailable: false },
      })
      await this.audit.record({
        module: 'BACKUP',
        action: 'RETENTION_EXPIRE',
        entityType: 'BackupHistory',
        entityId: id,
        before: { backupNo: backup.backupNo, completedAt: backup.completedAt },
        requestId,
      })
    }
  }

  private async materialize(backup: BackupHistory): Promise<MaterializedBackup> {
    const local = this.dumpPath(backup.backupNo, backup.startedAt)
    try {
      await stat(local)
      return { path: local, temporary: false }
    } catch {
      const content = await this.download(backup.id)
      const temporary = resolve(
        this.backupDirectory,
        `${backup.backupNo}.${Date.now()}.restore.tmp`,
      )
      await mkdir(this.backupDirectory, { recursive: true })
      await writeFile(temporary, content.content, { flag: 'wx' })
      return { path: temporary, temporary: true }
    }
  }

  private async cleanupMaterialized(file: MaterializedBackup): Promise<void> {
    if (file.temporary) await unlink(file.path).catch(() => undefined)
  }

  private async rehydrateRestoredBackup(
    source: BackupHistory,
    content: Buffer,
    actor: AuthUser,
    requestId?: string,
  ): Promise<void> {
    const manifest = source.manifest as unknown as BackupManifest | null
    const restoredAt = new Date()
    const record = await this.prisma.backupHistory.upsert({
      where: { backupNo: source.backupNo },
      create: {
        backupNo: source.backupNo,
        trigger: source.trigger,
        status: BackupStatus.VERIFIED,
        schemaVersion: source.schemaVersion,
        appVersion: source.appVersion,
        postgresVersion: source.postgresVersion,
        sha256: source.sha256,
        size: source.size,
        manifest: manifest as unknown as Prisma.InputJsonValue,
        locked: source.locked,
        localAvailable: true,
        startedAt: source.startedAt,
        completedAt: source.completedAt,
        verifiedAt: source.verifiedAt,
        restoredAt,
      },
      update: {
        status: BackupStatus.VERIFIED,
        schemaVersion: source.schemaVersion,
        appVersion: source.appVersion,
        postgresVersion: source.postgresVersion,
        sha256: source.sha256,
        size: source.size,
        manifest: manifest as unknown as Prisma.InputJsonValue,
        localAvailable: true,
        completedAt: source.completedAt,
        verifiedAt: source.verifiedAt,
        restoredAt,
      },
    })
    try {
      const asset = await this.files.storeInternal(
        {
          logicalPath: this.logicalPathFor(source.startedAt),
          fileName: `${source.backupNo}.dump`,
          mimeType: 'application/vnd.postgresql.custom-backup',
          content,
        },
        actor,
        requestId,
      )
      await this.prisma.backupHistory.update({
        where: { id: record.id },
        data: {
          fileAssetId: asset.id,
          cloudUploadedAt: asset.provider === StorageProviderType.ONEDRIVE ? restoredAt : undefined,
        },
      })
    } catch (error) {
      this.logger.warn(`恢复成功，但备份文件重新登记失败：${this.safeError(error)}`)
    }
  }

  private async assertDatabaseHealthy(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`
    if (rows[0]?.ok !== 1) {
      throw new ServiceUnavailableException({
        code: 'RESTORE_HEALTH_CHECK_FAILED',
        message: '恢复后的数据库健康检查失败',
      })
    }
  }

  private async assertRecordCounts(manifest: BackupManifest | null): Promise<void> {
    if (!manifest?.recordCounts) return
    const actual = await this.recordCounts()
    const mismatched = Object.entries(manifest.recordCounts).filter(
      ([key, expected]) => actual[key] !== expected,
    )
    if (mismatched.length) {
      throw new ServiceUnavailableException({
        code: 'RESTORE_RECORD_COUNT_MISMATCH',
        message: `恢复后关键表计数不一致：${mismatched.map(([key]) => key).join('、')}`,
      })
    }
  }

  private async assertCompatible(manifest: BackupManifest | null): Promise<void> {
    if (!manifest) {
      throw new UnprocessableEntityException({
        code: 'BACKUP_MANIFEST_MISSING',
        message: '备份缺少兼容性 Manifest，禁止一键恢复',
      })
    }
    if (manifest.schemaVersion.localeCompare(CURRENT_SCHEMA_VERSION) > 0) {
      throw new UnprocessableEntityException({
        code: 'BACKUP_SCHEMA_NEWER',
        message: '备份来自更高版本，请先升级 Personal ERP',
      })
    }
    const sourceMajor = Number.parseInt(manifest.postgresVersion, 10)
    const currentMajor = Number.parseInt(await this.postgresVersion(), 10)
    if (
      Number.isFinite(sourceMajor) &&
      Number.isFinite(currentMajor) &&
      sourceMajor > currentMajor
    ) {
      throw new UnprocessableEntityException({
        code: 'BACKUP_POSTGRES_NEWER',
        message: '备份来自更高 PostgreSQL 主版本，请先升级数据库容器',
      })
    }
  }

  private async postgresVersion(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ version: string }>>`
      SELECT current_setting('server_version') AS version
    `
    return rows[0]?.version ?? 'unknown'
  }

  private async recordCounts(): Promise<Record<string, number>> {
    const [products, skus, balances, purchases, sales, qualityIssues, transactions, files] =
      await this.prisma.$transaction([
        this.prisma.product.count(),
        this.prisma.sku.count(),
        this.prisma.inventoryBalance.count(),
        this.prisma.purchaseOrder.count(),
        this.prisma.salesOrder.count(),
        this.prisma.qualityIssue.count(),
        this.prisma.financialTransaction.count(),
        this.prisma.fileAsset.count(),
      ])
    return { products, skus, balances, purchases, sales, qualityIssues, transactions, files }
  }

  private serialize<T extends BackupHistory & { fileAsset?: unknown }>(backup: T) {
    return { ...backup, size: backup.size.toString() }
  }

  private folderFor(date: Date): string {
    return resolve(
      this.backupDirectory,
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, '0'),
    )
  }

  private logicalPathFor(date: Date): string {
    return `Backups/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  private dumpPath(backupNo: string, date: Date): string {
    return resolve(this.folderFor(date), `${backupNo}.dump`)
  }

  private nextBackupNo(trigger: BackupTrigger): string {
    const now = new Date()
    const date = now
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14)
    const prefix =
      trigger === BackupTrigger.PRE_RESTORE
        ? 'PRE'
        : trigger === BackupTrigger.BOOTSTRAP_IMPORT
          ? 'IMP'
          : 'BKP'
    return `${prefix}-${date}-${randomBytes(2).toString('hex').toUpperCase()}`
  }

  private hash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex')
  }

  private safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : '备份任务失败'
    return message.replace(/password=[^\s&]+/gi, 'password=[REDACTED]').slice(0, 500)
  }

  private async deleteLocalFiles(backup: BackupHistory): Promise<void> {
    const base = this.folderFor(backup.startedAt)
    await Promise.all([
      unlink(resolve(base, `${backup.backupNo}.dump`)).catch(() => undefined),
      unlink(resolve(base, `${backup.backupNo}.manifest.json`)).catch(() => undefined),
    ])
  }

  private verifyRecoveryKey(value?: string): void {
    if (!this.recoveryKey) {
      throw new ServiceUnavailableException({
        code: 'BOOTSTRAP_RECOVERY_NOT_CONFIGURED',
        message: '请先配置 BOOTSTRAP_RECOVERY_KEY',
      })
    }
    const expected = createHash('sha256').update(this.recoveryKey).digest()
    const actual = createHash('sha256')
      .update(value ?? '')
      .digest()
    if (!timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException({
        code: 'BOOTSTRAP_RECOVERY_UNAUTHORIZED',
        message: '恢复密钥无效',
      })
    }
  }

  private static csvCell(value: unknown): string {
    const raw = value == null ? '' : String(value)
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
    return `"${safe.replaceAll('"', '""')}"`
  }
}

import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BackupStatus, BackupTrigger, PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { SortOrder } from '../src/common/dto/list-query.dto';
import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { BackupService } from '../src/modules/backup/backup.service';
import { MaintenanceService } from '../src/modules/backup/maintenance.service';
import { PostgresBackupRunner } from '../src/modules/backup/postgres-backup.runner';
import { FilesService } from '../src/modules/files/files.service';
import { OneDriveService } from '../src/modules/files/onedrive/onedrive.service';
import { OneDriveTokenCacheService } from '../src/modules/files/onedrive/onedrive-token-cache.service';
import { MockStorageProvider } from '../src/modules/files/storage/mock-storage.provider';
import { OneDriveStorageProvider } from '../src/modules/files/storage/onedrive-storage.provider';
import { cleanDatabase } from './database-cleanup';

describe('Phase 8 backup integration', () => {
  const prisma = new PrismaService();
  const config = new ConfigService({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_REFRESH_SECRET: 'phase8-test-refresh-secret-at-least-32-characters',
    MICROSOFT_CLIENT_ID: '',
    MICROSOFT_AUTHORITY: 'https://login.microsoftonline.com/consumers',
    ONEDRIVE_ROOT_FOLDER: 'ERP_STORAGE',
    BACKUP_TEMP_DIR: resolve(tmpdir(), 'personal-erp-backup-integration'),
    BACKUP_AUTO_AFTER_HOURS: '24',
    BACKUP_OPERATION_THRESHOLD: '50',
    POSTGRES_TEST_CONTAINER_NAME: 'personal-erp-postgres-test',
  });
  const audit = new AuditService(prisma);
  const jwt = new JwtService({ secret: 'phase8-access-secret-at-least-32-characters' });
  const auth = new AuthService(prisma, jwt, audit);
  const tokenCache = new OneDriveTokenCacheService(prisma, config);
  const oneDrive = new OneDriveService(prisma, config, tokenCache);
  const mockProvider = new MockStorageProvider(config);
  const oneDriveProvider = new OneDriveStorageProvider(oneDrive);
  const files = new FilesService(prisma, audit, oneDrive, mockProvider, oneDriveProvider);
  const runner = new PostgresBackupRunner(config);
  const maintenance = new MaintenanceService();
  const backups = new BackupService(prisma, config, audit, auth, files, runner, maintenance);
  let actor: { id: string; username: string };
  let backupId: string;
  let backupNo: string;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanDatabase(prisma as PrismaClient);
    const user = await prisma.adminUser.create({
      data: {
        username: 'backup-integration',
        passwordHash: await argon2.hash('StrongPassword!2026'),
      },
    });
    actor = { id: user.id, username: user.username };
    const category = await prisma.category.create({
      data: { code: 'BACKUP-CAT', name: '备份测试类目' },
    });
    await prisma.product.create({
      data: { code: 'BACKUP-PROD', name: '备份测试商品', categoryId: category.id },
    });
  });

  afterAll(async () => {
    await cleanDatabase(prisma as PrismaClient);
    await prisma.$disconnect();
  });

  it('creates a real custom-format dump, uploads through FileService and verifies SHA-256', async () => {
    const created = await backups.createManual(actor, true);
    backupId = String(created.id);
    backupNo = String(created.backupNo);
    expect(created).toMatchObject({
      status: BackupStatus.VERIFIED,
      trigger: BackupTrigger.MANUAL,
      locked: true,
      localAvailable: true,
    });
    const stored = await prisma.backupHistory.findUniqueOrThrow({
      where: { id: backupId },
      include: { fileAsset: true },
    });
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(stored.size)).toBeGreaterThan(100);
    expect(stored.fileAsset?.logicalPath).toMatch(/^Backups\//);
    const download = await backups.download(backupId);
    expect(download.content.subarray(0, 5).toString('ascii')).toBe('PGDMP');

    const verified = await backups.verify(backupId, actor);
    expect(verified.status).toBe(BackupStatus.VERIFIED);
  }, 60_000);

  it('supports paginated filters, recommendation state and retention lock changes', async () => {
    const page = await backups.list({
      page: 1,
      pageSize: 10,
      keyword: 'BKP-',
      sortBy: 'completedAt',
      sortOrder: SortOrder.DESC,
      backupStatus: BackupStatus.VERIFIED,
      trigger: BackupTrigger.MANUAL,
      locked: true,
    });
    expect(page.meta).toMatchObject({ page: 1, pageSize: 10, total: 1 });
    const unlocked = await backups.lock(backupId, false, actor);
    expect(unlocked.locked).toBe(false);
    const status = await backups.systemStatus();
    expect(status).toMatchObject({
      backupRecommended: false,
      operationThreshold: 50,
      maintenance: { active: false },
    });
  });

  it('creates PRE_RESTORE, restores through pg_restore and validates post-restore counts', async () => {
    await prisma.category.create({
      data: { code: 'AFTER-BACKUP', name: '应在恢复后消失' },
    });
    const result = await backups.restore(
      backupId,
      {
        password: 'StrongPassword!2026',
        confirmPhrase: `RESTORE ${backupNo}`,
      },
      actor,
    );
    expect(result).toMatchObject({ restored: true, backupNo, health: 'operational' });
    expect(await prisma.category.findUnique({ where: { code: 'AFTER-BACKUP' } })).toBeNull();
    expect(
      await prisma.backupHistory.findFirst({
        where: { trigger: BackupTrigger.PRE_RESTORE },
      }),
    ).not.toBeNull();
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
  }, 90_000);
});

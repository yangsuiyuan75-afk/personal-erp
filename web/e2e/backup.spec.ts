import { expect, test } from '@playwright/test';

const backup = {
  id: '11111111-1111-4111-8111-111111111111',
  backupNo: 'BKP-20260716160000-ABCD',
  status: 'VERIFIED',
  format: 'POSTGRES_CUSTOM',
  trigger: 'MANUAL',
  schemaVersion: '202607160012_phase8_backup',
  appVersion: '0.1.0',
  postgresVersion: '17.6',
  sha256: '8f4ef32ef258f9ef4f3f20af65f33ecb13dcb59a041022c94636234d0f881992',
  size: '262144',
  manifest: {
    catalogEntries: 220,
    recordCounts: { products: 12, skus: 24, balances: 18, purchases: 7, sales: 9 },
  },
  locked: false,
  localAvailable: true,
  startedAt: '2026-07-16T08:00:00Z',
  completedAt: '2026-07-16T08:00:02Z',
  verifiedAt: '2026-07-16T08:00:02Z',
  cloudUploadedAt: null,
  fileAsset: { provider: 'MOCK_LOCAL', status: 'SYNCED', fileName: 'backup.dump' },
};

const meta = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: { initialized: true } }),
    }),
  );
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: { user: { id: 'admin-id', username: 'admin' }, accessToken: 'test-access-token' },
      }),
    }),
  );
  await page.route('**/api/v1/backups/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          maintenance: { active: false },
          task: { backupRunning: false, restoreRunning: false },
          latest: backup,
          changesSinceLast: 3,
          operationsSinceLast: 3,
          operationThreshold: 50,
          backupRecommended: false,
          autoAfterHours: 24,
          recoveryConfigured: false,
        },
      }),
    }),
  );
  await page.route(/\/api\/v1\/backups(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: backup }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [backup], meta }),
    });
  });
  await page.route(`**/api/v1/backups/${backup.id}/verify`, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: backup }) }),
  );
  await page.route(`**/api/v1/backups/${backup.id}/lock`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: { ...backup, locked: true } }),
    }),
  );
  await page.route(`**/api/v1/backups/${backup.id}/restore`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          restored: true,
          backupNo: backup.backupNo,
          preRestoreBackupNo: 'PRE-20260716161000-DCBA',
        },
      }),
    }),
  );
});

test('uses the unified data workspace, URL filters, manual backup and protected restore flow', async ({
  page,
}) => {
  await page.goto('/backups');
  await expect(page.getByRole('heading', { name: '数据库备份与恢复' })).toBeVisible();
  await expect(page.getByText(backup.backupNo, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('上次备份后业务过账')).toBeVisible();

  await page.getByRole('textbox', { name: '搜索备份' }).fill('BKP-2026');
  await expect(page).toHaveURL(/keyword=BKP-2026/);
  await page.getByRole('combobox', { name: '备份状态' }).click();
  await page.getByRole('option', { name: '校验通过' }).click();
  await expect(page).toHaveURL(/backupStatus=VERIFIED/);
  await page.getByRole('combobox', { name: '触发方式' }).click();
  await page.getByRole('option', { name: '手工备份' }).click();
  await expect(page).toHaveURL(/trigger=MANUAL/);

  await page.locator('tbody tr').filter({ hasText: backup.backupNo }).click();
  await expect(page.getByText('关键记录计数')).toBeVisible();
  await expect(page.getByText(backup.sha256, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '立即备份' }).click();
  await expect(page.getByText('备份已生成并校验')).toBeVisible();

  await page.getByRole('button', { name: `恢复 ${backup.backupNo}` }).click();
  await expect(page.getByRole('heading', { name: '恢复数据库' })).toBeVisible();
  await page.getByLabel('当前管理员密码').fill('StrongPassword!2026');
  await page
    .getByLabel(`输入确认短语：RESTORE ${backup.backupNo}`)
    .fill(`RESTORE ${backup.backupNo}`);
  await page.getByRole('button', { name: '创建保护点并恢复' }).click();
  await expect(page.getByText(/恢复前保护点为 PRE-/)).toBeVisible();
});

test('offers a recovery-key protected Bootstrap upload before administrator creation', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: { initialized: false, recoveryRequired: true } }),
    }),
  );
  await page.route('**/api/v1/bootstrap-recovery/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          schemaReady: false,
          initialized: false,
          recoveryRequired: true,
          recoveryConfigured: true,
          confirmPhrase: 'BOOTSTRAP RESTORE',
        },
      }),
    }),
  );
  await page.route('**/api/v1/bootstrap-recovery/restore', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: { restored: true, backupNo: 'IMP-20260716162000-EFGH' } }),
    }),
  );

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '创建本地管理员' })).toBeVisible();
  await page.getByRole('button', { name: '已有数据库备份？从恢复点启动' }).click();
  await expect(page.getByText('Bootstrap 恢复已就绪')).toBeVisible();
  await page.getByLabel('恢复密钥').fill('local-recovery-key-2026');
  await page.locator('.bootstrap-file-picker input').setInputFiles({
    name: 'personal-erp.dump',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('PGDMP mock backup'),
  });
  await page.getByLabel('输入确认短语：BOOTSTRAP RESTORE').fill('BOOTSTRAP RESTORE');
  const restoreRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith('/api/v1/bootstrap-recovery/restore') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: '恢复此备份' }).click();
  const request = await restoreRequest;
  expect(request.headers()['x-recovery-key']).toBe('local-recovery-key-2026');
});

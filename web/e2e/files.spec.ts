import { expect, test } from '@playwright/test';

const meta = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

const fileAsset = {
  id: '11111111-1111-4111-8111-111111111111',
  provider: 'MOCK_LOCAL',
  driveId: 'mock-local',
  itemId: '22222222-2222-4222-8222-222222222222',
  logicalPath: 'Products/33333333-3333-4333-8333-333333333333',
  fileName: 'product-main.png',
  mimeType: 'image/png',
  size: 2048,
  sha256: '8f4ef32ef258f9ef4f3f20af65f33ecb13dcb59a041022c94636234d0f881992',
  eTag: 'mock-etag',
  status: 'SYNCED',
  lastError: null,
  createdAt: '2026-07-16T08:00:00Z',
  updatedAt: '2026-07-16T08:00:00Z',
  associations: [],
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
  await page.route('**/api/v1/onedrive/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          code: 'CLIENT_ID_MISSING',
          label: '未配置 Client ID',
          configured: false,
          externalConfigurationStatus: 'WAITING_FOR_EXTERNAL_CONFIGURATION',
          mockProviderAvailable: true,
          authority: 'https://login.microsoftonline.com/consumers',
          scopes: ['User.Read', 'Files.ReadWrite', 'offline_access'],
        },
      }),
    }),
  );
  await page.route(/\/api\/v1\/files(\?|$)/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [fileAsset], meta }),
    }),
  );
  await page.route('**/api/v1/master-data/products*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            code: 'PROD-001',
            name: '无线耳机',
            status: 'ACTIVE',
          },
        ],
        meta,
      }),
    }),
  );
  await page.route(
    '**/api/v1/files/products/33333333-3333-4333-8333-333333333333/images',
    async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              product: {
                id: '33333333-3333-4333-8333-333333333333',
                code: 'PROD-001',
                name: '无线耳机',
              },
              images: [],
            },
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            product: {
              id: '33333333-3333-4333-8333-333333333333',
              code: 'PROD-001',
              name: '无线耳机',
            },
            images: [],
          },
        }),
      });
    },
  );
});

test('renders file assets, syncs filters to URL, uploads product images, and shows all OneDrive states', async ({
  page,
}) => {
  await page.goto('/files');
  await expect(page.getByRole('heading', { name: '文件与商品图片' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'product-main.png image/png' })).toBeVisible();
  await expect(page.getByText('选择一条文件资产')).toBeVisible();

  await page.getByRole('textbox', { name: '搜索文件' }).fill('product-main');
  await expect(page).toHaveURL(/keyword=product-main/);
  await page.getByRole('combobox', { name: '存储提供方' }).click();
  await page.getByRole('option', { name: '本地模拟 Provider' }).click();
  await expect(page).toHaveURL(/provider=MOCK_LOCAL/);

  await page.getByRole('button', { name: '商品图库' }).click();
  await expect(page).toHaveURL(/view=gallery/);
  await expect(page.getByText('该商品还没有图片')).toBeVisible();
  await page.locator('.gallery-file-picker input').setInputFiles({
    name: 'front.png',
    mimeType: 'image/png',
    buffer: Buffer.from('test-image'),
  });
  await page.getByRole('button', { name: '上传图片' }).click();
  await expect(page.getByText('商品图片已上传')).toBeVisible();

  await page.getByRole('button', { name: 'OneDrive 设置' }).click();
  await expect(page).toHaveURL(/view=onedrive/);
  await expect(page.getByRole('heading', { name: '未配置 Client ID' })).toBeVisible();
  await expect(
    page.getByText('WAITING_FOR_EXTERNAL_CONFIGURATION', { exact: true }).last(),
  ).toBeVisible();
  for (const label of [
    '未配置 Client ID',
    '未连接',
    '正在授权',
    '已连接',
    'Token 需要重新授权',
    'Graph 不可达',
    'OneDrive 空间不足',
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('Files.ReadWrite', { exact: true })).toBeVisible();
  await expect(page.getByText('consumers', { exact: true })).toBeVisible();
});

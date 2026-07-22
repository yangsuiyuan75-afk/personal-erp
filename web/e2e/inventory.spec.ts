import { expect, test } from '@playwright/test';

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
  await page.route('**/api/v1/inventory/balances*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'main:sku:AVAILABLE',
            code: 'SKU-BOX',
            name: '透明收纳盒',
            status: 'ACTIVE',
            locationId: 'main',
            skuId: 'sku',
            skuCode: 'SKU-BOX',
            stockStatus: 'AVAILABLE',
            onHandQuantity: '20',
            reservedQuantity: '2',
            availableQuantity: '18',
            averageCost: '12.5',
            inventoryValue: '250',
            updatedAt: '2026-07-16T00:00:00Z',
            location: { id: 'main', code: 'MAIN', name: '主仓' },
            sku: {
              id: 'sku',
              code: 'SKU-BOX',
              barcode: 'BOX-001',
              name: '透明收纳盒',
              product: { id: 'product', code: 'BOX', name: '收纳盒' },
              baseUnit: { id: 'unit', code: 'PCS', name: '件', decimalScale: 0 },
            },
          },
        ],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      }),
    }),
  );
  await page.route('**/api/v1/inventory/batches*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'batch',
            batchNo: 'OPEN-BOX-001',
            sku: { code: 'SKU-BOX', name: '透明收纳盒' },
            remainingQuantity: '20',
            unitCost: '12.5',
            receivedAt: '2026-07-16T00:00:00Z',
          },
        ],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      }),
    }),
  );
});

test('renders the data-first inventory workspace and contextual batch trace', async ({ page }) => {
  await page.goto('/inventory');
  await expect(page.getByRole('navigation', { name: '库存视图' })).toBeVisible();
  await expect(page.getByRole('button', { name: '库存余额' })).toHaveClass(/active/);
  await expect(page.getByRole('button', { name: '发起调拨' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '透明收纳盒', exact: true })).toBeVisible();
  await expect(page.getByText('选择一条库存余额')).toBeVisible();

  await page.getByRole('cell', { name: '透明收纳盒', exact: true }).click();
  await expect(page.getByRole('heading', { name: '透明收纳盒' })).toBeVisible();
  await expect(page.getByText('OPEN-BOX-001')).toBeVisible();

  await page.getByRole('textbox', { name: '库存关键字搜索' }).fill('收纳');
  await expect(page).toHaveURL(/keyword=%E6%94%B6%E7%BA%B3/);
});

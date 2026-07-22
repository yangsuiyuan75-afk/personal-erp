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
        data: { user: { id: 'admin', username: 'admin' }, accessToken: 'token' },
      }),
    }),
  );
  await page.route('**/api/v1/purchase/orders*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'order-id',
            orderNo: 'PO-20260716-001',
            supplier: { name: '星河家居供应链' },
            purchaseChannel: { name: '1688' },
            buyer: { name: '林采购' },
            items: [
              { id: 'item-id', sku: { code: 'SKU-BOX' }, quantity: '100', receivedQuantity: '20' },
            ],
            totalAmount: '1250',
            status: 'PARTIALLY_RECEIVED',
            orderDate: '2026-07-16T00:00:00Z',
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

test('renders purchase lifecycle and keeps query state in URL', async ({ page }) => {
  await page.goto('/purchase');
  await expect(page.getByRole('heading', { name: '采购与收货' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'PO-20260716-001', exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByText('部分收货')).toBeVisible();
  await page.getByRole('textbox', { name: '采购关键字搜索' }).fill('星河');
  await expect(page).toHaveURL(/keyword=%E6%98%9F%E6%B2%B3/);
  await page.getByRole('button', { name: '新建采购订单' }).click();
  await expect(page.getByRole('heading', { name: '新建采购订单' })).toBeVisible();
});

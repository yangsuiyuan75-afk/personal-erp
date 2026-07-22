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
  await page.route('**/api/v1/sales/orders*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'sales-order-id',
            orderNo: 'SO-20260716-001',
            salesChannel: { name: '线下渠道', inventoryMode: 'DIRECT_FROM_LOCATION' },
            customer: { name: '客户 A' },
            items: [
              {
                id: 'sales-item-id',
                sku: { code: 'SKU-BOX' },
                quantity: '100',
                issuedQuantity: '40',
              },
            ],
            totalAmount: '2000',
            status: 'PARTIALLY_ISSUED',
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

test('renders sales lifecycle and synchronizes query state to URL', async ({ page }) => {
  await page.goto('/sales');
  await expect(page.getByRole('heading', { name: '销售、出库与渠道仓' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'SO-20260716-001', exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByText('部分出库')).toBeVisible();
  await page.getByRole('textbox', { name: '销售关键字搜索' }).fill('客户 A');
  await expect(page).toHaveURL(/keyword=%E5%AE%A2%E6%88%B7\+A/);
  await page.getByRole('button', { name: '新建销售订单' }).click();
  await expect(page.getByRole('heading', { name: '新建销售订单' })).toBeVisible();
});

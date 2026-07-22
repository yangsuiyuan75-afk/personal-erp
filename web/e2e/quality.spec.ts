import { expect, test } from '@playwright/test';

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
  await page.route('**/api/v1/quality/pending-returns*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'return-id',
            returnNo: 'SR-20260716-001',
            customer: { name: '客户 A' },
            salesChannel: { name: '线下渠道' },
            qcLocation: { name: '待质检区' },
            items: [
              {
                id: 'return-item-id',
                quantity: '3',
                sku: { code: 'SKU-BOX', name: '透明收纳盒' },
              },
            ],
            totalRefund: '75',
            status: 'POSTED',
            occurredAt: '2026-07-16T08:00:00Z',
          },
        ],
        meta,
      }),
    }),
  );
  await page.route('**/api/v1/quality/claims*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta: { ...meta, total: 0, totalPages: 0 } }),
    }),
  );
  await page.route('**/api/v1/inventory/locations*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta: { ...meta, total: 0, totalPages: 0 } }),
    }),
  );
  await page.route('**/api/v1/master-data/suppliers*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta: { ...meta, total: 0, totalPages: 0 } }),
    }),
  );
});

test('renders quality workflow, contextual summary, and URL-synchronized search', async ({
  page,
}) => {
  await page.goto('/quality');
  await expect(page.getByRole('heading', { name: '质量处置工作台' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'SR-20260716-001', exact: true })).toBeVisible();
  await expect(page.getByText('选择一条质量记录')).toBeVisible();

  await page.getByRole('cell', { name: 'SR-20260716-001', exact: true }).click();
  await expect(page.getByRole('heading', { name: '客户 A' })).toBeVisible();
  await expect(page.getByText('退货不会直接回到可售库存')).toBeVisible();

  await page.getByRole('textbox', { name: '质量业务关键字搜索' }).fill('客户 A');
  await expect(page).toHaveURL(/keyword=%E5%AE%A2%E6%88%B7\+A/);

  await page.getByRole('button', { name: '新建退货质检' }).click();
  await expect(page.getByRole('heading', { name: '退货质检' })).toBeVisible();
  await page.locator('.dialog-popup [role="combobox"]').first().click();
  await expect(page.getByRole('option', { name: /SR-20260716-001/ })).toBeVisible();
});

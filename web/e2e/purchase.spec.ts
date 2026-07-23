import { expect, test } from '@playwright/test';

let initialOrderSort: URLSearchParams | undefined;

test.beforeEach(async ({ page }) => {
  initialOrderSort = undefined;
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
  const sku = { code: 'SKU-BOX', name: '收纳盒' };
  const purchaseRows = {
    prices: {
      id: 'purchase-price-id',
      sku,
      supplier: { name: '星河家居供应链' },
      purchaseChannel: { name: '1688' },
      buyer: { name: '林采购' },
      price: '12.5',
      minQuantity: '1',
      status: 'ACTIVE',
    },
    orders: {
      id: 'order-id',
      orderNo: 'PO-20260716-001',
      supplier: { name: '星河家居供应链' },
      purchaseChannel: { name: '1688' },
      buyer: { name: '林采购' },
      items: [{ id: 'item-id', sku, quantity: '100', receivedQuantity: '20' }],
      totalAmount: '1250',
      status: 'PARTIALLY_RECEIVED',
      orderDate: '2026-07-16T00:00:00Z',
    },
    receipts: {
      id: 'receipt-id',
      receiptNo: 'PR-20260716-001',
      purchaseOrder: { orderNo: 'PO-20260716-001', supplier: { name: '星河家居供应链' } },
      location: { name: '采购仓' },
      items: [{ id: 'receipt-item-id', sku, quantity: '100' }],
      totalAmount: '1250',
      status: 'POSTED',
      occurredAt: '2026-07-16T00:00:00Z',
    },
    returns: {
      id: 'return-id',
      returnNo: 'PT-20260716-001',
      supplier: { name: '星河家居供应链' },
      location: { name: '采购仓' },
      items: [{ id: 'return-item-id', sku, quantity: '2' }],
      reason: '来料不符',
      totalAmount: '25',
      status: 'POSTED',
      occurredAt: '2026-07-16T00:00:00Z',
    },
    payables: {
      id: 'payable-id',
      payableNo: 'AP-20260716-001',
      purchaseReceipt: { items: [{ id: 'receipt-item-id', sku, quantity: '100' }] },
      supplier: { name: '星河家居供应链' },
      purchaseChannel: { name: '1688' },
      buyer: { name: '林采购' },
      originalAmount: '1250',
      adjustedAmount: '0',
      paidAmount: '0',
      outstandingAmount: '1250',
      status: 'OPEN',
      occurredAt: '2026-07-16T00:00:00Z',
    },
    'supplier-credits': {
      id: 'credit-id',
      creditNo: 'SC-20260716-001',
      purchaseReturn: {
        returnNo: 'PT-20260716-001',
        items: [{ id: 'return-item-id', sku, quantity: '2' }],
      },
      supplier: { name: '星河家居供应链' },
      amount: '25',
      appliedAmount: '0',
      status: 'OPEN',
      createdAt: '2026-07-16T00:00:00Z',
    },
  };
  await page.route('**/api/v1/purchase/**', (route) => {
    const requestUrl = new URL(route.request().url());
    const endpoint = requestUrl.pathname.split('/').at(-1) ?? '';
    if (endpoint === 'orders' && !initialOrderSort) {
      initialOrderSort = requestUrl.searchParams;
    }
    const row = purchaseRows[endpoint as keyof typeof purchaseRows];
    if (!row) return route.fallback();
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [row],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      }),
    });
  });
});

test('renders purchase lifecycle and keeps query state in URL', async ({ page }) => {
  await page.goto('/purchase');
  await expect.poll(() => initialOrderSort?.get('sortBy')).toBe('orderDate');
  expect(initialOrderSort?.get('sortOrder')).toBe('desc');
  await expect(page.getByRole('heading', { name: '采购与收货' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'PO-20260716-001', exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByText('部分收货')).toBeVisible();
  await expect(page.getByRole('table')).toContainText('SKU-BOX · 收纳盒');
  await page.getByRole('textbox', { name: '采购关键字搜索' }).fill('星河');
  await expect(page).toHaveURL(/keyword=%E6%98%9F%E6%B2%B3/);
  const tabs = page.getByRole('navigation', { name: '采购视图' });
  for (const tab of ['采购收货', '采购退货', '采购报价', '应付', '供应商退款']) {
    await tabs.getByRole('button', { name: tab }).click();
    await expect(page.getByRole('table')).toContainText('SKU-BOX · 收纳盒');
  }
  await tabs.getByRole('button', { name: '采购订单' }).click();
  await page.getByRole('button', { name: '新建采购订单' }).click();
  await expect(page.getByRole('heading', { name: '新建采购订单' })).toBeVisible();
});

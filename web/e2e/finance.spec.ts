import { expect, test } from '@playwright/test';

const meta = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
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
  await page.route('**/api/v1/finance/accounts*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'account-id',
            code: 'BANK-CNY',
            name: '经营银行卡',
            type: 'BANK',
            currency: 'CNY',
            balance: '12850.5',
            status: 'ACTIVE',
            updatedAt: '2026-07-16T08:00:00Z',
          },
        ],
        meta: { ...meta, total: 1, totalPages: 1 },
      }),
    }),
  );
  await page.route('**/api/v1/finance/analytics*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          summary: {
            income: '25000',
            outflow: '12149.5',
            netCashFlow: '12850.5',
            salesRevenue: '30000',
            salesCost: '17000',
            grossProfit: '13000',
            platformFee: '900',
            logisticsFee: '600',
            otherExpense: '200',
            qualityLoss: '180',
            supplierCompensation: '80',
            operatingResult: '11200',
            outstandingReceivable: '3600',
            outstandingPayable: '2200',
          },
          monthly: [
            {
              month: '2026-07',
              income: '25000',
              outflow: '12149.5',
              netCashFlow: '12850.5',
              salesRevenue: '30000',
              salesCost: '17000',
              grossProfit: '13000',
              qualityLoss: '180',
            },
          ],
          dimensions: {
            salesChannels: [{ id: 'channel', name: '线下渠道', amount: '25000' }],
            customers: [{ id: 'customer', name: '客户 A', amount: '25000' }],
            suppliers: [{ id: 'supplier', name: '供应商 A', amount: '10000' }],
            purchaseChannels: [{ id: 'purchase', name: '1688', amount: '10000' }],
            buyers: [{ id: 'buyer', name: '采购员 A', amount: '10000' }],
          },
        },
      }),
    }),
  );
  await page.route(/\/api\/v1\/finance\/(payables|receivables)(\?|$)/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta }),
    }),
  );
  await page.route(
    /\/api\/v1\/(sales\/customer-refunds|purchase\/supplier-credits|quality\/compensation-receivables)(\?|$)/,
    (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta }),
      }),
  );
  await page.route('**/api/v1/master-data/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta }),
    }),
  );
});

test('renders data-first finance workspace, URL filters, payment flow, and monthly analysis', async ({
  page,
}) => {
  await page.goto('/finance');
  await expect(page.getByRole('heading', { name: '资金与经营分析中心' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '经营银行卡', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '¥12,850.50', exact: true })).toBeVisible();
  await expect(page.getByText('选择一条财务记录')).toBeVisible();

  await page.getByRole('cell', { name: '经营银行卡', exact: true }).click();
  await expect(page.getByRole('heading', { name: '经营银行卡' })).toBeVisible();
  await expect(page.getByText('Supplier Credit 不改变现金余额')).toBeVisible();

  await page.getByRole('textbox', { name: '财务关键字搜索' }).fill('银行卡');
  await expect(page).toHaveURL(/keyword=%E9%93%B6%E8%A1%8C%E5%8D%A1/);

  await page.getByRole('button', { name: '付款', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: '新建付款' })).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();

  await page.getByRole('button', { name: '月度分析' }).click();
  await expect(page.getByText('净现金流', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('线下渠道')).toBeVisible();
});

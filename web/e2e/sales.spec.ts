import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: { initialized: true } }),
    }),
  )
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: { user: { id: 'admin', username: 'admin' }, accessToken: 'token' },
      }),
    }),
  )
  const sku = { code: 'SKU-BOX', name: '收纳盒' }
  const salesRows = {
    prices: {
      id: 'sales-price-id',
      sku,
      salesChannel: { name: '线下渠道' },
      customer: { name: '客户 A' },
      minQuantity: '1',
      price: '20',
      status: 'ACTIVE',
    },
    orders: {
      id: 'sales-order-id',
      orderNo: 'SO-20260716-001',
      salesChannel: { name: '线下渠道', inventoryMode: 'DIRECT_FROM_LOCATION' },
      customer: { name: '客户 A' },
      items: [{ id: 'sales-item-id', sku, quantity: '100', issuedQuantity: '40' }],
      totalAmount: '2000',
      status: 'PARTIALLY_ISSUED',
      orderDate: '2026-07-16T00:00:00Z',
    },
    issues: {
      id: 'sales-issue-id',
      issueNo: 'SI-20260716-001',
      salesOrder: { orderNo: 'SO-20260716-001', status: 'CONFIRMED' },
      salesChannel: { name: '线下渠道' },
      customer: { name: '客户 A' },
      location: { name: '销售主仓' },
      items: [{ id: 'sales-issue-item-id', sku, quantity: '90' }],
      totalRevenue: '1800',
      totalCost: '720',
      status: 'DRAFT',
      occurredAt: '2026-07-16T00:00:00Z',
    },
    returns: {
      id: 'sales-return-id',
      returnNo: 'SR-20260716-001',
      salesIssue: { issueNo: 'SI-20260716-001' },
      customer: { name: '客户 A' },
      qcLocation: { name: '待检区' },
      items: [{ id: 'sales-return-item-id', sku, quantity: '2' }],
      reason: '外观损坏',
      totalRefund: '40',
      status: 'POSTED',
      occurredAt: '2026-07-16T00:00:00Z',
    },
    receivables: {
      id: 'receivable-id',
      receivableNo: 'AR-20260716-001',
      salesIssue: { items: [{ id: 'sales-issue-item-id', sku, quantity: '90' }] },
      customer: { name: '客户 A' },
      salesChannel: { name: '线下渠道' },
      originalAmount: '1800',
      adjustedAmount: '0',
      receivedAmount: '0',
      outstandingAmount: '1800',
      status: 'OPEN',
      occurredAt: '2026-07-16T00:00:00Z',
    },
    'customer-refunds': {
      id: 'customer-refund-id',
      refundNo: 'CR-20260716-001',
      salesReturn: {
        returnNo: 'SR-20260716-001',
        items: [{ id: 'sales-return-item-id', sku, quantity: '2' }],
      },
      customer: { name: '客户 A' },
      salesChannel: { name: '线下渠道' },
      amount: '40',
      paidAmount: '0',
      status: 'OPEN',
      createdAt: '2026-07-16T00:00:00Z',
    },
  }
  await page.route('**/api/v1/sales/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1) ?? ''
    const row = salesRows[endpoint as keyof typeof salesRows]
    if (!row) return route.fallback()
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
    })
  })
})

test('renders sales lifecycle and synchronizes query state to URL', async ({ page }) => {
  await page.goto('/sales')
  await expect(page.getByRole('heading', { name: '销售、出库与渠道仓' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'SO-20260716-001', exact: true })).toBeVisible()
  await expect(page.getByRole('table').getByText('部分出库')).toBeVisible()
  await expect(page.getByRole('table')).toContainText('SKU-BOX · 收纳盒')
  await expect(page.getByRole('table')).toContainText('100')
  await page.getByRole('textbox', { name: '销售关键字搜索' }).fill('客户 A')
  await expect(page).toHaveURL(/keyword=%E5%AE%A2%E6%88%B7\+A/)
  await page.getByRole('button', { name: '新建销售订单' }).click()
  await expect(page.getByRole('heading', { name: '新建销售订单' })).toBeVisible()
  const orderDialog = page.locator('.dialog-popup')
  await orderDialog.getByRole('textbox', { name: '销售数量' }).fill('12')
  await orderDialog.getByRole('textbox', { name: '备注' }).fill('不应保留的草稿')
  await orderDialog.getByRole('button', { name: '取消' }).click()
  await page.getByRole('button', { name: '新建销售订单' }).click()
  await expect(orderDialog.getByRole('textbox', { name: '销售数量' })).toHaveValue('')
  await expect(orderDialog.getByRole('textbox', { name: '备注' })).toHaveValue('')
  await orderDialog.getByRole('button', { name: '取消' }).click()

  const tabs = page.getByRole('navigation', { name: '销售视图' })
  for (const [tab, salesQuantity] of [
    ['销售价格', '1'],
    ['销售出库', '90'],
    ['销售退货', '2'],
    ['应收', '90'],
    ['客户退款', '2'],
  ]) {
    await tabs.getByRole('button', { name: tab }).click()
    await expect(page.getByRole('table')).toContainText('SKU-BOX · 收纳盒')
    await expect(page.getByRole('table')).toContainText(salesQuantity)
  }

  await tabs.getByRole('button', { name: '销售价格' }).click()
  await tabs.getByRole('button', { name: '销售订单' }).click()
  const orderHeader = page.locator('thead tr th').nth(1)
  const orderCell = page.locator('tbody tr').first().locator('td').nth(1)
  await expect(orderHeader).toHaveText('销售单号')
  await expect(orderCell).toHaveText('SO-20260716-001')

  await tabs.getByRole('button', { name: '销售出库' }).click()
  await page.getByRole('button', { name: '销售出库 SI-20260716-001' }).click()
  await expect(page.getByRole('heading', { name: '销售出库' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '本次销售数量（可留空）' })).toHaveValue('')
  await expect(page.getByText(/订单数量 90/)).toBeVisible()
})

import { expect, test } from '@playwright/test'

test('shows only OneDrive settings and starts device-code authorization', async ({ page }) => {
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
        data: { user: { id: 'admin-id', username: 'admin' }, accessToken: 'test-access-token' },
      }),
    }),
  )
  await page.route('**/api/v1/onedrive/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          code: 'NOT_CONNECTED',
          label: '未连接',
          configured: true,
          externalConfigurationStatus: 'CONFIGURED',
          mockProviderAvailable: true,
          authority: 'consumers',
          scopes: ['User.Read', 'Files.ReadWrite', 'offline_access'],
        },
      }),
    }),
  )
  await page.route('**/api/v1/onedrive/connect/start', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          userCode: 'ABCD-EFGH',
          verificationUri: 'https://microsoft.com/devicelogin',
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          message: 'Enter the code.',
        },
      }),
    }),
  )

  await page.goto('/files')

  await expect(page.locator('h1', { hasText: 'OneDrive 设置' })).toBeVisible()
  await expect(page.getByText('文件资产', { exact: false })).toHaveCount(0)
  await expect(page.getByText('商品图库', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '连接 OneDrive' }).click()
  await expect(page.getByText('ABCD-EFGH', { exact: true })).toBeVisible()
})

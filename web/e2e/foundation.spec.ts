import { expect, test } from '@playwright/test';

test('restores the session, keeps list search in the URL, and reactivates a buyer', async ({
  page,
}) => {
  let activationPayload: unknown;
  let productImageUploaded = false;
  let productPayload: unknown;
  let skuPayload: unknown;
  let skuRow: Record<string, unknown> | undefined;
  let buyerStatus = 'INACTIVE';

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
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: { status: 'operational', database: 'connected', checkedAt: '2026-07-16T00:00:00Z' },
      }),
    }),
  );
  await page.route('**/api/v1/master-data/categories*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            code: 'CAT-001',
            name: '家居收纳',
            status: 'ACTIVE',
            updatedAt: '2026-07-16T00:00:00Z',
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
  await page.route('**/api/v1/master-data/products*', (route) => {
    if (route.request().method() === 'POST') {
      productPayload = route.request().postDataJSON();
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: '66666666-6666-4666-8666-666666666666',
            ...(productPayload as Record<string, unknown>),
            status: 'ACTIVE',
          },
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            code: 'PROD-001',
            name: 'Test product',
            status: 'ACTIVE',
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
    });
  });
  await page.route(
    '**/api/v1/files/products/66666666-6666-4666-8666-666666666666/images',
    (route) => {
      if (route.request().method() === 'POST') productImageUploaded = true;
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            product: {
              id: '66666666-6666-4666-8666-666666666666',
              code: 'PROD-002',
              name: 'Image product',
            },
            images: [],
          },
        }),
      });
    },
  );
  await page.route('**/api/v1/master-data/units*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            code: 'PCS',
            name: 'Piece',
            status: 'ACTIVE',
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
  await page.route('**/api/v1/master-data/skus*', (route) => {
    if (route.request().method() === 'POST') {
      skuPayload = route.request().postDataJSON();
      skuRow = {
        id: '55555555-5555-4555-8555-555555555555',
        ...(skuPayload as Record<string, unknown>),
        status: 'ACTIVE',
        product: { id: '33333333-3333-4333-8333-333333333333', name: 'Test product' },
        baseUnit: { id: '44444444-4444-4444-8444-444444444444', name: 'Piece' },
      };
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: skuRow }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: skuRow ? [skuRow] : [],
        meta: {
          page: 1,
          pageSize: 20,
          total: skuRow ? 1 : 0,
          totalPages: skuRow ? 1 : 0,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      }),
    });
  });
  await page.route('**/api/v1/master-data/buyers**', (route) => {
    if (route.request().method() === 'PATCH') {
      activationPayload = route.request().postDataJSON();
      buyerStatus = 'ACTIVE';
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: '11111111-1111-4111-8111-111111111111',
            code: 'BUYER-001',
            name: '采购员 A',
            status: buyerStatus,
          },
        }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            code: 'BUYER-001',
            name: '采购员 A',
            phone: '13800000000',
            channels: [],
            status: buyerStatus,
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
    });
  });

  await page.goto('/master/categories');
  await expect(page.getByRole('heading', { name: '商品类目' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '家居收纳', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '关键字搜索' }).fill('家居');
  await expect(page).toHaveURL(/keyword=%E5%AE%B6%E5%B1%85/);
  const createdFrom = page.locator('.date-range-picker input').first();
  const createdTo = page.locator('.date-range-picker input').nth(1);
  await expect(createdFrom).toHaveAttribute('placeholder', '开始日期');
  await expect(createdTo).toHaveAttribute('placeholder', '结束日期');
  await createdFrom.fill('2026-07-16');
  await createdTo.fill('2026-07-21');
  await createdTo.press('Enter');
  await expect(page).toHaveURL(/createdFrom=2026-07-16T00%3A00%3A00.000Z/);
  await expect(page).toHaveURL(/createdTo=2026-07-21T00%3A00%3A00.000Z/);

  const productCenterLinks = page
    .locator('.nav-group')
    .filter({ has: page.locator('a[href="/master/categories"]') })
    .locator('a');
  await expect(productCenterLinks).toHaveCount(4);
  await expect(productCenterLinks.nth(0)).toHaveAttribute('href', '/master/categories');
  await expect(productCenterLinks.nth(1)).toHaveAttribute('href', '/master/products');
  await page.locator('a[href="/master/products"]').click();
  await expect(page.getByLabel('暂无产品图片')).toBeVisible();
  await page.getByRole('button', { name: '查看 Test product' }).click();
  await expect(page.locator('.expanded-row')).toContainText('商品名称');
  await expect(page.locator('.expanded-row')).toContainText('Test product');
  await page.getByRole('button', { name: '查看 Test product' }).click();
  await page.locator('button.button-primary').click();
  const productDialog = page.locator('.dialog-popup');
  await expect(productDialog.locator('input').first()).toBeEditable();
  await expect(productDialog.locator('[role="combobox"]')).toHaveCount(1);
  await productDialog.locator('input').nth(0).fill('PROD-002');
  await productDialog.locator('input').nth(1).fill('Image product');
  await productDialog.getByRole('combobox').click();
  await page.locator('.select-popup:visible .select-item').nth(1).click();
  await productDialog.locator('.product-image-editor input[type="file"]').setInputFiles({
    name: 'main.png',
    mimeType: 'image/png',
    buffer: Buffer.from('product-image'),
  });
  await expect(productDialog.getByText('已选择 1 张图片')).toBeVisible();
  await expect(productDialog.locator('.product-image-card.pending img')).toBeVisible();
  await productDialog.getByRole('button', { name: '预览 main.png', exact: true }).click();
  await expect(page.locator('.yarl__portal_open')).toBeVisible();
  await page.locator('.yarl__portal_open').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.yarl__portal_open')).toHaveCount(0);
  await productDialog.locator('button[type="submit"]').click();
  expect(productPayload).toMatchObject({ code: 'PROD-002', name: 'Image product' });
  await expect.poll(() => productImageUploaded).toBe(true);

  await page.goto('/master/skus');
  await page.locator('button.button-primary').click();
  const skuDialog = page.locator('.dialog-popup');
  await skuDialog.locator('input').nth(0).fill('SKU-001');
  await skuDialog.locator('input').nth(1).fill('Test SKU');
  await skuDialog.getByRole('combobox').nth(0).click();
  await page.locator('.select-popup:visible .select-item').nth(1).click();
  await skuDialog.getByRole('combobox').nth(1).click();
  await page.locator('.select-popup:visible .select-item').nth(1).click();
  const attributeName = skuDialog.getByLabel('属性名 1');
  await attributeName.pressSequentially('颜色');
  await expect(attributeName).toBeFocused();
  await expect(attributeName).toHaveValue('颜色');
  await skuDialog.getByLabel('属性值 1').fill('黑色');
  await skuDialog.getByRole('button', { name: '添加属性' }).click();
  await expect(skuDialog.locator('.attribute-editor-row')).toHaveCount(2);
  await skuDialog.locator('button[type="submit"]').click();
  expect(skuPayload).toMatchObject({ attributes: { 颜色: '黑色' }, weight: null });
  await expect(page.getByRole('cell', { name: 'Test SKU', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看 Test SKU' }).click();
  await expect(page.locator('.expanded-row')).toContainText('颜色：黑色');
  await page.getByRole('button', { name: '编辑 Test SKU' }).click();
  await expect(skuDialog.getByLabel('属性名 1')).toHaveValue('颜色');
  await expect(skuDialog.getByLabel('属性值 1')).toHaveValue('黑色');
  await skuDialog.getByRole('button', { name: '关闭' }).click();

  await page.goto('/master/buyers');
  await page.getByRole('button', { name: '启用 采购员 A' }).click();
  await page.getByRole('button', { name: '确认启用' }).click();
  await expect(page.getByText('资料已启用')).toBeVisible();
  await expect(page.getByRole('button', { name: '停用 采购员 A' })).toBeVisible();
  expect(activationPayload).toEqual({ status: 'ACTIVE' });

  await page.getByText('管理员', { exact: true }).click();
  await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible();
  await page.getByRole('heading', { name: '采购员' }).click();
  await expect(page.getByRole('button', { name: '退出登录' })).toBeHidden();

  await page.getByText('管理员', { exact: true }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await expect(page.getByLabel('用户名')).toHaveValue('admin');
  await expect(page.getByLabel('密码')).toHaveValue('StrongPassword!2026');
});

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/config', (route) => route.fulfill({ json: {
    mode: 'development', devLoginEnabled: true, oidcEnabled: false, demoMode: true,
  } }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: {
    authenticated: true, context: { userName: '演示管理员', roleIds: ['platform-admin'] },
  } }));
  await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'ok' } }));
});

test('管理员从员工入口可以一步打开知识上传', async ({ page }) => {
  await page.route('**/api/knowledge/documents', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('link', { name: '管理后台' }).click();
  await expect(page.getByRole('heading', { name: '管理工作台' })).toBeVisible();
  await page.getByRole('link', { name: /上传知识/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/knowledge\?upload=1$/);
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('admin-knowledge-upload')).toBeVisible();
});

test('连接器只填两项即可创建只读草稿', async ({ page }) => {
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: route.request().method() === 'POST' ? { id: 'draft' } : [] });
  });
  await page.goto('/admin/');
  await page.getByRole('link', { name: /接入业务系统/ }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('认证方式')).not.toBeVisible();
  await form.getByLabel('系统名称').fill('工单查询');
  await form.getByLabel('查询接口地址').fill('https://tickets.example.com/api/query?limit=10');
  const request = page.waitForRequest((item) => item.method() === 'POST' && item.url().endsWith('/api/connectors'));
  await form.getByRole('button', { name: '创建草稿' }).click();
  expect((await request).postDataJSON()).toMatchObject({
    displayName: '工单查询',
    baseUrl: 'https://tickets.example.com',
    status: 'draft',
    authMode: 'none',
    capabilities: [{ name: 'query', actionKind: 'read' }],
    metadata: { transport: 'http', operations: { query: { path: '/api/query?limit=10', method: 'GET' } } },
  });
  await expect(form).toHaveCount(0);
});

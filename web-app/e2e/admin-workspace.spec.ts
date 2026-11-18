import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/config', (route) => route.fulfill({ json: {
    mode: 'development', devLoginEnabled: true, oidcEnabled: false, demoMode: true,
  } }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: {
    authenticated: true, context: { userName: '演示管理员', roleIds: ['platform-admin'] },
  } }));
});

test('管理员从员工入口可以一步打开知识上传', async ({ page }) => {
  await page.route('**/api/knowledge/documents', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('link', { name: '管理后台' }).click();
  await expect(page.getByRole('heading', { name: '管理工作台' })).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/admin/brand/logo.svg');
  await expect.poll(() => page.locator('.brand-logo').evaluate((logo) => (logo as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('link', { name: /上传知识/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/knowledge\?upload=1$/);
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('admin-knowledge-upload')).toBeVisible();
});

test('手机端管理导航可展开并返回员工对话', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/admin/');
  const navigation = page.getByRole('navigation', { name: '管理导航' });
  await expect(navigation).toBeHidden();
  await page.getByRole('button', { name: '打开导航' }).click();
  await expect(navigation.getByRole('link', { name: '知识库' })).toBeVisible();
  await page.getByRole('link', { name: '员工对话' }).click();
  await expect(page.getByRole('heading', { name: '今天想查什么？' })).toBeVisible();
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

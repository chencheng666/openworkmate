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
  await page.getByRole('region',{name:'常用操作'}).getByRole('link', { name: /上传知识/ }).click();
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
  await expect(form.getByLabel('认证方式')).toHaveValue('none');
  await expect(form.getByLabel('连接器标识')).not.toBeVisible();
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

test('任一配置页可直接打开上传或接入表单，取消不写入',async({page})=>{
  const writes:string[]=[];
  page.on('request',r=>{if(['PUT','PATCH','POST','DELETE'].includes(r.method())) writes.push(r.url());});
  await page.route('**/api/knowledge/documents',r=>r.fulfill({json:[]}));
  await page.route('**/api/connectors',r=>r.fulfill({json:[]}));
  await page.goto('/admin/audit');
  const nav=page.getByRole('navigation',{name:'管理导航'});
  await nav.getByRole('link',{name:'直接上传知识'}).click();
  await expect(page.getByRole('dialog',{name:'上传企业知识'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await nav.getByRole('link',{name:'直接新建连接器'}).click();
  const form=page.getByRole('dialog',{name:'新建系统连接器'});
  await form.getByLabel('认证方式').selectOption('jwt');
  await expect(form.getByLabel(/凭证环境变量名/)).toBeVisible();
  await expect(form.getByLabel('请求方法')).toBeHidden();
  await form.getByRole('button',{name:'取消'}).click();
  await expect(nav.getByRole('link',{name:'系统接入',exact:true})).toHaveAttribute('aria-current','page');
  expect(writes).toEqual([]);
});

test('外观草稿可撤销且不改在线配置，非平台管理员不显示外观入口',async({page})=>{
  let writes=0;
  await page.route('**/api/branding',r=>{if(r.request().method()==='PUT')writes++;return r.fulfill({json:{name:'测试工作台',logo:'',theme:'jade'}});});
  await page.goto('/admin/branding');
  await page.getByLabel('工作台名称').fill('临时草稿');
  await page.getByRole('button',{name:'撤销修改'}).click();
  await expect(page.getByLabel('工作台名称')).toHaveValue('测试工作台');
  await expect(page.getByRole('button',{name:'保存外观'})).toBeDisabled();
  expect(writes).toBe(0);
  await page.route('**/api/auth/me',r=>r.fulfill({json:{authenticated:true,context:{roleIds:['business-owner']}}}));
  await page.reload();
  await expect(page.getByRole('heading',{name:'管理工作台'})).toBeVisible();
  await expect(page.getByRole('link',{name:'企业外观'})).toHaveCount(0);
});

test('企业外观先预览再保存，重新进入员工端后共用品牌', async ({ page }) => {
  let brand = { name: 'OpenWorkMate', logo: '', theme: 'ocean' };
  await page.route('**/api/branding', async route => {
    if (route.request().method() === 'PUT') brand = route.request().postDataJSON();
    await route.fulfill({ json: brand });
  });
  await page.goto('/admin/branding');
  await page.getByLabel('工作台名称').fill('星海工作台');
  await page.getByLabel('星云紫').check();
  await expect(page.getByLabel('员工端外观预览')).toContainText('星海工作台');
  await expect(page.locator('.brand-row strong')).toHaveText('OpenWorkMate');
  await page.getByRole('button', { name: '保存外观' }).click();
  await expect(page.locator('.brand-row strong')).toHaveText('星海工作台');
  await page.getByRole('link', { name: '员工对话' }).click();
  await expect(page).toHaveTitle('星海工作台');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'violet');
});

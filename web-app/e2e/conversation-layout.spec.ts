import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/config', (route) => route.fulfill({
    json: { devLoginEnabled: true, oidcEnabled: false, demoMode: true },
  }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('开源品牌可见，Logo 可加载', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.brand-block strong')).toHaveText('OpenWorkMate');
  const logo = page.locator('.brand-block img');
  await expect(logo).toHaveAttribute('src', '/brand/logo.svg');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/logo.svg');
  await expect.poll(() => logo.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('手机端对话列表按需展开，输入区保持可见', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: '打开对话列表' });
  await expect(page.getByRole('complementary', { name: '对话列表' })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: '收起对话列表' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.getByRole('button', { name: '新建对话' }).click();
  await expect(page.getByRole('complementary', { name: '对话列表' })).toBeHidden();
  await expect(page.getByRole('textbox', { name: '输入问题' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('长回答在消息区滚动，输入框保持可见并展示依据类型', async ({ page }) => {
  // 消息增长不应挤走导航底部入口和输入框。
  await page.route('**/api/web-chat', async (route) => {
    const paragraphs = Array.from({ length: 16 }, (_, index) => `第 ${index + 1} 项处置说明：请记录催办节点、责任人和处理计划。`).join('\n');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        answer: `制度原文：普通工单应在 **24 小时内首次响应**。\n\n基于制度的推断：当前工单需要立即催办。\n\n知识库未规定：未规定固定扣罚金额。\n\n${paragraphs}`,
        citations: [{ title: '企业园区报修工单管理制度（试行）', category: '制度文件' }],
      }),
    });
  });

    await page.goto('/');
    await page.getByPlaceholder('描述你要处理的企业业务…').fill('园区报修超过 24 小时未响应怎么办？');
    await page.getByTitle('发送').click();

    await expect(page.getByText('制度原文', { exact: true })).toBeVisible();
    await expect(page.getByText('基于制度的推断', { exact: true })).toBeVisible();
    await expect(page.getByText('知识库未规定', { exact: true })).toBeVisible();
    await expect(page.locator('.message-bubble strong')).toHaveText('24 小时内首次响应');

    const layout = await page.evaluate(() => {
      const conversation = document.querySelector<HTMLElement>('[data-testid="web-conversation"]');
      const composer = document.querySelector<HTMLElement>('[data-testid="web-composer"]');
      if (!conversation || !composer) throw new Error('未找到对话布局元素');
      const composerBox = composer.getBoundingClientRect();
      return {
        bodyScrollable: document.documentElement.scrollHeight > window.innerHeight,
        conversationScrollable: conversation.scrollHeight > conversation.clientHeight,
        composerVisible: composerBox.top >= 0 && composerBox.bottom <= window.innerHeight,
      };
    });

    expect(layout).toEqual({ bodyScrollable: false, conversationScrollable: true, composerVisible: true });
  await expect(page.getByRole('navigation',{name:'工作区入口'}).getByRole('button',{name:'文件结果'})).toBeInViewport();
});

test('长会话标题不撑宽侧栏，手机可从导航打开文件并返回对话',async({page})=>{
  await page.route('**/api/web-chat',r=>r.fulfill({json:{answer:'收到'}}));
  await page.route('**/api/results',r=>r.fulfill({json:[]}));
  await page.goto('/');
  const title='跨部门审批和项目进度汇总'.repeat(4);
  await page.getByLabel('输入问题').fill(title);
  await page.getByTitle('发送').click();
  await expect(page.getByText('收到',{exact:true})).toBeVisible();
  const active=page.locator('.session-item[aria-current=true]');
  await expect(active).toHaveAttribute('title',await page.locator('.current-topic').innerText());
  expect(await active.locator('span').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await page.setViewportSize({width:390,height:780});
  await page.getByLabel('打开对话列表').click();
  await page.getByRole('navigation',{name:'工作区入口'}).getByRole('button',{name:'文件结果'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('complementary',{name:'对话列表'})).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('输入问题')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test('回答中的媒体需点开，表格和原文可下载', async ({ page }) => {
  await page.route('**/api/web-chat', route => route.fulfill({ json: {
    answer: '| 项目 | 数值 |\n| --- | --- |\n| 工单 | 12 |\n| 审批 | 8 |\n\n![示意图](/brand/logo.svg)\n\n[流程视频](/example.webm)',
  } }));
  await page.goto('/');
  await page.getByRole('textbox', { name: '输入问题' }).fill('出一份演示表格');
  await page.getByTitle('发送').click();
  await expect(page.getByRole('cell', { name: '12' })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /播放视频/ })).toBeVisible();
  await page.getByRole('button', { name: /预览图片/ }).click();
  await expect.poll(() => page.getByAltText('示意图').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '生成柱状图' }).click();
  await expect(page.getByRole('img', { name: '表格数据柱状图' })).toBeVisible();
  for (const [action, extension] of [['下载 CSV 表格', '.csv'], ['下载 Markdown', '.md'], ['下载 SVG 图表', '.svg']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: action }).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(extension + '$'));
  }
});

test('开发环境可以通过登录入口建立 Bearer 会话', async ({ page }) => {
  await page.route('**/api/auth/dev-login', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, token: 'demo-signed-token', expiresIn: 28800 }),
    });
  });

  await page.goto('/');
  await expect(page.getByText('演示模式 · 回答来自示例知识库的检索结果')).toBeVisible();
  await page.getByTitle('登录与身份设置').click();
  const inputs = page.locator('.auth-card input');
  await inputs.nth(0).fill('user-10086');
  await inputs.nth(1).fill('张三');
  await page.locator('.auth-card').getByRole('button', { name: '登录', exact: true }).click();

  await expect(page.getByRole('button', { name: /张三/ })).toBeVisible();
  await expect(page.getByText('已通过登录身份校验')).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem('workmate-access-token'))).resolves.toBe('demo-signed-token');
});

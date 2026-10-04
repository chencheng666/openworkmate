import { expect, test } from '@playwright/test';

test('开源品牌可见，Logo 可加载', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.brand-block strong')).toHaveText('OpenWorkMate');
  const logo = page.locator('.brand-block img');
  await expect(logo).toHaveAttribute('src', '/brand/logo.svg');
  await expect.poll(() => logo.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('长回答在消息区滚动，输入框保持可见并展示依据类型', async ({ page }) => {
  await page.route('**/api/web-chat', async (route) => {
    const paragraphs = Array.from({ length: 16 }, (_, index) => `第 ${index + 1} 项处置说明：请记录催办节点、责任人和处理计划。`).join('\n');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        answer: `制度原文：普通工单应在 **24 小时内首次响应**。\n\n基于制度的推断：当前工单需要立即催办。\n\n知识库未规定：未规定固定扣罚金额。\n\n${paragraphs}`,
        citations: [{ title: '企业园区报修工单管理制度（试行）', category: '制度文件' }],
      }),
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
  });
});

test('开发环境可以通过登录入口建立 Bearer 会话', async ({ page }) => {
  await page.route('**/api/auth/dev-login', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, token: 'demo-signed-token', expiresIn: 28800 }),
    });
  });

  await page.goto('/');
  await page.getByTitle('登录与身份设置').click();
  const inputs = page.locator('.auth-card input');
  await inputs.nth(0).fill('user-10086');
  await inputs.nth(1).fill('张三');
  await page.getByRole('button', { name: '登录' }).click();

  await expect(page.getByRole('button', { name: /张三/ })).toBeVisible();
  await expect(page.getByText('已通过登录身份校验')).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem('workmate-access-token'))).resolves.toBe('demo-signed-token');
});

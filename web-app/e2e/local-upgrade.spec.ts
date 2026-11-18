import { expect, test } from '@playwright/test';
test('升级需求留在本地，不发给聊天模型',async({page})=>{
  let calls=0;await page.route('**/api/web-chat',r=>{calls++;return r.abort();});
  await page.goto('/');await page.getByLabel('输入问题').fill('/升级 文件结果支持 XLSX');await page.getByLabel('发送',{exact:true}).click();
  await expect(page.getByRole('link',{name:'在本地升级对话中确认需求'})).toHaveAttribute('href',/^http:\/\/127\.0\.0\.1:18794\/#request=/);
  expect(calls).toBe(0);
});

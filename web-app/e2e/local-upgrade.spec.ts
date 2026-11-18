import { expect, test } from '@playwright/test';
test('升级需求留在本地，不发给聊天模型',async({page})=>{
  let calls=0;await page.route('**/api/web-chat',r=>{calls++;return r.abort();});
  await page.goto('/');await page.getByLabel('输入问题').fill('/升级 文件结果支持 XLSX');await page.getByLabel('发送',{exact:true}).click();
  await expect(page.getByRole('link',{name:'在本地升级对话中确认需求'})).toHaveAttribute('href',/^http:\/\/127\.0\.0\.1:18794\/#request=/);
  expect(calls).toBe(0);
});

test('维护者本机的升级指令直接提交任务，不带业务身份或历史',async({page,baseURL})=>{
  const local='http://127.0.0.1:18790';
  // 复用正在验收的员工端静态资源，所有升级请求都由测试截获。
  await page.route(local+'/**',async r=>{
    const url=new URL(r.request().url()),target=new URL(url.pathname+url.search,baseURL);
    return r.fulfill({response:await r.fetch({url:target.href})});
  });
  let body;
  await page.route('http://127.0.0.1:18794/jobs',async r=>{
    body=r.request().postDataJSON();
    await r.fulfill({headers:{'Access-Control-Allow-Origin':local},json:{id:'abcdef123456'}});
  });
  await page.goto(local);await page.getByLabel('输入问题').fill('/升级 统计每行字数');await page.getByLabel('发送',{exact:true}).click();
  await expect(page.getByRole('link',{name:'查看生成进度、代码差异和候选预览'})).toHaveAttribute('href',/job-abcdef123456$/);
  expect(body).toEqual({request:'统计每行字数'});
});

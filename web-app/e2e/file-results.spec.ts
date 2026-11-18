import { expect, test } from '@playwright/test';
test('文件结果生成、状态更新、预览和下载',async({page})=>{
  let posted=false, reads=0;
  const job={id:'demo-id',filename:'交付.md',format:'md',size:12};
  await page.route('**/api/results',async r=>{
    if(r.request().method()==='POST'){posted=true; expect(r.request().postDataJSON()).toMatchObject({format:'md',title:'交付'});return r.fulfill({status:202,json:{...job,status:'queued'}});}
    return r.fulfill({json:posted?[{...job,status:++reads===1?'running':'ready'}]:[]});
  });
  await page.route('**/api/results/demo-id/file',r=>r.fulfill({contentType:'text/markdown',body:'# 验收报告'}));
  await page.goto('/');await page.getByRole('button',{name:'文件结果',exact:true}).click();
  const d=page.getByRole('dialog');await d.getByLabel('文件名称').fill('交付');await d.getByLabel('正文').fill('# 验收报告');
  await d.getByRole('button',{name:'生成文件'}).click();
  await expect(d.getByText('生成中',{exact:true})).toBeVisible();
  await d.getByRole('button',{name:'预览',exact:true}).click();
  await expect(d.getByRole('heading',{name:'验收报告'})).toBeVisible();
  const download=page.waitForEvent('download');await d.getByRole('button',{name:'下载',exact:true}).click();
  expect((await download).suggestedFilename()).toBe('交付.md');
  await page.keyboard.press('Escape');await expect(d).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

test('聊天自动显示图片，私有文件失败可重试、放大及保存',async({page})=>{
  const id='a'.repeat(24);
  await page.route('**/api/web-chat',r=>r.fulfill({json:{answer:'已生成插画',media:[{kind:'illustration',resultId:id,title:'灯塔'}]}}));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VYQAAAAASUVORK5CYII=','base64');
  let requests=0;
  await page.route('**/api/results/'+id+'/file',r=>++requests===1?r.fulfill({status:404}):r.fulfill({contentType:'image/png',body:png}));
  await page.goto('/');await page.getByRole('button',{name:'通用问答',exact:true}).click();
  await page.getByRole('button',{name:/画插画/}).click();
  await expect(page.getByText('文件已过期或当前账号无权查看。',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'重新加载'}).click();
  const zoom=page.getByRole('button',{name:'放大图片：灯塔'}); await expect(zoom).toBeEnabled();
  await zoom.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(zoom).toBeFocused();
  const down=page.waitForEvent('download');await page.getByRole('button',{name:'保存 PNG'}).click();expect((await down).suggestedFilename()).toBe('灯塔.png');
});

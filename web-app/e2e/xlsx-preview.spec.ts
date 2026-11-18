import {expect,test} from '@playwright/test';
test('Excel 文件结果展示工作表而非二进制内容',async({page})=>{
  await page.route('**/api/results',r=>r.fulfill({json:[{id:'sample',format:'xlsx',filename:'工单.xlsx',status:'ready',size:7000}]}));
  await page.route('**/api/results/sample/preview',r=>r.fulfill({json:{rows:[['编号'],['000123']]}}));
  await page.goto('/');await page.getByRole('button',{name:'文件结果',exact:true}).click();
  await page.getByRole('dialog').getByRole('combobox').selectOption('xlsx');
  await page.getByRole('button',{name:'预览',exact:true}).click();
  await expect(page.getByRole('cell',{name:'000123'})).toBeVisible();
});
test('在隔离数据库生成、预览并下载实际工作簿',async({page},info)=>{
  test.skip(!process.env.WORKMATE_PREVIEW_URL,'只在候选工作台写入合成样例');
  await page.goto('/');await page.getByRole('button',{name:'文件结果',exact:true}).click();
  const d=page.getByRole('dialog'),name='工单导出验收-'+Date.now();
  await d.getByLabel('文件名称').fill(name);await d.getByRole('combobox').selectOption('xlsx');
  await d.getByLabel('正文').fill('| 工单编号 | 备注 |\n| --- | --- |\n| 00001234567890123456 | =1+1 |');
  await d.getByRole('button',{name:'生成文件'}).click();
  const item=d.getByRole('listitem').filter({hasText:name});
  await item.getByRole('button',{name:'预览'}).click();await expect(d.getByRole('cell',{name:'00001234567890123456'})).toBeVisible();
  const wait=page.waitForEvent('download');await item.getByRole('button',{name:'下载'}).click();const file=await wait;
  expect(file.suggestedFilename()).toBe(name+'.xlsx');await file.saveAs(info.outputPath('工单交付验收.xlsx'));
});

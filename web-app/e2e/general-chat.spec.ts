import {test,expect} from '@playwright/test';
test('切换通用问答不夹带企业历史，可连续追问，旧对话仍能打开',async({page})=>{
  const seen:{mode:string;sessionId:string;history:{content:string}[]}[]=[];
  await page.route('**/api/web-chat',r=>{const body=r.request().postDataJSON();seen.push(body);return r.fulfill({json:{answer:body.mode==='general'?'通用回答':'示例制度答复',citations:[]}});});
  await page.goto('/');const group=page.getByRole('group',{name:'问答模式'}), general=group.getByRole('button',{name:'通用问答'});
  const ask=async(v:string)=>{await page.getByLabel('输入问题').fill(v);await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.getByLabel('输入问题')).toBeEnabled();};
  await expect(group.getByRole('button',{name:'企业问答'})).toHaveAttribute('aria-pressed','true');
  await ask('查看内部制度示例');await general.click();await expect(page.getByText('示例制度答复')).toHaveCount(0);
  await ask('为什么会有月相？');await ask('用一句话再说一遍');
  expect(seen.map(s=>s.mode)).toEqual(['enterprise','general','general']);
  expect(seen[1].history).toEqual([]);expect(seen[1].sessionId).not.toBe(seen[0].sessionId);
  expect(seen[2].history.map(m=>m.content)).toEqual(['为什么会有月相？','通用回答']);
  await page.getByRole('button',{name:'查看内部制度示例'}).click();
  await expect(group.getByRole('button',{name:'企业问答'})).toHaveAttribute('aria-pressed','true');await expect(page.getByText('示例制度答复')).toBeVisible();
});

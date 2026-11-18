import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test,expect} from '@playwright/test';
import type {Feature} from '../src/features/catalog';
const dir=fileURLToPath(new URL('../src/features/generated/',import.meta.url));
for(const file of readdirSync(dir).filter(f=>/^[0-9a-f]{12}\.json$/.test(f))){
  const spec:Feature=JSON.parse(readFileSync(join(dir,file),'utf8'));
  test('真实页面运行模型工具：'+file,async({page})=>{
    await page.goto('/');await page.getByRole('button',{name:'工作台工具',exact:true}).click();
    const d=page.getByRole('dialog');await d.getByRole('combobox').selectOption(file.slice(0,12));
    for(const c of spec.cases){
      for(const f of spec.fields)await d.getByLabel(f.label,{exact:true}).fill(c.values[f.id]||'');
      await d.getByRole('button',{name:spec.actions.find(a=>a.id===c.action)!.label,exact:true}).click();
      await expect.poll(async()=>await d.getByTestId('feature-result').textContent({timeout:6000})).toBe(c.expect);
    }
  });
}

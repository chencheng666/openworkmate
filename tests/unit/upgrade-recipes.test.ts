import { expect, test } from 'vitest';
import { plan } from '../../scripts/upgrade/recipes.mjs';
test('区分已实现的需求和未授权命令',()=>{
  expect(plan('/升级 文件结果支持 XLSX').kind).toBe('xlsx');
  expect(plan('把文案「工作助手」改成「企业助手」').kind).toBe('wording');
  for(const text of ['文件结果支持 XLSX; echo 1','删除项目','把文案「工作助手」改成「{alert(1)}」']) expect(()=>plan(text)).toThrow();
});

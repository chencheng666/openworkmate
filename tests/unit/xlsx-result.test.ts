import { expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { renderFile } from '../../backend/src/modules/results/render';
const { Workbook } = createRequire(new URL('../../backend/package.json',import.meta.url))('exceljs');
test('工作簿可重新打开，中文、长编号和公式样文本无损', async () => {
  const bytes = await renderFile('xlsx','交付','| 编号 | 备注 |\n| --- | --- |\n| 001234567890123456 | =1+1 |');
  const book = new Workbook(); await book.xlsx.load(bytes);
  expect(book.worksheets[0].getSheetValues().slice(1).map((r:string[])=>r.slice(1))).toEqual([['编号','备注'],['001234567890123456','=1+1']]);
});

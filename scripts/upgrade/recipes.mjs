import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// 需求只选择受审阅的变换，不解释为路径、Git 参数或 shell 命令。
export function plan(request) {
  const text = request.trim().replace(/^(?:\/升级|升级[：:])\s*/, '');
  if (/^(?:请|请让|让)?\s*(?:文件结果|文件导出|导出文件)\s*(?:增加|新增|添加|支持)\s*(?:导出\s*)?(?:xlsx|excel)(?:\s*格式)?[。！!]?$/i.test(text))
    return { kind: 'xlsx', title: '文件结果支持 XLSX' };
  const wording = text.match(/^把(?:员工端)?文案「([^「」<>\r\n]{1,40})」改成「([\p{L}\p{N} ，。！？、·-]{1,40})」$/u);
  if (wording && wording[1] !== wording[2]) return { kind: 'wording', title: text, before: wording[1], after: wording[2] };
  throw Error('此本地版支持「文件结果支持 XLSX」和「把文案「旧文案」改成「新文案」」。其他需求尚无安全执行器，没有创建分支。');
}
async function change(dir, file, pairs) {
  const path = join(dir, file);
  let text = await readFile(path, 'utf8');
  for (const [before, after] of pairs) {
    if (text.split(before).length !== 2) throw Error(file + '：未唯一匹配当前源码，请复核升级方案。');
    text = text.replace(before, () => after);
  }
  await writeFile(path, text);
}
export async function implement(dir, spec) {
  if (spec.kind === 'wording') {
    if (/[{}&]/.test(spec.before)) throw Error('仅支持纯文本节点。');
    return change(dir, 'web-app/src/App.tsx', [['>'+spec.before+'<', '>'+spec.after+'<']]);
  }
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  await change(dir,'backend/src/modules/results/render.ts',[
    ["export const formats = { md:", "import { Workbook } from 'exceljs';\n\nexport const formats = { xlsx: '"+mime+"', md:"],
    ["  if (kind === 'md')", `  if (kind === 'xlsx') {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('文件结果', { views: [{ state: 'frozen', ySplit: 1 }] });
    // 所有输入按文本写入，避免编号丢零、长号失真或用户文本被当成公式。
    sheet.addRows(tableRows(text));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach(column => { column.width = 24; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  if (kind === 'md')`],
  ]);
  await change(dir,'backend/src/modules/results/results.module.ts',[
    ["  @Get(':id/file')", `  @Get(':id/preview') @Header('Cache-Control','private, no-store')
  async preview(@Headers() headers: H, @Param('id') id:string) {
    const scope = owner(contextFromHeaders(headers));
    if (!isObjectIdOrHexString(id)) throw new NotFoundException();
    const job = await this.queue.jobs.findOne({ ...scope, _id:id, format:'xlsx' }).select('+bytes');
    if (!job) throw new NotFoundException();
    if (job.status !== 'ready' || !job.bytes) throw new ConflictException('文件尚未就绪。');
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    await workbook.xlsx.load(job.bytes as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    return { rows: Array.from({length: Math.min(sheet.rowCount,100)}, (_,i) =>
      Array.from({length: Math.min(sheet.columnCount,30)}, (_,j) => sheet.getCell(i+1,j+1).text)) };
  }
  @Get(':id/file')`],
  ]);
  await change(dir,'web-app/src/FileResults.tsx',[
    ["const kinds = { md:", "const kinds = { xlsx:'Excel 工作簿（XLSX）', md:"],
    ['      const b=await', `      if(active.format==='xlsx'){
        const {rows}=await(await api('/'+active.id+'/preview',{signal:ac.signal})).json();
        if(!ac.signal.aborted) setPreview({id:active.id,url:'',text:JSON.stringify(rows)});
        return;
      }
      const b=await`],
    ["kind==='csv'?'优先", "kind==='xlsx'?'导出真正的 Excel 工作簿，保留编号原文。预览显示前 100 行、30 列。':kind==='csv'?'优先"],
    ['{csvRows(preview.text).map', "{(active.format==='xlsx'?JSON.parse(preview.text) as string[][]:csvRows(preview.text)).map"],
  ]);
  await change(dir,'desktop/src/main.rs', [['"md" | "csv"', '"md" | "xlsx" | "csv"']]);
  for (const file of ['README.md','README.zh-CN.md','README.ja-JP.md'])
    await change(dir,file,[['<!-- upgrade:formats -->','<!-- upgrade:formats -->\n\n'+(file.includes('ja-JP')?'ファイル結果は Excel（XLSX）の生成・プレビュー・ダウンロードにも対応しています。':'文件结果支持生成、在线预览及下载 Excel（XLSX）；编号和公式样文本按原文导出。')]]);
  await writeFile(join(dir,'tests/unit/xlsx-result.test.ts'), `import { expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { renderFile } from '../../backend/src/modules/results/render';
const { Workbook } = createRequire(new URL('../../backend/package.json',import.meta.url))('exceljs');
test('工作簿可重新打开，中文、长编号和公式样文本无损', async () => {
  const bytes = await renderFile('xlsx','交付','| 编号 | 备注 |\\n| --- | --- |\\n| 001234567890123456 | =1+1 |');
  const book = new Workbook(); await book.xlsx.load(bytes);
  expect(book.worksheets[0].getSheetValues().slice(1).map((r:string[])=>r.slice(1))).toEqual([['编号','备注'],['001234567890123456','=1+1']]);
});
`);
}

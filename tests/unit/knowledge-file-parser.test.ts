import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  KnowledgeFileParseError,
  KnowledgeFileParser,
} from '../../backend/src/modules/knowledge/knowledge-file-parser';

describe('KnowledgeFileParser', () => {
  const parser = new KnowledgeFileParser();

  it('解析 Markdown 文本并保留中文业务内容', async () => {
    const result = await parser.parse({
      filename: '园区报修规范.md',
      mimeType: 'text/markdown',
      fileBase64: Buffer.from('# 报修规则\n\n超过 24 小时自动升级。').toString('base64'),
    });

    expect(result.parserName).toBe('plain-text');
    expect(result.text).toContain('超过 24 小时自动升级');
  });

  it('解析 XLSX 工作表为可检索文本', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('园区台账');
    sheet.addRow(['园区', '状态', '负责人']);
    sheet.addRow(['北京企业 U 谷', '运营中', '张经理']);
    const data = await workbook.xlsx.writeBuffer();

    const result = await parser.parse({
      filename: '园区台账.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileBase64: Buffer.from(new Uint8Array(data as ArrayBuffer)).toString('base64'),
    });

    expect(result.parserName).toBe('exceljs');
    expect(result.metadata.sheets).toBe(1);
    expect(result.text).toContain('北京企业 U 谷');
    expect(result.text).toContain('张经理');
  });

  it('拒绝不支持的文件类型', async () => {
    await expect(parser.parse({
      filename: '园区照片.png',
      mimeType: 'image/png',
      fileBase64: Buffer.from('not-an-image').toString('base64'),
    })).rejects.toThrow(KnowledgeFileParseError);
  });

  it('拒绝扩展名伪装的 PDF', async () => {
    await expect(parser.parse({
      filename: '伪造制度.pdf',
      mimeType: 'application/pdf',
      fileBase64: Buffer.from('这不是 PDF').toString('base64'),
    })).rejects.toThrow('文件内容不是有效的 PDF');
  });
});

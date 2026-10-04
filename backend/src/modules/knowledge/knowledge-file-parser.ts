import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as mammoth from 'mammoth';
import { extname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import { normalizeKnowledgeText } from './knowledge-text';

export const MAX_KNOWLEDGE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 2_000_000;

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.log']);
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, '.pdf', '.docx', '.xlsx']);

export class KnowledgeFileParseError extends Error {}

export type KnowledgeFileParseResult = {
  text: string;
  parserName: 'plain-text' | 'pdf-parse' | 'mammoth' | 'exceljs';
  metadata: {
    extension: string;
    pages?: number;
    sheets?: number;
    warnings?: string[];
  };
};

@Injectable()
export class KnowledgeFileParser {
  async parse(input: { filename: string; mimeType?: string; fileBase64: string }): Promise<KnowledgeFileParseResult> {
    const buffer = this.prepareUpload(input);
    return this.parseBuffer({ filename: input.filename, mimeType: input.mimeType, buffer });
  }

  prepareUpload(input: { filename: string; fileBase64: string }): Buffer {
    const extension = extname(input.filename).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new KnowledgeFileParseError(`暂不支持 ${extension || '未知'} 格式，请上传 PDF、DOCX、XLSX、CSV、Markdown 或文本文件。`);
    }

    const buffer = this.decodeBase64(input.fileBase64);
    if (buffer.length === 0) throw new KnowledgeFileParseError('上传文件为空。');
    if (buffer.length > MAX_KNOWLEDGE_FILE_BYTES) {
      throw new KnowledgeFileParseError(`单个知识文件不能超过 ${MAX_KNOWLEDGE_FILE_BYTES / 1024 / 1024} MB。`);
    }
    return buffer;
  }

  async parseBuffer(input: { filename: string; mimeType?: string; buffer: Buffer }): Promise<KnowledgeFileParseResult> {
    const extension = extname(input.filename).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new KnowledgeFileParseError(`暂不支持 ${extension || '未知'} 格式，请上传 PDF、DOCX、XLSX、CSV、Markdown 或文本文件。`);
    }
    const { buffer } = input;
    if (TEXT_EXTENSIONS.has(extension)) return this.parsePlainText(buffer, extension);
    if (extension === '.pdf') return this.parsePdf(buffer, extension);
    if (extension === '.docx') return this.parseDocx(buffer, extension);
    return this.parseWorkbook(buffer, extension);
  }

  private decodeBase64(value: string): Buffer {
    const compact = value.replace(/\s/g, '');
    if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
      throw new KnowledgeFileParseError('文件编码无效，请重新选择文件。');
    }
    return Buffer.from(compact, 'base64');
  }

  private parsePlainText(buffer: Buffer, extension: string): KnowledgeFileParseResult {
    if (buffer.includes(0)) throw new KnowledgeFileParseError('文本文件包含二进制内容，无法安全解析。');
    return {
      text: this.normalizeAndLimit(buffer.toString('utf8')),
      parserName: 'plain-text',
      metadata: { extension },
    };
  }

  private async parsePdf(buffer: Buffer, extension: string): Promise<KnowledgeFileParseResult> {
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new KnowledgeFileParseError('文件内容不是有效的 PDF。');
    }
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return {
        text: this.normalizeAndLimit(result.text),
        parserName: 'pdf-parse',
        metadata: { extension, pages: result.total },
      };
    } finally {
      await parser.destroy();
    }
  }

  private async parseDocx(buffer: Buffer, extension: string): Promise<KnowledgeFileParseResult> {
    this.assertZipContainer(buffer, 'DOCX');
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: this.normalizeAndLimit(result.value),
      parserName: 'mammoth',
      metadata: {
        extension,
        warnings: result.messages.map((message) => message.message).slice(0, 20),
      },
    };
  }

  private async parseWorkbook(buffer: Buffer, extension: string): Promise<KnowledgeFileParseResult> {
    this.assertZipContainer(buffer, 'XLSX');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const lines: string[] = [];
    let visitedCells = 0;

    workbook.eachSheet((worksheet) => {
      lines.push(`# 工作表：${worksheet.name}`);
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const values: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          visitedCells += 1;
          if (visitedCells > 100_000) {
            throw new KnowledgeFileParseError('Excel 单元格数量超过 100,000，建议拆分后上传。');
          }
          values.push(cell.text.trim());
        });
        lines.push(values.join('\t').trimEnd());
      });
      lines.push('');
    });

    return {
      text: this.normalizeAndLimit(lines.join('\n')),
      parserName: 'exceljs',
      metadata: { extension, sheets: workbook.worksheets.length },
    };
  }

  private assertZipContainer(buffer: Buffer, label: string) {
    if (buffer.subarray(0, 2).toString('ascii') !== 'PK') {
      throw new KnowledgeFileParseError(`文件内容不是有效的 ${label}。`);
    }
  }

  private normalizeAndLimit(value: string) {
    const normalized = normalizeKnowledgeText(value.replace(/^\uFEFF/, ''));
    if (!normalized) throw new KnowledgeFileParseError('文档中没有提取到可检索文字；扫描版 PDF 需要先进行 OCR。');
    if (normalized.length > MAX_EXTRACTED_TEXT_CHARS) {
      throw new KnowledgeFileParseError(`文档解析结果超过 ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} 字符，建议拆分后上传。`);
    }
    return normalized;
  }
}

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { renderAsync } from '@resvg/resvg-js';

export const formats = { md: 'text/markdown', csv: 'text/csv', png: 'image/png', mp4: 'video/mp4' } as const;
export type Format = keyof typeof formats;
export function tableRows(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(v => v.replace(/\\\|/g, '|').trim());
  for (let i = 1; i < lines.length; i++) {
    const sep = cells(lines[i]);
    if (!lines[i].includes('|') || !sep.every(v => /^:?-{2,}:?$/.test(v))) continue;
    const rows = [cells(lines[i - 1])];
    for (let j = i + 1; j < lines.length && lines[j].includes('|'); j++) rows.push(cells(lines[j]));
    if (rows.length > 1 && rows.every(r => r.length === sep.length)) return rows;
  }
  return [['序号', '内容'], ...lines.filter(l => l.trim()).map((v, i) => [String(i + 1), v.trim()])];
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
function excerpts(text: string) {
  return text.replace(/[#*`]/g, '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !/^[ |:-]+$/.test(s))
    .flatMap(s => Array.from(s.matchAll(/.{1,30}/gu), m => m[0]));
}
async function slide(title: string, lines: string[], footer: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#101e34"/><rect x="52" y="51" width="54" height="5" fill="#68e9d4"/><g font-family="Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif"><text x="52" y="115" font-size="32" fill="#ffffff">${esc(Array.from(title).slice(0,24).join(''))}</text>${lines.map((s,i)=>`<text x="54" y="${184+i*50}" font-size="25" fill="#d5e6f7">${esc(s)}</text>`).join('')}<text x="54" y="495" font-size="18" fill="#83dcd2">${esc(footer)}</text></g></svg>`;
  return (await renderAsync(svg)).asPng();
}
export async function renderFile(kind: Format, title: string, text: string): Promise<Buffer> {
  if (kind === 'md') return Buffer.from(text);
  if (kind === 'csv') return Buffer.from('\uFEFF' + tableRows(text).map(row => row.map(s => {
    const safe = /^\s*[=+@-]|^[\t\r\n]/.test(s) ? "'" + s : s;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n'));
  const lines = excerpts(text);
  if (kind === 'png') return slide(title, lines.slice(0, 6), lines.length > 6 ? '内容摘要 · 完整内容可导出 Markdown' : '工作摘要');
  const dir = await mkdtemp(join(tmpdir(), 'openworkmate-video-'));
  try {
    const count = Math.min(4, Math.max(1, Math.ceil(lines.length / 3)));
    for (let i = 0; i < count; i++) await writeFile(join(dir, i+'.png'), await slide(title, lines.slice(i*3, i*3+3), `简报 · ${i+1} / ${count}`));
    const path = (await import('@ffmpeg-installer/ffmpeg')).path;
    await promisify(execFile)(path, ['-nostdin','-loglevel','error','-framerate','1/3','-start_number','0','-i',join(dir,'%d.png'),'-vf','fps=12','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',join(dir,'brief.mp4')], { timeout: 60000 });
    return await readFile(join(dir,'brief.mp4'));
  } finally { await rm(dir, { recursive: true, force: true }); }
}

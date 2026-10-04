import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// 使用工作区已有的 Markdown 解析器生成可离线打开的文章预览。
const { marked } = require('marked');
const source = path.resolve('docs/wechat-article.md');
const markdown = await fs.readFile(source, 'utf8');
const body = marked.parse(markdown);
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>我用 GPT‑6 把企业工作伙伴开源了 · OpenWorkMate</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f1f5fb;color:#20314b;font:17px/1.95 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}article{max-width:860px;margin:36px auto;padding:52px 56px;background:white;border-radius:20px}h1{font-size:34px;line-height:1.5;letter-spacing:-.5px;color:#122642}h2{font-size:25px;line-height:1.6;margin-top:54px;padding-left:16px;border-left:5px solid #2585e9;color:#173e68}h3{font-size:21px;margin-top:36px}p{margin:22px 0}a{color:#1478cc;text-decoration:none;overflow-wrap:anywhere}strong{color:#15538a}blockquote{margin:28px 0;padding:16px 24px;background:#eef6ff;border-radius:12px;border-left:3px solid #6baef3}blockquote p{margin:0}img{max-width:100%;height:auto;border:1px solid #e0e9f3;border-radius:12px;display:block;margin:28px auto 12px}p:has(img)+p:has(em){font-size:14px;color:#6b7e96;text-align:center;margin-top:10px}pre{overflow:auto;padding:22px;background:#10243b;color:#e2efff;border-radius:12px;font-size:13px;line-height:1.7}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}ul,ol{padding-left:25px}li{margin:12px 0}footer{font-size:13px;color:#8192a6;text-align:center;margin-top:45px;border-top:1px solid #edf1f6;padding-top:20px}@media(max-width:700px){article{margin:0;padding:24px 20px;border-radius:0}body{font-size:16px}h1{font-size:28px}h2{font-size:22px}}
</style></head><body><article>${body}<footer>OpenWorkMate · 开源介绍文章 · 图片为实际运行的演示界面</footer></article></body></html>`;
await fs.writeFile(path.resolve('docs/wechat-article.html'), html);
console.log('已生成 docs/wechat-article.html，可直接打开查看图文预览。');

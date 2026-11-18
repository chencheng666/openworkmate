import { writeFile } from 'node:fs/promises';

// 从标准输入接收一次性凭证，不接受命令行参数、不覆盖已有配置、不打印密钥。
let input = '';
for await (const part of process.stdin) {
  input += part;
  if (input.length > 2048) throw new Error('输入过长。');
}
const key = input.trim();
if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error('输入不是有效格式的 OpenAI API Key。');
await writeFile(new URL('../backend/.env.openai.local', import.meta.url), [
  'WEB_CHAT_DEMO_MODE=false', 'CHAT_PROVIDER=openai', 'OPENAI_CHAT_MODEL=gpt-6.2-sol',
  'OPENAI_API_KEY=' + key, 'KNOWLEDGE_EMBEDDING_BASE_URL=https://api.openai.com/v1',
  'KNOWLEDGE_EMBEDDING_MODEL=text-embedding-3-small', '',
].join('\n'), { flag: 'wx', mode: 0o600 });
console.log('已保存本地服务端配置；重启服务后生效。');

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const formerNames = [String.fromCodePoint(0x8054, 0x4e1c), ['lian', 'dong'].join(''), ['lian', 'do'].join(''), String.fromCodePoint(0x55, 0x8c37)];
const secrets = [
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{40,}/,
  /sk-[A-Za-z0-9_-]{32,}/,
  /AKIA[A-Z0-9]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];
for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  if (fs.lstatSync(full).isSymbolicLink()) { findings.push({ file, reason: '不允许发布本地符号链接' }); continue; }
  if (/((^|\/)\.env($|\.)|\.(pem|key|p12)$)/.test(file) && !file.endsWith('.env.example')) {
    findings.push({ file, reason: '真实环境配置或私钥文件' });
  }
  const bytes = fs.readFileSync(full);
  const text = bytes.includes(0) ? '' : bytes.toString('utf8');
  if (formerNames.some((word) => `${file}\n${text}`.toLowerCase().includes(word.toLowerCase()))) findings.push({ file, reason: '企业专属标识残留' });
  if (secrets.some((rule) => rule.test(text))) findings.push({ file, reason: '疑似凭证，仅报告路径，请人工核验' });
  if (/\/Users\/[^/\s]+\//.test(text) && !file.startsWith('tests/')) findings.push({ file, reason: '本机绝对路径残留' });
}
console.log(JSON.stringify({ checkedFiles: files.length, findings }, null, 2));
if (findings.length) process.exitCode = 1;

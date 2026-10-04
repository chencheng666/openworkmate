import { createHash, randomBytes } from 'node:crypto';

// 对对象字段排序，保持数组顺序，让相同业务输入得到稳定摘要。
export function hashConfirmationExecution(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item)
      .filter(([, field]) => field !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, field]) => [key, canonical(field)]));
    return item;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function createConfirmationToken() {
  return `cnf_${randomBytes(18).toString('base64url')}`;
}

export function hashConfirmationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

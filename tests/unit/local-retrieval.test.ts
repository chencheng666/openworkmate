import { afterEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeEmbeddingService } from '../../backend/src/modules/knowledge/knowledge-embedding.service';
import { contextFromHeaders } from '../../backend/src/common/request-context';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('本地模型与公司身份边界', () => {
  it('可信代理缺少租户时拒绝，有身份但无角色时不授予管理员', () => {
    vi.stubEnv('AUTH_MODE', 'trusted-proxy'); vi.stubEnv('TRUSTED_PROXY_SECRET', 'test-only');
    const headers = { 'x-workmate-auth-secret': 'test-only', 'x-user-id': 'reader' };
    expect(() => contextFromHeaders(headers)).toThrow('未提供企业或用户身份');
    expect(contextFromHeaders({ ...headers, 'x-tenant-id': 'acme' }).roleIds).toEqual([]);
  });
  it('分批并恢复响应顺序，不把官方密钥发给其他兼容地址', async () => {
    vi.stubEnv('KNOWLEDGE_EMBEDDING_BASE_URL', 'https://embeddings.example.invalid/v1');
    vi.stubEnv('KNOWLEDGE_EMBEDDING_MODEL', 'test');
    vi.stubEnv('KNOWLEDGE_EMBEDDING_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'test-only');
    const sizes: number[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).has('Authorization')).toBe(false);
      const input = JSON.parse(String(init.body)).input as string[];
      sizes.push(input.length);
      return Response.json({ data: input.map((value, index) => ({ index, embedding: [Number(value)] })).reverse() });
    });
    const client = new KnowledgeEmbeddingService();
    const vectors = await client.embed(Array.from({ length: 35 }, (_, index) => String(index)));
    expect(sizes).toEqual([32, 3]);
    expect(vectors?.at(-1)).toEqual([34]);
  });
});

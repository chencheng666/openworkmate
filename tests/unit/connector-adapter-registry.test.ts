import { describe, expect, it, vi } from 'vitest';
import { ConnectorAdapterRegistry } from '../../backend/src/modules/connector-runtime/adapters/connector-adapter-registry.service';

describe('连接器 Adapter 路由', () => {
  it('OA 等类型配置 HTTP 时优先使用通用真实 Adapter', async () => {
    const generic = { execute: vi.fn().mockResolvedValue({ mode: 'live' }) };
    const oa = { execute: vi.fn().mockResolvedValue({ mode: 'mock' }) };
    const registry = new ConnectorAdapterRegistry(oa as never, {} as never, {} as never, {} as never, {} as never, generic as never);
    const result = await registry.execute({ connector: { type: 'oa', metadata: { transport: 'http' } } } as never);
    expect(result.mode).toBe('live');
    expect(generic.execute).toHaveBeenCalled();
    expect(oa.execute).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { GenericConnectorAdapter } from '../../backend/src/modules/connector-runtime/adapters/generic-connector.adapter';

describe('通用 HTTP 连接器 Adapter', () => {
  it('将 GET filters 映射为查询参数并解析 items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: '1' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GenericConnectorAdapter();
    const result = await adapter.execute({
      ctx: { tenantId: 'workmate', userId: 'u1', roleIds: ['employee'], parkIds: [] },
      connector: { baseUrl: 'https://internal.example', metadata: { transport: 'http', path: '/api/orders' }, authMode: 'none', systemName: '订单系统' } as never,
      declaration: { governance: { actionKind: 'read' }, execution: { targetSystem: 'orders', connectorKey: 'orders', capabilityName: 'query' } } as never,
      runtimeInput: { businessGoal: '查询订单', filters: { status: 'open' }, payload: {} },
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ search: '?status=open' }), expect.objectContaining({ method: 'GET' }));
    expect(result.mode).toBe('live');
    expect(result.records).toEqual([{ id: '1' }]);
    vi.unstubAllGlobals();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { probeConnector } from '../../backend/src/modules/connectors/connector-health';

describe('连接器 HTTP 健康探测', () => {
  it('成功请求健康地址时返回 healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const result = await probeConnector({ baseUrl: 'https://system.example', authMode: 'none', metadata: { transport: 'http', healthPath: '/ready' }, systemName: '业务系统' });
    expect(result).toEqual({ status: 'healthy', message: '业务系统 HTTP 探测成功。' });
    vi.unstubAllGlobals();
  });

  it('缺少密钥时不发起请求并返回 degraded', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await probeConnector({ baseUrl: 'https://system.example', authMode: 'apiKey', metadata: { transport: 'http', apiKeyEnv: 'MISSING_HEALTH_KEY' }, systemName: '业务系统' });
    expect(result.status).toBe('degraded');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('HTTP 暂不支持的认证方式不会误报 healthy', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await probeConnector({ baseUrl: 'https://system.example', authMode: 'oauth2', metadata: { transport: 'http' }, systemName: '业务系统' });
    expect(result.status).toBe('degraded');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

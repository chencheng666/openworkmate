// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { executeConnectorHttp } from '../../backend/src/modules/connector-runtime/adapters/http-connector';
import type { ConnectorRuntimeAdapterInput } from '../../backend/src/modules/connector-runtime/adapters/connector-adapter.types';
import { validateHttpConfig } from '../../backend/src/modules/connectors/connector-http-config';
import { probeConnector } from '../../backend/src/modules/connectors/connector-health';

let server: Server;
let baseUrl: string;
const requests: Array<{ url: string; method?: string; body: unknown; auth?: string }> = [];

afterEach(() => vi.unstubAllEnvs());

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    requests.push({ url: req.url!, method: req.method, body: text ? JSON.parse(text) : null, auth: req.headers.authorization });
    const path = new URL(req.url!, 'http://localhost').pathname;
    if (path === '/redirect') { res.writeHead(302, { Location: '/forbidden' }); res.end(); return; }
    if (path === '/timeout') return;
    if (path === '/error') { res.writeHead(503); res.end('内部错误含敏感信息'); return; }
    if (path === '/html') { res.end('<html>登录页</html>'); return; }
    const body = path === '/business-error' ? { code: 403, secret: '不得外传' }
      : path === '/malformed' ? { message: '未知结构' }
        : path === '/dispatch' ? { code: 0, data: { id: 'TK-001', assignee: 'u2' } }
          : { code: 0, data: { records: [{ id: 'TK-001' }], total: 42 } };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function input(path = '/query'): ConnectorRuntimeAdapterInput {
  return {
    ctx: { tenantId: 'workmate', userId: 'u1', roleIds: ['employee'], parkIds: ['park-1'] },
    connector: {
      tenantId: 'workmate', key: 'tickets', displayName: '工单', type: 'ticketing', systemName: '工单系统',
      baseUrl, authMode: 'none', status: 'active', ownerDepartment: '运营', dataDomains: ['ticket'],
      capabilities: [{ name: 'search', actionKind: 'read', riskLevel: 'low', description: '查询', requiredScopes: [] },
        { name: 'dispatch', actionKind: 'write', riskLevel: 'high', description: '派单', requiredScopes: [] }],
      syncPolicy: { mode: 'manual' }, lastHealthStatus: 'unknown',
      metadata: { transport: 'http', operations: {
        search: { path, method: 'GET', queryMapping: { q: 'filters.keyword', owner: 'context.userId', status: 'filters.status' },
          response: { recordsPath: 'data.records', totalPath: 'data.total', successPath: 'code', successValues: [0] } },
        dispatch: { path: '/dispatch', method: 'POST', bodyMapping: { ticketId: 'filters.ticketId', 'assignment.user': 'payload.assignee', actor: 'context.userId' },
          response: { recordsPath: 'data', successPath: 'code', successValues: [0] } },
      } },
    },
    declaration: { governance: { actionKind: 'read' }, execution: { targetSystem: '工单系统', connectorKey: 'tickets', capabilityName: 'search' } } as never,
    runtimeInput: { filters: { keyword: '空调', status: ['new', 'open'], userId: '伪造用户' }, payload: {} },
  };
}

describe('真实本地 HTTP 接入契约', () => {
  it('凭证只从后端环境变量读取，缺少凭证不发起请求', async () => {
    const request = input();
    request.connector.authMode = 'jwt';
    request.connector.metadata.apiKeyEnv = 'TEST_CONNECTOR_HTTP_TOKEN';
    vi.stubEnv('TEST_CONNECTOR_HTTP_TOKEN', '');
    const before = requests.length;
    await expect(executeConnectorHttp(request)).rejects.toMatchObject({ code: 'missing_credentials' });
    expect(requests.length).toBe(before);
    vi.stubEnv('TEST_CONNECTOR_HTTP_TOKEN', 'test-only-token');
    const result = await executeConnectorHttp(request);
    expect(requests.at(-1)!.auth).toBe('Bearer test-only-token');
    expect(JSON.stringify(result)).not.toContain('test-only-token');
  });

  it('映射参数、数组和可信身份，并提取嵌套分页响应', async () => {
    const result = await executeConnectorHttp(input());
    expect(result).toMatchObject({ mode: 'live', records: [{ id: 'TK-001' }], total: 42 });
    const url = new URL(requests.at(-1)!.url, baseUrl);
    expect(url.searchParams.get('q')).toBe('空调');
    expect(url.searchParams.get('owner')).toBe('u1');
    expect(url.searchParams.getAll('status')).toEqual(['new', 'open']);
    expect(url.searchParams.has('userId')).toBe(false);
  });

  it('派单使用独立 POST 接口，发送映射后的嵌套 JSON 并读取单条结果', async () => {
    const request = input();
    request.declaration.execution.capabilityName = 'dispatch';
    request.declaration.governance.actionKind = 'write';
    request.runtimeInput = { filters: { ticketId: 'TK-001' }, payload: { assignee: 'u2' }, confirmationToken: '不应发给业务系统' };
    const result = await executeConnectorHttp(request);
    expect(requests.at(-1)).toMatchObject({ url: '/dispatch', method: 'POST', body: { ticketId: 'TK-001', assignment: { user: 'u2' }, actor: 'u1' } });
    expect(result.records).toEqual([{ id: 'TK-001', assignee: 'u2' }]);
  });

  it.each([
    ['/business-error', 'upstream_business_error'], ['/error', 'upstream_http_error'], ['/html', 'invalid_response'],
  ])('将 %s 识别为失败而不是空结果', async (path, code) => {
    await expect(executeConnectorHttp(input(path))).rejects.toMatchObject({ code });
  });

  it('未知响应结构不会被转换为零条成功结果', async () => {
    const request = input('/malformed');
    request.connector.metadata = { transport: 'http', searchPath: '/malformed' };
    await expect(executeConnectorHttp(request)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('HTTP 未配置地址或写入能力时直接失败，不回退模拟', async () => {
    const request = input();
    request.connector.baseUrl = undefined;
    await expect(executeConnectorHttp(request)).rejects.toMatchObject({ code: 'invalid_config' });
    request.connector.baseUrl = baseUrl;
    request.connector.metadata = { transport: 'http' };
    request.declaration.governance.actionKind = 'write';
    await expect(executeConnectorHttp(request)).rejects.toMatchObject({ code: 'operation_not_configured' });
  });

  it('不跟随重定向，不将凭证转发至其他接口', async () => {
    const before = requests.length;
    await expect(executeConnectorHttp(input('/redirect'))).rejects.toMatchObject({ code: 'upstream_unavailable' });
    expect(requests.slice(before).map((req) => req.url)).toHaveLength(1);
    expect(requests.some((req) => req.url === '/forbidden')).toBe(false);
  });

  it('超时只发送一次请求', async () => {
    const request = input('/timeout');
    request.connector.metadata.timeoutMs = 100;
    const before = requests.length;
    await expect(executeConnectorHttp(request)).rejects.toMatchObject({ code: 'upstream_timeout' });
    expect(requests.length - before).toBe(1);
  });

  it.each(['//other.example/api', '/\\other.example/api', 'https://other.example/api'])('拒绝跨源路径 %s', (path) => {
    expect(() => validateHttpConfig(input(path).connector)).toThrow('同源绝对路径');
  });

  it('拒绝危险字段映射和未声明的能力', () => {
    const request = input();
    request.connector.metadata.operations = { search: { path: '/query', bodyMapping: { '__proto__.polluted': 'payload.value' } } };
    expect(() => validateHttpConfig(request.connector)).toThrow('映射');
    request.connector.metadata.operations = { unknown: { path: '/query' } };
    expect(() => validateHttpConfig(request.connector)).toThrow('未声明');
  });

  it('健康检查默认请求 /health，不触碰业务接口', async () => {
    const connector = input().connector;
    connector.metadata.path = '/dispatch';
    expect((await probeConnector(connector)).status).toBe('healthy');
    expect(requests.at(-1)!.url).toBe('/health');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { BiConnectorAdapter } from '../../backend/src/modules/connector-runtime/adapters/bi-connector.adapter';
import { ConnectorAdapterRegistry } from '../../backend/src/modules/connector-runtime/adapters/connector-adapter-registry.service';
import type { ConnectorRuntimeAdapterInput } from '../../backend/src/modules/connector-runtime/adapters/connector-adapter.types';
import { ContractConnectorAdapter } from '../../backend/src/modules/connector-runtime/adapters/contract-connector.adapter';
import { CrmConnectorAdapter } from '../../backend/src/modules/connector-runtime/adapters/crm-connector.adapter';
import { GenericConnectorAdapter } from '../../backend/src/modules/connector-runtime/adapters/generic-connector.adapter';
import { OaConnectorAdapter } from '../../backend/src/modules/connector-runtime/adapters/oa-connector.adapter';
import { TicketingConnectorAdapter } from '../../backend/src/modules/connector-runtime/adapters/ticketing-connector.adapter';

function createInput(overrides: Partial<ConnectorRuntimeAdapterInput> = {}): ConnectorRuntimeAdapterInput {
  return {
    ctx: {
      tenantId: 'workmate',
      userId: 'u-001',
      userName: '演示用户',
      orgId: 'ops',
      roleIds: ['platform-admin'],
    },
    connector: {
      tenantId: 'workmate',
      key: 'oa-approval',
      displayName: 'OA 审批中心',
      type: 'oa',
      systemName: '企业 OA',
      authMode: 'sso',
      status: 'active',
      ownerDepartment: '流程与信息化部',
      dataDomains: ['审批'],
      capabilities: [],
      syncPolicy: { mode: 'webhook' },
      metadata: {},
      lastHealthStatus: 'healthy',
    },
    declaration: {
      name: 'workmate_oa_approval_query_todo',
      title: 'OA 审批中心 / 查询当前用户待办和审批详情',
      description: '查询当前用户待办和审批详情',
      inputSchema: {
        type: 'object',
        properties: {},
        required: ['businessGoal'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      governance: {
        connectorId: 'oa-approval',
        connectorKey: 'oa-approval',
        connectorType: 'oa',
        capabilityName: 'query-todo',
        actionKind: 'read',
        riskLevel: 'low',
        requiredScopes: ['approval:read'],
        dataDomains: ['审批'],
        humanConfirmationRequired: false,
        auditLevel: 'standard',
      },
      execution: {
        transport: 'workmate-connector-gateway',
        connectorKey: 'oa-approval',
        capabilityName: 'query-todo',
        targetSystem: '企业 OA',
        status: 'active',
      },
    },
    runtimeInput: {
      businessGoal: '查询张三发起的待办',
      filters: { keyword: '张三' },
      payload: {},
    },
    requestId: 'test-request',
    ...overrides,
  };
}

function createRegistry() {
  return new ConnectorAdapterRegistry(
    new OaConnectorAdapter(),
    new TicketingConnectorAdapter(),
    new CrmConnectorAdapter(),
    new ContractConnectorAdapter(),
    new BiConnectorAdapter(),
    new GenericConnectorAdapter(),
  );
}

describe('Connector runtime adapters', () => {
  it('routes OA connector execution to the OA adapter', async () => {
    const result = await createRegistry().execute(createInput());

    expect(result.adapter).toBe('oa');
    expect(result.connectorKey).toBe('oa-approval');
    expect(result.records[0]).toMatchObject({ todoId: 'TODO-10086' });
  });

  it('routes BI connector execution to the BI adapter', async () => {
    const result = await createRegistry().execute(createInput({
      connector: {
        ...createInput().connector,
        key: 'bi-analytics',
        type: 'bi',
        systemName: '企业经营分析平台',
      },
      declaration: {
        ...createInput().declaration,
        governance: {
          ...createInput().declaration.governance,
          connectorKey: 'bi-analytics',
          connectorType: 'bi',
          capabilityName: 'query-metric',
        },
        execution: {
          ...createInput().declaration.execution,
          connectorKey: 'bi-analytics',
          capabilityName: 'query-metric',
          targetSystem: '企业经营分析平台',
        },
      },
    }));

    expect(result.adapter).toBe('bi');
    expect(result.records[0]).toHaveProperty('metric');
    expect(result.nextActions).toContain('下钻异常园区');
  });

  it('falls back to the generic adapter for custom connectors', async () => {
    const result = await createRegistry().execute(createInput({
      connector: {
        ...createInput().connector,
        key: 'custom-system',
        type: 'custom',
        systemName: '自定义系统',
      },
      declaration: {
        ...createInput().declaration,
        governance: {
          ...createInput().declaration.governance,
          connectorKey: 'custom-system',
          connectorType: 'custom',
          capabilityName: 'custom-action',
        },
        execution: {
          ...createInput().declaration.execution,
          connectorKey: 'custom-system',
          capabilityName: 'custom-action',
          targetSystem: '自定义系统',
        },
      },
    }));

    expect(result.adapter).toBe('generic');
    expect(result.summary).toContain('通用适配器');
  });

  it('在 HTTP 配置和服务端密钥存在时调用真实工单查询接口', async () => {
    const previousKey = process.env.TEST_TICKETING_API_KEY;
    process.env.TEST_TICKETING_API_KEY = 'secret-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ ticketId: 'TK-LIVE-1', status: 'processing' }], total: 1,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createRegistry().execute(createInput({
      connector: {
        ...createInput().connector,
        key: 'park-ticketing',
        displayName: '园区工单系统',
        type: 'ticketing',
        systemName: '企业工单平台',
        baseUrl: 'https://ticket.example.test',
        authMode: 'apiKey',
        metadata: { transport: 'http', apiKeyEnv: 'TEST_TICKETING_API_KEY', searchPath: '/v1/tickets/search' },
      },
      declaration: {
        ...createInput().declaration,
        execution: {
          ...createInput().declaration.execution,
          connectorKey: 'park-ticketing',
          connectorDisplayName: '园区工单系统',
          targetSystem: '企业工单平台',
          capabilityName: 'search-ticket',
        },
      },
    }));

    expect(result.mode).toBe('live');
    expect(result.adapter).toBe('ticketing-http');
    expect(result.records).toEqual([{ ticketId: 'TK-LIVE-1', status: 'processing' }]);
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0] as [URL, { headers: Record<string, string> }];
    expect(requestUrl.toString()).toBe('https://ticket.example.test/v1/tickets/search?keyword=%E5%BC%A0%E4%B8%89&page=1&pageSize=20');
    expect(requestOptions.headers).toMatchObject({ Accept: 'application/json', 'x-api-key': 'secret-key' });

    vi.unstubAllGlobals();
    if (previousKey === undefined) delete process.env.TEST_TICKETING_API_KEY;
    else process.env.TEST_TICKETING_API_KEY = previousKey;
  });
});

// @vitest-environment node
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConnectorRuntimeService } from '../../backend/src/modules/connector-runtime/connector-runtime.service';
import { ConnectorHttpError } from '../../backend/src/modules/connectors/connector-http-config';
import { buildConnectorToolDeclaration } from '../../backend/src/modules/connectors/connector-tool-declaration';
import type { ConnectorDefinition } from '../../backend/src/modules/connectors/connector.schema';

// Vitest 不生成装饰器类型元数据；本组仅替换数据库 Schema，执行真实 Service 逻辑。
vi.mock('../../backend/src/modules/connectors/connector.schema', () => ({ ConnectorDefinition: class ConnectorDefinition {} }));
vi.mock('../../backend/src/modules/connector-runtime/connector-confirmation.schema', () => ({ ConnectorConfirmation: class ConnectorConfirmation {} }));
vi.mock('../../backend/src/modules/audit/audit.service', () => ({ AuditService: class AuditService {} }));

const ctx = { tenantId: 'workmate', userId: 'u1', roleIds: ['employee'], parkIds: [] };

function fixture(actionKind: 'read' | 'write' = 'write') {
  const connector: ConnectorDefinition = {
    tenantId: 'workmate', key: 'tickets', displayName: '工单', type: 'ticketing', systemName: '工单系统',
    baseUrl: 'https://internal.example', authMode: 'none', status: 'active', ownerDepartment: '运营',
    dataDomains: [], capabilities: [{ name: 'dispatch', description: '派单', actionKind, riskLevel: 'low', requiredScopes: [] }],
    metadata: {}, syncPolicy: { mode: 'manual' }, lastHealthStatus: 'unknown',
  };
  const toolName = buildConnectorToolDeclaration(connector, connector.capabilities[0]).name;
  let confirmation: Record<string, unknown> | undefined;
  const confirmations = {
    create: vi.fn(async (doc: Record<string, unknown>) => {
      confirmation = { ...doc, _id: 'confirmation-1' };
      return confirmation;
    }),
    // 模拟数据库的原子条件更新，两个并发消费者只有一个能命中。
    findOneAndUpdate: vi.fn(async (query: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      if (!confirmation || confirmation.status !== 'approved' || confirmation.requestedBy !== query.requestedBy
        || confirmation.tenantId !== query.tenantId || confirmation.toolName !== query.toolName
        || confirmation.executionHash !== query.executionHash || confirmation.approvalTokenHash !== query.approvalTokenHash
        || (confirmation.expiresAt as Date).getTime() <= Date.now()) return null;
      Object.assign(confirmation, update.$set);
      return { ...confirmation };
    }),
  };
  const adapter = { execute: vi.fn().mockResolvedValue({ mode: 'live', adapter: 'ticketing-http', records: [{ id: 'TK-001' }] }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new ConnectorRuntimeService(
    { find: vi.fn().mockReturnValue({ lean: async () => [connector] }) } as never,
    confirmations as never, adapter as never, audit as never,
  );
  const dto = { toolName, input: { businessGoal: '派单', filters: { ticketId: 'TK-001' }, payload: { assignee: 'u2' } } };
  return { connector, dto, confirmations, adapter, audit, service, getConfirmation: () => confirmation! };
}

async function approve(f: ReturnType<typeof fixture>) {
  const { hashConfirmationToken } = await import('../../backend/src/modules/connector-runtime/confirmation-token');
  expect((await f.service.execute(ctx, f.dto)).status).toBe('confirmation_required');
  Object.assign(f.getConfirmation(), { status: 'approved', approvalTokenHash: hashConfirmationToken('cnf_test') });
  return { ...f.dto, input: { ...f.dto.input, confirmationToken: 'cnf_test' } };
}

describe('真实调用的确认边界与失败审计', () => {
  it('用户确认前不调用业务系统，并发重复提交只执行一次', async () => {
    const f = fixture();
    const dto = await approve(f);
    expect(f.adapter.execute).not.toHaveBeenCalled();
    const results = await Promise.all([f.service.execute(ctx, dto), f.service.execute(ctx, dto)]);
    expect(results.map((result) => result.status).sort()).toEqual(['blocked', 'executed']);
    expect(f.adapter.execute).toHaveBeenCalledTimes(1);
    const event = f.audit.record.mock.calls.find(([, entry]) => entry.action === 'connector_runtime.execute')![1];
    expect(event.detail.input).not.toHaveProperty('confirmationToken');
  });

  it('修改派单参数后旧确认失效，原参数仍可使用', async () => {
    const f = fixture();
    const dto = await approve(f);
    const modified = { ...dto, input: { ...dto.input, payload: { assignee: 'u3' } } };
    expect((await f.service.execute(ctx, modified)).status).toBe('blocked');
    expect(f.adapter.execute).not.toHaveBeenCalled();
    expect((await f.service.execute(ctx, dto)).status).toBe('executed');
  });

  it.each(['user', 'config', 'expired'])('%s 发生变化后旧确认不能执行', async (change) => {
    const f = fixture();
    const dto = await approve(f);
    if (change === 'config') f.connector.baseUrl = 'https://other.example';
    if (change === 'expired') f.getConfirmation().expiresAt = new Date(0);
    expect((await f.service.execute(change === 'user' ? { ...ctx, userId: 'u2' } : ctx, dto)).status).toBe('blocked');
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });

  it('参数键顺序变化不影响已确认输入的匹配', async () => {
    const f = fixture();
    const dto = await approve(f);
    expect((await f.service.execute(ctx, { ...dto, input: {
      payload: dto.input.payload, filters: dto.input.filters, businessGoal: dto.input.businessGoal, confirmationToken: 'cnf_test',
    } })).status).toBe('executed');
  });

  it('业务失败返回结构化错误并记录失败审计', async () => {
    const f = fixture('read');
    f.adapter.execute.mockRejectedValue(new ConnectorHttpError('upstream_business_error', '业务系统返回失败状态。'));
    expect(await f.service.execute(ctx, f.dto)).toMatchObject({
      status: 'failed', error: { code: 'upstream_business_error' }, audit: { recorded: true },
    });
    expect(f.audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'connector_runtime.execute_failed', result: 'failed' }));
  });

  it('未知错误不泄露原始异常，写入失败后不重复消费令牌', async () => {
    const f = fixture();
    const dto = await approve(f);
    f.adapter.execute.mockRejectedValue(new Error('secret-token 原始内部地址'));
    const result = await f.service.execute(ctx, dto);
    expect(result.status).toBe('failed');
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect((await f.service.execute(ctx, dto)).status).toBe('blocked');
    expect(f.adapter.execute).toHaveBeenCalledTimes(1);
  });
});

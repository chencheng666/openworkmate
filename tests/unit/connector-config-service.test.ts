// @vitest-environment node
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConnectorsService } from '../../backend/src/modules/connectors/connectors.service';

vi.mock('../../backend/src/modules/connectors/connector.schema', () => ({ ConnectorDefinition: class ConnectorDefinition {} }));
vi.mock('../../backend/src/modules/audit/audit.service', () => ({ AuditService: class AuditService {} }));

const manager = { tenantId: 'workmate', userId: 'u1', roleIds: ['platform-admin'], parkIds: [] };

function fixture() {
  const connector = {
    key: 'tickets', baseUrl: 'https://internal.example', authMode: 'none', capabilities: [],
    metadata: { transport: 'http', path: '/old' }, status: 'active', lastHealthStatus: 'healthy',
    lastHealthCheckAt: new Date(), save: vi.fn().mockResolvedValue(undefined),
  };
  const model = { findOne: vi.fn().mockResolvedValue(connector) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { connector, model, audit, service: new ConnectorsService(model as never, audit as never) };
}

describe('连接器接入配置更新', () => {
  it('只更新本租户连接器，整体替换配置并重置为草稿', async () => {
    const f = fixture();
    const result = await f.service.updateHttpConfig(manager, 'connector-1', { metadata: { transport: 'http', path: '/new' } });
    expect(f.model.findOne).toHaveBeenCalledWith({ _id: 'connector-1', tenantId: 'workmate' });
    expect(result).toMatchObject({ status: 'draft', lastHealthStatus: 'unknown', metadata: { transport: 'http', path: '/new' } });
    expect(result.lastHealthCheckAt).toBeUndefined();
    expect(f.connector.save).toHaveBeenCalledOnce();
    expect(f.audit.record).toHaveBeenCalledWith(manager, expect.objectContaining({ action: 'connector.update_http_config' }));
  });

  it('普通员工不能更新配置', async () => {
    const f = fixture();
    await expect(f.service.updateHttpConfig({ ...manager, roleIds: ['employee'] }, 'connector-1', {})).rejects.toThrow('没有连接器治理权限');
    expect(f.model.findOne).not.toHaveBeenCalled();
  });

  it('无效配置不保存、不写成功审计', async () => {
    const f = fixture();
    await expect(f.service.updateHttpConfig(manager, 'connector-1', { baseUrl: 'file:///tmp/test' })).rejects.toThrow('HTTP(S)');
    expect(f.connector.save).not.toHaveBeenCalled();
    expect(f.audit.record).not.toHaveBeenCalled();
  });
});

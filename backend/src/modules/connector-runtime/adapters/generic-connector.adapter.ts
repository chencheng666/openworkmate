import { Injectable } from '@nestjs/common';
import { ConnectorRuntimeAdapter, ConnectorRuntimeAdapterInput } from './connector-adapter.types';
import { createMockResult } from './mock-result';
import { executeConnectorHttp } from './http-connector';

@Injectable()
export class GenericConnectorAdapter implements ConnectorRuntimeAdapter {
  readonly type = 'generic' as const;

  async execute(input: ConnectorRuntimeAdapterInput) {
    if (input.connector.metadata.transport === 'http') return executeConnectorHttp(input);
    return createMockResult('generic', input, this.resolveSummary(input.declaration.governance.actionKind), [
      {
        connectorKey: input.declaration.governance.connectorKey,
        capabilityName: input.declaration.governance.capabilityName,
        actionKind: input.declaration.governance.actionKind,
        status: 'mocked',
      },
    ], ['为该 connector type 增加专用 adapter', '接入真实系统认证、请求和响应映射']);
  }

  private resolveSummary(actionKind: string) {
    if (actionKind === 'read') return '已通过通用适配器完成模拟查询。';
    if (actionKind === 'notify') return '已通过通用适配器生成模拟通知任务。';
    if (actionKind === 'approve') return '已通过通用适配器完成模拟审批动作。';
    return '已通过通用适配器完成模拟写入动作。';
  }
}

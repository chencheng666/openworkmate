import { Injectable } from '@nestjs/common';
import { ConnectorRuntimeAdapter, ConnectorRuntimeAdapterInput } from './connector-adapter.types';
import { createMockResult } from './mock-result';
import { executeConnectorHttp } from './http-connector';

@Injectable()
export class TicketingConnectorAdapter implements ConnectorRuntimeAdapter {
  readonly type = 'ticketing' as const;

  async execute(input: ConnectorRuntimeAdapterInput) {
    if (input.connector.metadata.transport === 'http') return executeConnectorHttp(input);
    if (input.declaration.governance.actionKind === 'write') {
      return createMockResult('ticketing', input, '已生成模拟派单建议，真实写回等待工单适配器接入。', [
        {
          ticketId: 'TK-202605-3321',
          park: input.runtimeInput.filters?.parkId ?? 'demo-park-001',
          category: '物业维修',
          assignee: '园区工程班组',
          slaHours: 4,
          dispatchReason: '按问题类型、园区和 SLA 自动匹配处理人',
        },
      ], ['接入工单派单 API', '写回处理人、SLA 和升级策略', '通知园区运营负责人']);
    }


    return createMockResult('ticketing', input, '已完成模拟工单查询，返回超时风险和处理建议。', [
      {
        ticketId: 'TK-202605-3308',
        enterprise: '企业入驻企业 A',
        issue: '空调报修',
        status: '处理中',
        slaRisk: '2 小时后超时',
      },
      {
        ticketId: 'TK-202605-3310',
        enterprise: '企业入驻企业 B',
        issue: '网络故障',
        status: '待派单',
        slaRisk: '高',
      },
      ], ['优先处理高 SLA 风险工单', '对低满意度工单触发二次回访']);
  }

}

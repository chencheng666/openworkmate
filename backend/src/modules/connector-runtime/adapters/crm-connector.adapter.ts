import { Injectable } from '@nestjs/common';
import { ConnectorRuntimeAdapter, ConnectorRuntimeAdapterInput } from './connector-adapter.types';
import { createMockResult } from './mock-result';

@Injectable()
export class CrmConnectorAdapter implements ConnectorRuntimeAdapter {
  readonly type = 'crm' as const;

  async execute(input: ConnectorRuntimeAdapterInput) {
    if (input.declaration.governance.actionKind === 'write') {
      return createMockResult('crm', input, '已生成模拟招商跟进任务，等待 CRM 写回适配器接入。', [
        {
          leadId: 'LEAD-202605-089',
          customer: '智能制造客户',
          owner: '招商一部',
          followupType: '政策沟通',
          dueDate: '2026-06-03',
        },
      ], ['接入 CRM 任务创建 API', '按客户阶段同步招商负责人待办']);
    }

    return createMockResult('crm', input, '已完成模拟客户画像读取和园区载体匹配。', [
      {
        customer: '智能制造客户',
        demandArea: '3000-5000 平米',
        preferredCity: '北京',
        matchedPark: '企业 U 谷示范园区',
        carrier: 'A3 栋 2 层',
        score: 86,
      },
    ], ['补充客户预算和政策偏好', '推送 3 个候选载体给招商经理']);
  }
}

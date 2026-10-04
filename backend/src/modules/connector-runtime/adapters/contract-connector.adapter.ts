import { Injectable } from '@nestjs/common';
import { ConnectorRuntimeAdapter, ConnectorRuntimeAdapterInput } from './connector-adapter.types';
import { createMockResult } from './mock-result';

@Injectable()
export class ContractConnectorAdapter implements ConnectorRuntimeAdapter {
  readonly type = 'contract' as const;

  async execute(input: ConnectorRuntimeAdapterInput) {
    if (input.declaration.governance.actionKind === 'approve') {
      return createMockResult('contract', input, '已完成模拟法务复核意见提交，真实合同中心写回仍需接入。', [
        {
          contractId: 'CT-202605-0120',
          riskLevel: '高',
          reviewOpinion: input.runtimeInput.payload?.comment ?? '建议补充付款节点和违约责任说明',
          reviewer: input.ctx.userName ?? input.ctx.userId,
        },
      ], ['调用合同中心复核意见 API', '同步审批链节点状态', '触发用印前校验']);
    }

    return createMockResult('contract', input, '已读取模拟合同正文、条款摘要和审批链。', [
      {
        contractId: 'CT-202605-0118',
        customer: '北京某科技有限公司',
        abnormalTerms: ['非标付款周期', '租金减免超过标准'],
        currentNode: '法务复核',
      },
    ], ['将异常条款关联知识库规则', '需要高风险动作时进入人工确认']);
  }
}

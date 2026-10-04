import { Injectable } from '@nestjs/common';
import { ConnectorRuntimeAdapter, ConnectorRuntimeAdapterInput } from './connector-adapter.types';
import { createMockResult } from './mock-result';

@Injectable()
export class OaConnectorAdapter implements ConnectorRuntimeAdapter {
  readonly type = 'oa' as const;

  async execute(input: ConnectorRuntimeAdapterInput) {
    const capabilityName = input.declaration.governance.capabilityName;
    if (capabilityName === 'approve-flow') {
      return createMockResult('oa', input, '已完成模拟审批动作，并生成审批链审计摘要。', [
        {
          flowId: 'OA-202605-0018',
          applicant: '张三',
          flowType: '出差申请',
          decision: input.runtimeInput.payload?.decision ?? 'approve',
          currentNode: '部门负责人审批',
          auditedBy: input.ctx.userName ?? input.ctx.userId,
        },
      ], ['真实接入时调用 OA 审批 API 写回审批意见', '把审批结果同步到待办中心和审计日志']);
    }

    return createMockResult('oa', input, '已按用户权限读取模拟待办和审批详情。', [
      {
        todoId: 'TODO-10086',
        title: '张三的出差申请',
        applicant: '张三',
        status: '待审批',
        submittedAt: '2026-05-28T09:30:00+08:00',
      },
    ], ['真实接入时按 SSO 身份读取 OA 待办', '按组织和岗位权限过滤审批详情']);
  }
}

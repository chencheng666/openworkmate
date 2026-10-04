import { Injectable } from '@nestjs/common';
import { ConnectorRuntimeAdapter, ConnectorRuntimeAdapterInput } from './connector-adapter.types';
import { createMockResult } from './mock-result';

@Injectable()
export class BiConnectorAdapter implements ConnectorRuntimeAdapter {
  readonly type = 'bi' as const;

  async execute(input: ConnectorRuntimeAdapterInput) {
    if (input.declaration.governance.actionKind === 'notify') {
      return createMockResult('bi', input, '已生成模拟经营异常通知任务，等待消息通道接入。', [
        {
          metric: '出租率',
          park: input.runtimeInput.filters?.parkId ?? 'demo-park-001',
          variance: '-6.8%',
          notifyTo: '经营管理部',
        },
      ], ['接入企业消息通道', '将异常指标订阅给责任部门']);
    }

    return createMockResult('bi', input, '已完成模拟经营指标查询，返回趋势、异常和归因线索。', [
      {
        metric: '出租率',
        current: '82.4%',
        mom: '-3.1%',
        abnormalParkCount: 4,
        topReason: '新签客户入驻延期',
      },
      {
        metric: '工单超时率',
        current: '7.6%',
        mom: '+1.9%',
        abnormalParkCount: 2,
        topReason: '工程班组排班不足',
      },
    ], ['下钻异常园区', '联动工单和招商数据做归因']);
  }
}

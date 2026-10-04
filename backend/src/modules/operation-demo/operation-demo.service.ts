import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { ConnectorRuntimeService } from '../connector-runtime/connector-runtime.service';
import { ExecuteConnectorToolDto } from '../connector-runtime/dto/execute-connector-tool.dto';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { RunOperationDemoDto } from './dto/run-operation-demo.dto';

const SEARCH_TICKET_TOOL = 'workmate_park_ticketing_search_ticket';
const DISPATCH_TICKET_TOOL = 'workmate_park_ticketing_dispatch_ticket';

type DemoStepStatus = 'done' | 'pending_confirmation' | 'blocked';

type DemoFlowStep = {
  name: string;
  status: DemoStepStatus;
  description: string;
};

@Injectable()
export class OperationDemoService {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly runtime: ConnectorRuntimeService,
    private readonly audit: AuditService,
  ) {}

  async runParkOperationsDemo(ctx: RequestContext, dto: RunOperationDemoDto = {}) {
    const businessGoal = dto.businessGoal?.trim() || '本周园区超时工单分析与督办建议';
    const parkName = dto.parkName?.trim() || '示例产业园';
    const requestIdPrefix = `demo_${Date.now()}`;

    const knowledge = await this.knowledge.search(ctx, {
      query: `${parkName} ${businessGoal} 工单 SLA 升级 回访 SOP`,
      categories: ['运营制度'],
      topK: 3,
    });

    const ticketSearch = await this.runtime.execute(ctx, this.buildRuntimeDto({
      toolName: SEARCH_TICKET_TOOL,
      requestId: `${requestIdPrefix}_search`,
      businessGoal,
      filters: {
        parkName,
        week: 'current',
        slaRisk: 'high',
        status: ['待派单', '处理中'],
      },
    }));

    const dispatchPreview = await this.runtime.execute(ctx, this.buildRuntimeDto({
      toolName: DISPATCH_TICKET_TOOL,
      requestId: `${requestIdPrefix}_dispatch`,
      businessGoal: '根据高风险工单生成督办和派单写回动作',
      filters: {
        parkName,
        ticketIds: this.extractTicketIds(ticketSearch),
      },
      payload: {
        assigneeStrategy: '按问题类型、园区责任人和 SLA 自动匹配',
        notifyRoles: ['园区负责人', '工程班组负责人', '企业服务岗'],
        escalation: '2 小时内未确认处理计划则升级城市公司运营负责人',
      },
    }));

    const result = {
      scenarioTitle: '企业园区运营智能演示',
      businessGoal,
      parkName,
      modelMode: '业务编排演示；配置 DeepSeek 后可在聊天窗口对同一问题做真实模型生成',
      executiveSummary: this.buildExecutiveSummary(parkName, ticketSearch),
      knowledge,
      ticketSearch,
      dispatchPreview,
      suggestedPrompt: `帮我汇总${parkName}本周超时工单，按园区和问题类型排序，分析主要原因，并生成督办建议。涉及通知或写回工单系统的动作请先让我确认。`,
      flow: this.buildFlow(dispatchPreview),
      valuePoints: [
        '一线员工只描述目标，平台自动完成知识库检索、工单系统查询和执行门控。',
        '只读查询自动执行，派单写回被识别为中风险动作并进入人工确认。',
        '每一步都有工具、权限、数据域和审计记录，方便后续接真实 OA、工单和 BI 系统。',
      ],
      generatedAt: new Date().toISOString(),
    };

    await this.audit.record(ctx, {
      action: 'operation_demo.park_operations.run',
      resourceType: 'operation_demo',
      resourceId: requestIdPrefix,
      detail: {
        businessGoal,
        parkName,
        searchTool: SEARCH_TICKET_TOOL,
        dispatchTool: DISPATCH_TICKET_TOOL,
        dispatchStatus: dispatchPreview.status,
      },
    });

    return result;
  }

  private buildRuntimeDto(input: {
    toolName: string;
    requestId: string;
    businessGoal: string;
    filters: Record<string, unknown>;
    payload?: Record<string, unknown>;
  }): ExecuteConnectorToolDto {
    return {
      toolName: input.toolName,
      requestId: input.requestId,
      input: {
        businessGoal: input.businessGoal,
        filters: input.filters,
        payload: input.payload ?? {},
      },
    };
  }

  private extractTicketIds(runtimeResult: Awaited<ReturnType<ConnectorRuntimeService['execute']>>): string[] {
    if (runtimeResult.status !== 'executed') return [];
    return (runtimeResult.result?.records ?? [])
      .map((record) => record.ticketId)
      .filter((ticketId): ticketId is string => typeof ticketId === 'string');
  }

  private buildExecutiveSummary(
    parkName: string,
    runtimeResult: Awaited<ReturnType<ConnectorRuntimeService['execute']>>,
  ): string {
    const records = runtimeResult.status === 'executed' ? runtimeResult.result?.records ?? [] : [];
    const highRiskCount = records.filter((record) => String(record.slaRisk ?? '').includes('高') || String(record.slaRisk ?? '').includes('超时')).length;
    return `${parkName}当前识别到 ${records.length} 条重点工单，其中 ${highRiskCount} 条存在 SLA 超时或高风险信号。建议优先处理影响企业办公的空调、网络等问题，派单写回和督办通知需经人工确认后执行。`;
  }

  private buildFlow(dispatchPreview: Awaited<ReturnType<ConnectorRuntimeService['execute']>>): DemoFlowStep[] {
    return [
      {
        name: '识别目标',
        status: 'done',
        description: '理解用户要汇总超时工单、分析原因并生成督办建议。',
      },
      {
        name: '检索知识库',
        status: 'done',
        description: '读取园区报修 SOP、SLA 升级和满意度回访规则。',
      },
      {
        name: '查询工单系统',
        status: 'done',
        description: '通过 park-ticketing 只读 Tool 获取高风险工单。',
      },
      {
        name: '派单写回门控',
        status: dispatchPreview.status === 'confirmation_required' ? 'pending_confirmation' : dispatchPreview.status === 'blocked' ? 'blocked' : 'done',
        description: dispatchPreview.status === 'confirmation_required'
          ? '写入工单系统属于中风险动作，已生成确认请求，等待负责人确认。'
          : '写入动作已完成或被策略拦截。',
      },
      {
        name: '审计留痕',
        status: 'done',
        description: '记录调用人、目标系统、Tool、风险等级、输入和执行状态。',
      },
    ];
  }
}

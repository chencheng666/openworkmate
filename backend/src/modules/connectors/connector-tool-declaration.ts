import { ConnectorCapability, ConnectorDefinition } from './connector.schema';

export type ConnectorToolDeclaration = {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  };
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  governance: {
    connectorId: string;
    connectorKey: string;
    connectorType: string;
    capabilityName: string;
    actionKind: string;
    riskLevel: string;
    requiredScopes: string[];
    dataDomains: string[];
    humanConfirmationRequired: boolean;
    auditLevel: 'standard' | 'strict';
  };
  execution: {
    transport: 'workmate-connector-gateway';
    connectorKey: string;
    connectorDisplayName: string;
    capabilityName: string;
    targetSystem: string;
    status: string;
  };
};

type ConnectorForTool = Pick<
  ConnectorDefinition,
  'key' | 'displayName' | 'type' | 'systemName' | 'status' | 'dataDomains'
> & {
  _id?: unknown;
};

function normalizeToolName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
}

export function buildConnectorToolDeclaration(
  connector: ConnectorForTool,
  capability: ConnectorCapability,
): ConnectorToolDeclaration {
  const actionKind = capability.actionKind;
  const riskLevel = capability.riskLevel;
  const humanConfirmationRequired = actionKind !== 'read' || riskLevel === 'high';
  const readOnly = actionKind === 'read';

  return {
    name: normalizeToolName(`workmate_${connector.key}_${capability.name}`),
    title: `${connector.displayName} / ${capability.description}`,
    description: [
      capability.description,
      `目标系统：${connector.systemName}`,
      `风险等级：${riskLevel}`,
      humanConfirmationRequired ? '执行前需要人工确认。' : '只读查询，可按权限自动执行。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        businessGoal: {
          type: 'string',
          description: '用户希望通过该工具完成的业务目标。',
        },
        filters: {
          type: 'object',
          description: '查询或执行所需的结构化过滤条件，例如园区、客户、合同、工单编号。',
          additionalProperties: true,
        },
        payload: {
          type: 'object',
          description: '写入、审批或通知类动作的业务载荷。只读工具可为空。',
          additionalProperties: true,
        },
        confirmationToken: {
          type: 'string',
          description: '高风险或写入动作经人工确认后生成的确认令牌。',
        },
      },
      required: ['businessGoal'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: actionKind === 'write' || actionKind === 'approve',
      idempotentHint: actionKind === 'read' || actionKind === 'notify',
      openWorldHint: false,
    },
    governance: {
      connectorId: String(connector._id ?? connector.key),
      connectorKey: connector.key,
      connectorType: connector.type,
      capabilityName: capability.name,
      actionKind,
      riskLevel,
      requiredScopes: capability.requiredScopes,
      dataDomains: connector.dataDomains,
      humanConfirmationRequired,
      auditLevel: riskLevel === 'high' ? 'strict' : 'standard',
    },
    execution: {
      transport: 'workmate-connector-gateway',
      connectorKey: connector.key,
      connectorDisplayName: connector.displayName,
      capabilityName: capability.name,
      targetSystem: connector.systemName,
      status: connector.status,
    },
  };
}

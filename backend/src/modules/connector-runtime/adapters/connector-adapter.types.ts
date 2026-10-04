import { RequestContext } from '../../../common/request-context';
import { ConnectorDefinition, ConnectorType } from '../../connectors/connector.schema';
import { ConnectorToolDeclaration } from '../../connectors/connector-tool-declaration';
import { ExecuteConnectorToolDto } from '../dto/execute-connector-tool.dto';

export type ConnectorRuntimeAdapterType = ConnectorType | 'generic';

export type ConnectorRuntimeAdapterInput = {
  ctx: RequestContext;
  connector: ConnectorDefinition & { _id?: unknown };
  declaration: ConnectorToolDeclaration;
  runtimeInput: ExecuteConnectorToolDto['input'];
  requestId?: string;
};

export type ConnectorRuntimeAdapterResult = {
  mode: 'mock' | 'live';
  adapter: string;
  targetSystem: string;
  connectorKey: string;
  capabilityName: string;
  summary: string;
  businessGoal: string;
  filters: Record<string, unknown>;
  payload: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
  total?: number;
  nextActions: string[];
  generatedAt: string;
};

export interface ConnectorRuntimeAdapter {
  readonly type: ConnectorRuntimeAdapterType;
  execute(input: ConnectorRuntimeAdapterInput): Promise<ConnectorRuntimeAdapterResult>;
}

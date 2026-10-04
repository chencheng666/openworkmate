import { ConnectorRuntimeAdapterInput, ConnectorRuntimeAdapterResult } from './connector-adapter.types';

export function createMockResult(
  adapter: string,
  input: ConnectorRuntimeAdapterInput,
  summary: string,
  records: Array<Record<string, unknown>>,
  nextActions: string[],
): ConnectorRuntimeAdapterResult {
  return {
    mode: 'mock',
    adapter,
    targetSystem: input.declaration.execution.targetSystem,
    connectorKey: input.declaration.execution.connectorKey,
    capabilityName: input.declaration.execution.capabilityName,
    summary,
    businessGoal: input.runtimeInput.businessGoal ?? '未提供业务目标',
    filters: input.runtimeInput.filters ?? {},
    payload: input.runtimeInput.payload ?? {},
    records,
    nextActions,
    generatedAt: new Date().toISOString(),
  };
}

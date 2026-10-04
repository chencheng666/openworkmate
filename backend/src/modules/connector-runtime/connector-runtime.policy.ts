import { ConnectorToolDeclaration } from '../connectors/connector-tool-declaration';

export type ConnectorRuntimeGate = {
  allowed: boolean;
  status: 'ready' | 'confirmation_required' | 'blocked';
  reason?: string;
};

export function evaluateConnectorRuntimeGate(
  declaration: ConnectorToolDeclaration,
  input: { confirmationToken?: string },
): ConnectorRuntimeGate {
  if (declaration.execution.status !== 'active') {
    return {
      allowed: false,
      status: 'blocked',
      reason: 'Connector is not active.',
    };
  }

  if (declaration.governance.humanConfirmationRequired && !input.confirmationToken) {
    return {
      allowed: false,
      status: 'confirmation_required',
      reason: 'Human confirmation is required before executing this tool.',
    };
  }

  return {
    allowed: true,
    status: 'ready',
  };
}

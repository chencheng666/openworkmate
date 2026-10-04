import { describe, expect, it } from 'vitest';
import { evaluateConnectorRuntimeGate } from '../../backend/src/modules/connector-runtime/connector-runtime.policy';
import type { ConnectorToolDeclaration } from '../../backend/src/modules/connectors/connector-tool-declaration';

function createDeclaration(overrides: Partial<ConnectorToolDeclaration> = {}): ConnectorToolDeclaration {
  return {
    name: 'workmate_crm_match',
    title: 'CRM match',
    description: 'Read CRM data',
    inputSchema: {
      type: 'object',
      properties: {},
      required: ['businessGoal'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    governance: {
      connectorId: 'connector-1',
      connectorKey: 'crm-carrier',
      connectorType: 'crm',
      capabilityName: 'match-carrier',
      actionKind: 'read',
      riskLevel: 'low',
      requiredScopes: ['lead:read'],
      dataDomains: ['客户'],
      humanConfirmationRequired: false,
      auditLevel: 'standard',
    },
    execution: {
      transport: 'workmate-connector-gateway',
      connectorKey: 'crm-carrier',
      capabilityName: 'match-carrier',
      targetSystem: '招商 CRM',
      status: 'active',
    },
    ...overrides,
  };
}

describe('evaluateConnectorRuntimeGate', () => {
  it('allows active read tools without confirmation', () => {
    const gate = evaluateConnectorRuntimeGate(createDeclaration(), {});
    expect(gate).toEqual({ allowed: true, status: 'ready' });
  });

  it('blocks inactive connectors', () => {
    const gate = evaluateConnectorRuntimeGate(createDeclaration({
      execution: {
        transport: 'workmate-connector-gateway',
        connectorKey: 'crm-carrier',
        capabilityName: 'match-carrier',
        targetSystem: '招商 CRM',
        status: 'disabled',
      },
    }), {});

    expect(gate.allowed).toBe(false);
    expect(gate.status).toBe('blocked');
  });

  it('requires confirmation for guarded tools', () => {
    const gate = evaluateConnectorRuntimeGate(createDeclaration({
      governance: {
        connectorId: 'connector-2',
        connectorKey: 'contract-center',
        connectorType: 'contract',
        capabilityName: 'submit-legal-review',
        actionKind: 'approve',
        riskLevel: 'high',
        requiredScopes: ['contract:approve'],
        dataDomains: ['合同'],
        humanConfirmationRequired: true,
        auditLevel: 'strict',
      },
    }), {});

    expect(gate.allowed).toBe(false);
    expect(gate.status).toBe('confirmation_required');
  });
});

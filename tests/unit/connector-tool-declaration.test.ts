import { describe, expect, it } from 'vitest';
import { buildConnectorToolDeclaration } from '../../backend/src/modules/connectors/connector-tool-declaration';

describe('buildConnectorToolDeclaration', () => {
  it('marks read capabilities as non-destructive and auto-executable', () => {
    const declaration = buildConnectorToolDeclaration(
      {
        _id: 'connector-1',
        key: 'crm-carrier',
        displayName: 'CRM / 载体库',
        type: 'crm',
        systemName: '招商 CRM 与载体库',
        status: 'active',
        dataDomains: ['客户', '载体'],
      },
      {
        name: 'match-carrier',
        description: '读取客户画像并匹配园区和载体',
        actionKind: 'read',
        riskLevel: 'low',
        requiredScopes: ['lead:read'],
      },
    );

    expect(declaration.name).toBe('workmate_crm_carrier_match_carrier');
    expect(declaration.annotations.readOnlyHint).toBe(true);
    expect(declaration.annotations.destructiveHint).toBe(false);
    expect(declaration.governance.humanConfirmationRequired).toBe(false);
  });

  it('requires confirmation and strict audit for high-risk approval capabilities', () => {
    const declaration = buildConnectorToolDeclaration(
      {
        _id: 'connector-2',
        key: 'contract-center',
        displayName: '合同系统',
        type: 'contract',
        systemName: '企业合同中心',
        status: 'active',
        dataDomains: ['合同', '法务意见'],
      },
      {
        name: 'submit-legal-review',
        description: '提交法务风险复核意见',
        actionKind: 'approve',
        riskLevel: 'high',
        requiredScopes: ['contract:approve'],
      },
    );

    expect(declaration.annotations.destructiveHint).toBe(true);
    expect(declaration.governance.humanConfirmationRequired).toBe(true);
    expect(declaration.governance.auditLevel).toBe('strict');
    expect(declaration.inputSchema.required).toContain('businessGoal');
  });
});

export type SkillRiskLevel = 'low' | 'medium' | 'high';
export type SkillActionKind = 'read' | 'write' | 'approve' | 'notify';

export type SkillToolDeclaration = {
  name: string;
  description: string;
  connectorId: string;
  actionKind: SkillActionKind;
  requiredScopes: string[];
  riskLevel: SkillRiskLevel;
  confirmationRequired: boolean;
};

export type SkillInputField = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'object';
  required: boolean;
  description: string;
  enumValues?: string[];
};

export type SkillManifest = {
  schemaVersion: '1.0';
  name: string;
  displayName: string;
  description: string;
  ownerDepartment: string;
  businessDomain: string;
  version: string;
  riskLevel: SkillRiskLevel;
  inputFields: SkillInputField[];
  tools: SkillToolDeclaration[];
  promptTemplate: string;
  outputContract: {
    type: 'text' | 'json' | 'workflow';
    schema?: Record<string, unknown>;
  };
  governance: {
    dataDomains: string[];
    allowedRoleIds: string[];
    humanConfirmation: 'never' | 'on_write' | 'always';
    auditLevel: 'standard' | 'strict';
  };
};

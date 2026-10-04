import { hostApiFetch } from '@/lib/host-api';

export type EnterpriseKnowledgeStatus = 'draft' | 'indexing' | 'ready' | 'archived' | 'failed';

export type EnterpriseKnowledgeDocument = {
  _id?: string;
  id?: string;
  title: string;
  category: string;
  ownerDepartment: string;
  sourceUri?: string;
  sourceFileName?: string;
  sourceMimeType?: string;
  sourceFileSize?: number;
  parserName?: string;
  summary?: string;
  status: EnterpriseKnowledgeStatus;
  visibility: {
    scopeType: string;
    orgIds?: string[];
    roleIds?: string[];
    parkIds?: string[];
    userIds?: string[];
  };
  chunksCount?: number;
  tokensEstimate?: number;
  updatedAt?: string;
  createdAt?: string;
};

export type EnterpriseKnowledgeDetail = EnterpriseKnowledgeDocument & {
  content: string;
  ingestionRuns: Array<{
    _id?: string;
    id?: string;
    status: 'queued' | 'parsing' | 'embedding' | 'completed' | 'failed';
    trigger?: 'create' | 'manual' | 'update' | 'import';
    attempts?: number;
    chunksCreated?: number;
    errorMessage?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
};

export type KnowledgeSearchResult = {
  query: string;
  answerDraft: string;
  citations: Array<{
    documentId: string;
    chunkId?: string;
    chunkIndex?: number;
    title: string;
    category: string;
    summary?: string;
    snippet?: string;
    score?: number;
    highlights?: string[];
    metadata?: Record<string, unknown>;
  }>;
};

export type KnowledgeToolDeclaration = {
  name: 'workmate_knowledge_search';
  title: string;
  description: string;
  annotations: {
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: false;
  };
  governance: {
    actionKind: 'read';
    riskLevel: 'low';
    requiredScopes: string[];
    dataDomains: string[];
    permissionStrategy: 'request-context';
    humanConfirmationRequired: false;
    auditLevel: 'standard';
  };
  execution: {
    transport: 'workmate-knowledge-runtime';
    endpoint: string;
  };
};

export type KnowledgeRuntimeResult = {
  status: 'executed';
  toolName: KnowledgeToolDeclaration['name'];
  result: KnowledgeSearchResult;
  governance: KnowledgeToolDeclaration['governance'];
  audit: {
    recorded: true;
    action: 'knowledge_runtime.execute';
  };
};

export type EnterpriseHealth = {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  database: {
    readyState: number;
    name?: string;
    host?: string;
  };
  collections: {
    connectors: number;
    knowledgeDocuments: number;
    knowledgeIngestionQueued: number;
    skillSubmissions: number;
    installedSkills: number;
    auditEvents: number;
  };
};

export type ConnectorType = 'oa' | 'ticketing' | 'crm' | 'contract' | 'bi' | 'database' | 'custom';
export type ConnectorStatus = 'draft' | 'active' | 'disabled' | 'error';
export type ConnectorHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'down';

export type EnterpriseConnector = {
  _id?: string;
  id?: string;
  key: string;
  displayName: string;
  type: ConnectorType;
  systemName: string;
  baseUrl?: string;
  authMode: 'none' | 'apiKey' | 'oauth2' | 'jwt' | 'sso' | 'database';
  status: ConnectorStatus;
  ownerDepartment: string;
  dataDomains: string[];
  capabilities: Array<{
    name: string;
    description: string;
    actionKind: 'read' | 'write' | 'approve' | 'notify';
    riskLevel: SkillManifestRisk;
    requiredScopes: string[];
  }>;
  syncPolicy?: {
    mode: 'manual' | 'scheduled' | 'webhook';
    intervalMinutes?: number;
  };
  lastHealthStatus?: ConnectorHealthStatus;
  lastHealthCheckAt?: string;
  updatedAt?: string;
};

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
    capabilityName: string;
    targetSystem: string;
    status: string;
  };
};

export type ConnectorRuntimeResult = {
  status: 'executed' | 'confirmation_required' | 'blocked';
  toolName: string;
  requiresConfirmation?: boolean;
  confirmation?: {
    requestId?: string;
    tokenHint?: string;
    reason?: string;
    riskLevel: string;
    actionKind: string;
    expiresAt?: string;
  };
  result?: {
    mode: 'mock';
    adapter?: string;
    targetSystem: string;
    connectorKey: string;
    capabilityName: string;
    summary: string;
    businessGoal: string;
    filters: Record<string, unknown>;
    payload: Record<string, unknown>;
    records?: Array<Record<string, unknown>>;
    nextActions?: string[];
    generatedAt: string;
  };
  governance: ConnectorToolDeclaration['governance'];
  audit?: {
    recorded: boolean;
    action: string;
  };
};

export type ConnectorConfirmation = {
  _id?: string;
  requestId: string;
  toolName: string;
  connectorKey: string;
  capabilityName: string;
  riskLevel: string;
  actionKind: string;
  status: 'pending' | 'approved' | 'rejected' | 'used' | 'expired';
  reason: string;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  expiresAt: string;
};

export type ConnectorConfirmationApproval = {
  requestId: string;
  status: ConnectorConfirmation['status'];
  confirmationToken?: string;
  expiresAt: string;
};

export type SkillManifestRisk = 'low' | 'medium' | 'high';
export type SkillSubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'published';

export type SkillManifest = {
  schemaVersion: '1.0';
  name: string;
  displayName: string;
  description: string;
  ownerDepartment: string;
  businessDomain: string;
  version: string;
  riskLevel: SkillManifestRisk;
  inputFields: Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'object'; required: boolean; description: string }>;
  tools: Array<{
    name: string;
    description: string;
    connectorId: string;
    actionKind: 'read' | 'write' | 'approve' | 'notify';
    requiredScopes: string[];
    riskLevel: SkillManifestRisk;
    confirmationRequired: boolean;
  }>;
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

export type SkillSubmission = {
  _id?: string;
  id?: string;
  submittedBy: string;
  manifest: SkillManifest;
  status: SkillSubmissionStatus;
  reviewerId?: string;
  reviewComment?: string;
  updatedAt?: string;
};

export type InstalledSkill = {
  _id?: string;
  id?: string;
  submissionId: string;
  name: string;
  displayName: string;
  version: string;
  manifest: SkillManifest;
  enabled: boolean;
  publishedToDefaultAgent?: boolean;
  updatedAt?: string;
};

export type OperationDemoResult = {
  scenarioTitle: string;
  businessGoal: string;
  parkName: string;
  modelMode: string;
  executiveSummary: string;
  knowledge: KnowledgeSearchResult;
  ticketSearch: ConnectorRuntimeResult;
  dispatchPreview: ConnectorRuntimeResult;
  suggestedPrompt: string;
  flow: Array<{
    name: string;
    status: 'done' | 'pending_confirmation' | 'blocked';
    description: string;
  }>;
  valuePoints: string[];
  generatedAt: string;
};

async function enterpriseFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const payload = await hostApiFetch<T | { success?: false; error?: string }>(`/api/enterprise${path}`, {
    ...init,
    headers,
  });
  if (
    payload
    && typeof payload === 'object'
    && 'success' in payload
    && payload.success === false
  ) {
    throw new Error(payload.error || 'Enterprise backend request failed');
  }
  return payload as T;
}

export const enterpriseApi = {
  getHealth() {
    return enterpriseFetch<EnterpriseHealth>('/health');
  },

  listConnectors(filters?: { type?: ConnectorType; status?: ConnectorStatus }) {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.status) params.set('status', filters.status);
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return enterpriseFetch<EnterpriseConnector[]>(`/connectors${suffix}`);
  },

  listConnectorToolDeclarations(includeInactive = false) {
    const suffix = includeInactive ? '?includeInactive=true' : '';
    return enterpriseFetch<ConnectorToolDeclaration[]>(`/connectors/tool-declarations${suffix}`);
  },

  getConnectorToolDeclarations(id: string) {
    return enterpriseFetch<ConnectorToolDeclaration[]>(`/connectors/${encodeURIComponent(id)}/tool-declarations`);
  },

  setConnectorStatus(id: string, status: ConnectorStatus) {
    return enterpriseFetch<EnterpriseConnector>(`/connectors/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  runConnectorHealthCheck(id: string) {
    return enterpriseFetch<{
      connectorId: string;
      status: ConnectorHealthStatus;
      checkedAt: string;
      message: string;
    }>(`/connectors/${encodeURIComponent(id)}/health-check`, {
      method: 'POST',
    });
  },

  executeConnectorTool(input: {
    toolName: string;
    businessGoal: string;
    filters?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    confirmationToken?: string;
  }) {
    return enterpriseFetch<ConnectorRuntimeResult>('/connector-runtime/execute', {
      method: 'POST',
      body: JSON.stringify({
        toolName: input.toolName,
        requestId: `ui-${Date.now()}`,
        input: {
          businessGoal: input.businessGoal,
          filters: input.filters ?? {},
          payload: input.payload ?? {},
          confirmationToken: input.confirmationToken,
        },
      }),
    });
  },

  listConnectorConfirmations(status?: ConnectorConfirmation['status']) {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    return enterpriseFetch<ConnectorConfirmation[]>(`/connector-runtime/confirmations${suffix}`);
  },

  approveConnectorConfirmation(requestId: string, comment?: string) {
    return enterpriseFetch<ConnectorConfirmationApproval>(
      `/connector-runtime/confirmations/${encodeURIComponent(requestId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ comment }),
      },
    );
  },

  rejectConnectorConfirmation(requestId: string, comment?: string) {
    return enterpriseFetch<{ requestId: string; status: 'rejected'; rejectReason?: string }>(
      `/connector-runtime/confirmations/${encodeURIComponent(requestId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ comment }),
      },
    );
  },

  listKnowledgeDocuments(category?: string) {
    const suffix = category ? `?category=${encodeURIComponent(category)}` : '';
    return enterpriseFetch<EnterpriseKnowledgeDocument[]>(`/knowledge/documents${suffix}`);
  },

  createKnowledgeDocument(input: {
    title: string;
    category: string;
    ownerDepartment: string;
    sourceUri?: string;
    summary?: string;
    content?: string;
    visibility: EnterpriseKnowledgeDocument['visibility'];
  }) {
    return enterpriseFetch<EnterpriseKnowledgeDocument>('/knowledge/documents', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  importKnowledgeDocument(input: {
    filename: string;
    mimeType?: string;
    fileBase64: string;
    title: string;
    category: string;
    ownerDepartment: string;
    summary?: string;
    visibility: EnterpriseKnowledgeDocument['visibility'];
  }) {
    return enterpriseFetch<EnterpriseKnowledgeDetail>('/knowledge/documents/import', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getKnowledgeDocument(documentId: string) {
    return enterpriseFetch<EnterpriseKnowledgeDetail>(`/knowledge/documents/${encodeURIComponent(documentId)}`);
  },

  updateKnowledgeDocument(documentId: string, input: {
    title?: string;
    category?: string;
    ownerDepartment?: string;
    sourceUri?: string;
    summary?: string;
    content?: string;
    visibility?: EnterpriseKnowledgeDocument['visibility'];
  }) {
    return enterpriseFetch<EnterpriseKnowledgeDetail>(`/knowledge/documents/${encodeURIComponent(documentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  archiveKnowledgeDocument(documentId: string) {
    return enterpriseFetch<EnterpriseKnowledgeDocument>(
      `/knowledge/documents/${encodeURIComponent(documentId)}/archive`,
      { method: 'POST' },
    );
  },

  restoreKnowledgeDocument(documentId: string) {
    return enterpriseFetch<EnterpriseKnowledgeDocument>(
      `/knowledge/documents/${encodeURIComponent(documentId)}/restore`,
      { method: 'POST' },
    );
  },

  deleteKnowledgeDocument(documentId: string) {
    return enterpriseFetch<{ id: string; deleted: true }>(`/knowledge/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    });
  },

  startKnowledgeIngestion(documentId: string) {
    return enterpriseFetch<{ _id?: string; id?: string; status: string }>(
      `/knowledge/documents/${encodeURIComponent(documentId)}/ingestion-runs`,
      { method: 'POST' },
    );
  },

  searchKnowledge(input: { query: string; categories?: string[]; topK?: number }) {
    return enterpriseFetch<KnowledgeSearchResult>('/knowledge/search', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  listKnowledgeToolDeclarations() {
    return enterpriseFetch<KnowledgeToolDeclaration[]>('/knowledge/tool-declarations');
  },

  executeKnowledgeTool(input: { query: string; categories?: string[]; topK?: number }) {
    return enterpriseFetch<KnowledgeRuntimeResult>('/knowledge/runtime/execute', {
      method: 'POST',
      body: JSON.stringify({
        toolName: 'workmate_knowledge_search',
        requestId: `knowledge-ui-${Date.now()}`,
        input,
      }),
    });
  },

  listSkillSubmissions() {
    return enterpriseFetch<SkillSubmission[]>('/skill-factory/submissions');
  },

  submitSkill(manifest: SkillManifest) {
    return enterpriseFetch<SkillSubmission>('/skill-factory/submissions', {
      method: 'POST',
      body: JSON.stringify({ manifest }),
    });
  },

  reviewSkillSubmission(id: string, decision: 'approved' | 'rejected', comment?: string) {
    return enterpriseFetch<SkillSubmission>(`/skill-factory/submissions/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    });
  },

  publishSkillSubmission(id: string) {
    return enterpriseFetch<InstalledSkill>(`/skill-factory/submissions/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
    });
  },

  listInstalledSkills() {
    return enterpriseFetch<InstalledSkill[]>('/skill-factory/installed');
  },

  setInstalledSkillEnabled(id: string, enabled: boolean) {
    return enterpriseFetch<InstalledSkill>(`/skill-factory/installed/${encodeURIComponent(id)}/enabled`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  runParkOperationsDemo(input?: { businessGoal?: string; parkName?: string }) {
    return enterpriseFetch<OperationDemoResult>('/operation-demo/park-operations/run', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    });
  },
};

export type KnowledgeStatus = 'draft' | 'indexing' | 'ready' | 'archived' | 'failed';
export type VisibilityScope = 'tenant' | 'org' | 'role' | 'park' | 'private';

export type VisibilityRule = {
  scopeType: VisibilityScope;
  orgIds?: string[];
  roleIds?: string[];
  parkIds?: string[];
  userIds?: string[];
};

export type KnowledgeDocument = {
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
  status: KnowledgeStatus;
  visibility: VisibilityRule;
  chunksCount?: number;
  tokensEstimate?: number;
  lastIndexedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type KnowledgeDetail = KnowledgeDocument & {
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
  }>;
};

export type PlatformHealth = {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  database: { readyState: number; name?: string; host?: string };
  collections: {
    connectors: number;
    knowledgeDocuments: number;
    knowledgeIngestionQueued: number;
    skillSubmissions: number;
    installedSkills: number;
    auditEvents: number;
  };
};

export type SkillSubmission = {
  _id?: string;
  id?: string;
  submittedBy: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'published';
  reviewerId?: string;
  reviewComment?: string;
  manifest: {
    name: string;
    displayName: string;
    description: string;
    ownerDepartment: string;
    businessDomain: string;
    version: string;
    riskLevel: 'low' | 'medium' | 'high';
    [key: string]: unknown;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type InstalledSkill = {
  _id?: string;
  id?: string;
  displayName: string;
  name: string;
  version: string;
  enabled: boolean;
  manifest: SkillSubmission['manifest'];
  updatedAt?: string;
};

export type Connector = {
  _id?: string;
  id?: string;
  key: string;
  displayName: string;
  type: 'oa' | 'ticketing' | 'crm' | 'contract' | 'bi' | 'database' | 'custom';
  systemName: string;
  baseUrl?: string;
  authMode: string;
  status: 'draft' | 'active' | 'disabled' | 'error';
  ownerDepartment: string;
  dataDomains: string[];
  capabilities: Array<{ name: string; description: string; riskLevel: string }>;
  lastHealthStatus?: 'unknown' | 'healthy' | 'degraded' | 'down';
  lastHealthCheckAt?: string;
  updatedAt?: string;
};

export type AuditEvent = {
  _id?: string;
  id?: string;
  actorId: string;
  actorName?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  result: 'success' | 'blocked' | 'failed';
  createdAt?: string;
};

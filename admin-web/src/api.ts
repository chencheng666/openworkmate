import type {
  AuditEvent,
  Connector,
  InstalledSkill,
  KnowledgeDetail,
  KnowledgeDocument,
  KnowledgeSearchResult,
  PlatformHealth,
  SkillSubmission,
  VisibilityRule,
} from './types';
import { getAccessToken } from './auth-session';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {});
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (init?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('auth-expired'));
    const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const detail = Array.isArray(payload?.message) ? payload.message.join('；') : payload?.message;
    throw new Error(detail || `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export const adminApi = {
  health: () => request<PlatformHealth>('/health'),
  knowledge: {
    list: () => request<KnowledgeDocument[]>('/knowledge/documents'),
    get: (id: string) => request<KnowledgeDetail>(`/knowledge/documents/${id}`),
    create: (input: {
      title: string;
      category: string;
      ownerDepartment: string;
      summary?: string;
      content: string;
      visibility: VisibilityRule;
    }) => request<KnowledgeDetail>('/knowledge/documents', { method: 'POST', body: JSON.stringify(input) }),
    import: (input: {
      filename: string;
      mimeType?: string;
      fileBase64: string;
      title: string;
      category: string;
      ownerDepartment: string;
      summary?: string;
      visibility: VisibilityRule;
    }) => request<KnowledgeDetail>('/knowledge/documents/import', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{
      title: string;
      category: string;
      ownerDepartment: string;
      summary: string;
      content: string;
      visibility: VisibilityRule;
    }>) => request<KnowledgeDetail>(`/knowledge/documents/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    archive: (id: string) => request<KnowledgeDocument>(`/knowledge/documents/${id}/archive`, { method: 'POST' }),
    restore: (id: string) => request<KnowledgeDocument>(`/knowledge/documents/${id}/restore`, { method: 'POST' }),
    reindex: (id: string) => request(`/knowledge/documents/${id}/ingestion-runs`, { method: 'POST' }),
    delete: (id: string) => request<{ id: string; deleted: boolean }>(`/knowledge/documents/${id}`, { method: 'DELETE' }),
    search: (query: string, categories?: string[]) => request<KnowledgeSearchResult>('/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query, categories, topK: 8 }),
    }),
  },
  skills: {
    submissions: () => request<SkillSubmission[]>('/skill-factory/submissions'),
    installed: () => request<InstalledSkill[]>('/skill-factory/installed'),
    submit: (manifest: Record<string, unknown>) => request<SkillSubmission>('/skill-factory/submissions', {
      method: 'POST',
      body: JSON.stringify({ manifest }),
    }),
    review: (id: string, decision: 'approved' | 'rejected', comment: string) => request<SkillSubmission>(`/skill-factory/submissions/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    }),
    publish: (id: string) => request<InstalledSkill>(`/skill-factory/submissions/${id}/publish`, { method: 'POST' }),
    setEnabled: (id: string, enabled: boolean) => request<InstalledSkill>(`/skill-factory/installed/${id}/enabled`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  },
  connectors: {
    list: () => request<Connector[]>('/connectors'),
    create: (input: Record<string, unknown>) => request<Connector>('/connectors', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    setStatus: (id: string, status: Connector['status']) => request<Connector>(`/connectors/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    healthCheck: (id: string) => request<{ status: string; message: string }>(`/connectors/${id}/health-check`, { method: 'POST' }),
  },
  audit: {
    list: (filters?: { action?: string; result?: string }) => {
      const params = new URLSearchParams({ limit: '150' });
      if (filters?.action) params.set('action', filters.action);
      if (filters?.result) params.set('result', filters.result);
      return request<AuditEvent[]>(`/audit/events?${params.toString()}`);
    },
  },
};

export function entityId(entity: { _id?: string; id?: string }) {
  return entity._id || entity.id || '';
}

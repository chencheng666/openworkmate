import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpenText,
  CheckCircle2,
  FileText,
  Filter,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  enterpriseApi,
  type EnterpriseHealth,
  type EnterpriseKnowledgeDetail,
  type EnterpriseKnowledgeDocument,
  type KnowledgeSearchResult,
  type KnowledgeToolDeclaration,
} from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

type KnowledgeStatus = 'ready' | 'indexing' | 'draft' | 'archived' | 'failed';
type KnowledgeDoc = {
  id: string;
  title: string;
  owner: string;
  scope: string;
  category: string;
  chunks: number;
  updatedAt: string;
  status: KnowledgeStatus;
  summary?: string;
  tokens?: number;
};

type SelectedKnowledgeFile = {
  name: string;
  mimeType: string;
  size: number;
  base64: string;
};

const MAX_KNOWLEDGE_FILE_BYTES = 8 * 1024 * 1024;
const TEXT_FILE_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'csv', 'log']);

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return window.btoa(binary);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const initialDocs: KnowledgeDoc[] = [
  {
    id: 'doc-park-sop',
    title: '园区报修处理 SOP',
    owner: '园区运营中心',
    scope: '全部园区运营岗',
    category: '运营制度',
    chunks: 128,
    updatedAt: '2026-05-18',
    status: 'ready',
  },
  {
    id: 'doc-contract',
    title: '招商合同审批规则',
    owner: '法务与招商管理部',
    scope: '招商、法务、城市公司负责人',
    category: '合同规则',
    chunks: 76,
    updatedAt: '2026-05-20',
    status: 'ready',
  },
  {
    id: 'doc-policy',
    title: '专精特新政策申报材料清单',
    owner: '企业服务中心',
    scope: '企业服务岗',
    category: '政策服务',
    chunks: 42,
    updatedAt: '2026-05-22',
    status: 'indexing',
  },
];

const statusLabel: Record<KnowledgeStatus, string> = {
  ready: '可检索',
  indexing: '索引处理中',
  draft: '待发布',
  archived: '已归档',
  failed: '处理失败',
};

const statusClassName: Record<KnowledgeStatus, string> = {
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  indexing: 'border-sky-200 bg-sky-50 text-sky-700',
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
  archived: 'border-slate-200 bg-slate-50 text-slate-600',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
};

function getDocumentId(doc: EnterpriseKnowledgeDocument): string {
  return doc._id || doc.id || doc.title;
}

function getScopeLabel(doc: EnterpriseKnowledgeDocument): string {
  const visibility = doc.visibility;
  if (visibility.scopeType === 'tenant') return '全员可见';
  if (visibility.scopeType === 'org') return `组织：${visibility.orgIds?.join('、') || '未指定'}`;
  if (visibility.scopeType === 'role') return `角色：${visibility.roleIds?.join('、') || '未指定'}`;
  if (visibility.scopeType === 'park') return `园区：${visibility.parkIds?.join('、') || '未指定'}`;
  return '仅指定人员可见';
}

function mapBackendDocument(doc: EnterpriseKnowledgeDocument): KnowledgeDoc {
  return {
    id: getDocumentId(doc),
    title: doc.title,
    owner: doc.ownerDepartment,
    scope: getScopeLabel(doc),
    category: doc.category,
    chunks: doc.chunksCount ?? 0,
    updatedAt: (doc.updatedAt || doc.createdAt || new Date().toISOString()).slice(0, 10),
    status: doc.status,
    summary: doc.summary,
    tokens: doc.tokensEstimate ?? 0,
  };
}

export function Knowledge() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>(initialDocs);
  const [query, setQuery] = useState('园区报修超过 24 小时如何处理？');
  const [scope, setScope] = useState('all');
  const [backendState, setBackendState] = useState<'connecting' | 'connected' | 'demo'>('connecting');
  const [health, setHealth] = useState<EnterpriseHealth | null>(null);
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResult | null>(null);
  const [knowledgeTools, setKnowledgeTools] = useState<KnowledgeToolDeclaration[]>([]);
  const [lastExecutedTool, setLastExecutedTool] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('运营制度');
  const [uploadOwner, setUploadOwner] = useState('当前部门');
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadScope, setUploadScope] = useState<'tenant' | 'role' | 'org' | 'private'>('tenant');
  const [notice, setNotice] = useState('');
  const [selectedFile, setSelectedFile] = useState<SelectedKnowledgeFile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<EnterpriseKnowledgeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('运营制度');
  const [editOwner, setEditOwner] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editScope, setEditScope] = useState<'tenant' | 'role' | 'org' | 'private'>('tenant');

  const visibleDocs = useMemo(() => {
    if (scope === 'all') return docs;
    return docs.filter((doc) => doc.category === scope);
  }, [docs, scope]);

  const selectedDoc = useMemo(
    () => docs.find((doc) => doc.id === selectedId) ?? null,
    [docs, selectedId],
  );
  const hasIndexingDocuments = docs.some((doc) => doc.status === 'indexing');

  const refreshDocuments = useCallback(async () => {
    const [healthResult, items, tools] = await Promise.all([
      enterpriseApi.getHealth(),
      enterpriseApi.listKnowledgeDocuments(),
      enterpriseApi.listKnowledgeToolDeclarations(),
    ]);
    setHealth(healthResult);
    setBackendState(healthResult.status === 'ok' ? 'connected' : 'demo');
    setDocs(items.map(mapBackendDocument));
    setKnowledgeTools(tools);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      enterpriseApi.getHealth(),
      enterpriseApi.listKnowledgeDocuments(),
      enterpriseApi.listKnowledgeToolDeclarations(),
    ])
      .then(([healthResult, items, tools]) => {
        if (cancelled) return;
        setHealth(healthResult);
        setBackendState(healthResult.status === 'ok' ? 'connected' : 'demo');
        setDocs(items.map(mapBackendDocument));
        setKnowledgeTools(tools);
      })
      .catch(() => {
        if (!cancelled) setBackendState('demo');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (backendState !== 'connected' || !hasIndexingDocuments) return;
    const timer = window.setInterval(() => {
      void refreshDocuments()
        .then(async () => {
          if (selectedId && !selectedId.startsWith('doc-')) {
            setSelectedDetail(await enterpriseApi.getKnowledgeDocument(selectedId));
          }
        })
        .catch(() => setBackendState('demo'));
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [backendState, hasIndexingDocuments, refreshDocuments, selectedId]);

  const handleSearch = async () => {
    try {
      const categories = scope === 'all' ? undefined : [scope];
      const execution = await enterpriseApi.executeKnowledgeTool({ query, categories, topK: 4 });
      setSearchResult(execution.result);
      setLastExecutedTool(execution.toolName);
      setBackendState('connected');
    } catch {
      setBackendState('demo');
      setSearchResult(null);
      setLastExecutedTool(null);
    }
  };

  const buildVisibility = (visibilityScope = uploadScope) => {
    if (visibilityScope === 'role') {
      return { scopeType: 'role', roleIds: ['platform-admin', 'business-owner'] };
    }
    if (visibilityScope === 'org') {
      return { scopeType: 'org', orgIds: ['headquarters'] };
    }
    if (visibilityScope === 'private') {
      return { scopeType: 'private', userIds: ['demo-user'] };
    }
    return { scopeType: 'tenant' };
  };

  const loadDocumentDetail = async (documentId: string) => {
    setSelectedId(documentId);
    setEditing(false);
    setDeleteArmed(false);
    if (documentId.startsWith('doc-')) {
      setSelectedDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const detail = await enterpriseApi.getKnowledgeDocument(documentId);
      setSelectedDetail(detail);
    } catch (error) {
      setSelectedDetail(null);
      setNotice(`读取文档失败：${error instanceof Error ? error.message : '后端不可用'}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const beginEditing = async () => {
    if (!selectedDoc) return;
    let detail = selectedDetail;
    if (!detail && !selectedDoc.id.startsWith('doc-')) {
      setDetailLoading(true);
      try {
        detail = await enterpriseApi.getKnowledgeDocument(selectedDoc.id);
        setSelectedDetail(detail);
      } catch (error) {
        setNotice(`读取文档失败：${error instanceof Error ? error.message : '后端不可用'}`);
        return;
      } finally {
        setDetailLoading(false);
      }
    }
    setEditTitle(detail?.title ?? selectedDoc.title);
    setEditCategory(detail?.category ?? selectedDoc.category);
    setEditOwner(detail?.ownerDepartment ?? selectedDoc.owner);
    setEditSummary(detail?.summary ?? selectedDoc.summary ?? '');
    setEditContent(detail?.content ?? '');
    const scopeType = detail?.visibility.scopeType;
    setEditScope(scopeType === 'role' || scopeType === 'org' || scopeType === 'private' ? scopeType : 'tenant');
    setEditing(true);
  };

  const saveDocument = async () => {
    if (!selectedDoc || selectedDoc.id.startsWith('doc-')) {
      setNotice('演示文档不能修改，请先连接后端或上传一份新知识。');
      return;
    }
    setActionBusy(true);
    try {
      const contentChanged = editContent.trim() !== (selectedDetail?.content ?? '').trim();
      const detail = await enterpriseApi.updateKnowledgeDocument(selectedDoc.id, {
        title: editTitle,
        category: editCategory,
        ownerDepartment: editOwner,
        summary: editSummary,
        visibility: buildVisibility(editScope),
        ...(contentChanged ? { content: editContent } : {}),
      });
      setSelectedDetail(detail);
      setDocs((current) => current.map((doc) => doc.id === selectedDoc.id ? mapBackendDocument(detail) : doc));
      setEditing(false);
      setNotice(contentChanged ? '文档已更新并重新建立索引。' : '文档信息与权限已更新。');
    } catch (error) {
      setNotice(`保存失败：${error instanceof Error ? error.message : '后端不可用'}`);
    } finally {
      setActionBusy(false);
    }
  };

  const runDocumentAction = async (action: 'reindex' | 'archive' | 'restore' | 'delete') => {
    if (!selectedDoc || selectedDoc.id.startsWith('doc-')) {
      setNotice('演示文档没有后端记录，不能执行此操作。');
      return;
    }
    setActionBusy(true);
    try {
      if (action === 'delete') {
        await enterpriseApi.deleteKnowledgeDocument(selectedDoc.id);
        setDocs((current) => current.filter((doc) => doc.id !== selectedDoc.id));
        setSelectedId(null);
        setSelectedDetail(null);
        setNotice('知识文档及其索引已删除。');
        return;
      }
      if (action === 'reindex') {
        const run = await enterpriseApi.startKnowledgeIngestion(selectedDoc.id);
        if (run.status === 'failed') throw new Error('后端未能完成索引，请检查文档正文。');
        setNotice('重新索引任务已进入后台队列。');
      } else if (action === 'archive') {
        await enterpriseApi.archiveKnowledgeDocument(selectedDoc.id);
        setNotice('文档已归档，不再参与知识检索。');
      } else {
        await enterpriseApi.restoreKnowledgeDocument(selectedDoc.id);
        setNotice('文档已恢复并重新参与检索。');
      }
      await refreshDocuments();
      await loadDocumentDetail(selectedDoc.id);
    } catch (error) {
      setNotice(`操作失败：${error instanceof Error ? error.message : '后端不可用'}`);
    } finally {
      setActionBusy(false);
      setDeleteArmed(false);
    }
  };

  const handleFilePick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
      setNotice('文件超过 8 MB，请拆分后上传。');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const base64 = await fileToBase64(file);
    setSelectedFile({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      base64,
    });
    setUploadTitle((current) => current || file.name.replace(/\.[^.]+$/, ''));
    setUploadSummary((current) => current || `从 ${file.name} 上传的企业内部知识文档。`);
    if (TEXT_FILE_EXTENSIONS.has(extension)) {
      setUploadContent(await file.text());
      setNotice(`已读取 ${file.name}，可在发布前检查或修改正文。`);
    } else {
      setUploadContent('');
      setNotice(`已选择 ${file.name}，发布后由后端提取正文并建立索引。`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitKnowledge = async () => {
    const title = uploadTitle.trim();
    const content = uploadContent.trim();
    if (!title || (!content && !selectedFile)) {
      setNotice('请填写标题和知识正文，或选择一个支持的知识文件。');
      return;
    }

    setUploading(true);
    setNotice('正在发布并建立检索索引...');
    const optimistic: KnowledgeDoc = {
      id: `doc-upload-${Date.now()}`,
      title,
      owner: uploadOwner || '当前部门',
      scope: uploadScope === 'tenant' ? '全员可见' : '按权限可见',
      category: uploadCategory,
      chunks: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
      status: 'indexing',
    };
    setDocs((current) => [optimistic, ...current]);

    try {
      const document = selectedFile
        ? await enterpriseApi.importKnowledgeDocument({
          filename: selectedFile.name,
          mimeType: selectedFile.mimeType,
          fileBase64: selectedFile.base64,
          title,
          category: uploadCategory,
          ownerDepartment: uploadOwner || '当前部门',
          summary: uploadSummary || undefined,
          visibility: buildVisibility(),
        })
        : await enterpriseApi.createKnowledgeDocument({
          title,
          category: uploadCategory,
          ownerDepartment: uploadOwner || '当前部门',
          sourceUri: 'local-text-upload://knowledge-center',
          summary: uploadSummary || content.slice(0, 120),
          content,
          visibility: buildVisibility(),
        });
      setDocs((current) => [
        mapBackendDocument(document),
        ...current.filter((doc) => doc.id !== optimistic.id),
      ]);
      setUploadTitle('');
      setUploadSummary('');
      setUploadContent('');
      setSelectedFile(null);
      setNotice('知识已保存，解析和索引任务已进入后台队列。');
      setBackendState('connected');
      void refreshDocuments();
    } catch (error) {
      setDocs((current) => current.map((doc) => doc.id === optimistic.id ? { ...doc, status: 'failed' } : doc));
      setBackendState('demo');
      setNotice(`发布失败：${error instanceof Error ? error.message : '后端不可用'}`);
    } finally {
      setUploading(false);
    }
  };

  const answerDraft = searchResult?.answerDraft
    ?? '优先检查工单 SLA，超过 24 小时需自动提醒责任部门；若影响企业办公，升级为高优先级并同步园区负责人。';

  return (
    <div data-testid="knowledge-page" className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden -m-6 bg-background">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-8 py-8">
        <header className="mb-6 flex shrink-0 items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-3 py-1 text-xs font-medium text-sky-700">
              <BookOpenText className="h-3.5 w-3.5" />
              企业知识库
            </div>
            <Badge variant="outline" className="ml-2 border-sky-100 bg-white text-2xs text-sky-700">
              {backendState === 'connected' ? '后端已连接' : backendState === 'connecting' ? '连接后端中' : '演示数据'}
            </Badge>
            <Badge
              data-testid="knowledge-skill-status"
              variant="outline"
              className={cn(
                'ml-2 bg-white text-2xs',
                knowledgeTools.length > 0 ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-500',
              )}
            >
              {knowledgeTools.length > 0 ? '知识问答 Skill 已就绪' : '知识问答 Skill 演示模式'}
            </Badge>
            {health && (
              <Badge variant="outline" className="ml-2 border-slate-200 bg-white text-2xs text-slate-600">
                知识 {health.collections.knowledgeDocuments} · 队列 {health.collections.knowledgeIngestionQueued ?? 0} · 审计 {health.collections.auditEvents}
              </Badge>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">知识资产中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              统一管理制度、SOP、合同规则、政策材料和历史案例，按组织权限检索，并在回答中返回来源。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={fileInputRef}
              data-testid="knowledge-file-input"
              type="file"
              accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.markdown,.json,.log"
              className="hidden"
              onChange={(event) => {
                void handleFilePick(event.target.files);
              }}
            />
            <Button
              data-testid="knowledge-upload-button"
              className="h-9 rounded-full px-4 text-meta font-medium shadow-none"
              onClick={() => setUploadOpen((current) => !current)}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploadOpen ? '收起上传' : '上传知识'}
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-full border-sky-100 px-3 text-meta font-medium shadow-none"
              onClick={() => {
                void refreshDocuments().catch(() => setBackendState('demo'));
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-9 rounded-full border-sky-100 bg-white pl-9 shadow-sm shadow-sky-950/5"
                  placeholder="测试知识库检索..."
                />
              </div>
              <div className="flex w-52 items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={scope} onChange={(event) => setScope(event.target.value)} className="h-9 rounded-full border-sky-100 bg-white">
                  <option value="all">全部分类</option>
                  <option value="运营制度">运营制度</option>
                  <option value="合同规则">合同规则</option>
                  <option value="政策服务">政策服务</option>
                  <option value="企业资料">企业资料</option>
                  <option value="园区资料">园区资料</option>
                </Select>
              </div>
              <Button variant="outline" className="h-9 rounded-full border-sky-100 px-4 text-xs shadow-none" onClick={handleSearch}>
                检索
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-sky-100 bg-white/80">
              {visibleDocs.length === 0 && (
                <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
                  <BookOpenText className="mb-3 h-8 w-8 text-sky-300" />
                  <p className="text-sm font-medium text-slate-700">当前分类暂无知识文档</p>
                  <p className="mt-1 text-xs text-slate-500">上传制度、SOP 或业务资料后即可建立检索索引。</p>
                </div>
              )}
              {visibleDocs.map((doc) => (
                <article
                  key={doc.id}
                  data-testid={`knowledge-document-${doc.id}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-4 border-b border-sky-50 px-5 py-4 transition-colors last:border-b-0 hover:bg-sky-50/45',
                    selectedId === doc.id && 'bg-sky-50/80',
                  )}
                  onClick={() => void loadDocumentDetail(doc.id)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-foreground">{doc.title}</h2>
                      <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-medium', statusClassName[doc.status])}>
                        {statusLabel[doc.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {doc.owner} · {doc.category} · {doc.chunks} 个片段 · 更新于 {doc.updatedAt}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <LockKeyhole className="h-3.5 w-3.5 text-sky-600" />
                      {doc.scope}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="h-8 rounded-full border-sky-100 px-3 text-xs shadow-none"
                    onClick={(event) => {
                      event.stopPropagation();
                      void loadDocumentDetail(doc.id);
                    }}
                  >
                    查看
                  </Button>
                </article>
              ))}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            {uploadOpen && (
              <section className="rounded-lg border border-sky-100 bg-white/90 p-4 shadow-sm shadow-sky-950/5">
                <div className="mb-3 flex items-center gap-2">
                  <Upload className="h-4 w-4 text-sky-600" />
                  <h2 className="text-sm font-semibold text-foreground">发布知识并索引</h2>
                </div>
                <div className="grid gap-2">
                  <Input
                    data-testid="knowledge-upload-title"
                    value={uploadTitle}
                    onChange={(event) => setUploadTitle(event.target.value)}
                    className="h-9 border-sky-100 bg-white"
                    placeholder="知识标题，例如：园区空调报修处理规范"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)} className="h-9 border-sky-100 bg-white">
                      <option value="运营制度">运营制度</option>
                      <option value="合同规则">合同规则</option>
                      <option value="政策服务">政策服务</option>
                      <option value="企业资料">企业资料</option>
                      <option value="园区资料">园区资料</option>
                    </Select>
                    <Select value={uploadScope} onChange={(event) => setUploadScope(event.target.value as typeof uploadScope)} className="h-9 border-sky-100 bg-white">
                      <option value="tenant">全员可见</option>
                      <option value="role">平台/业务负责人</option>
                      <option value="org">总部组织</option>
                      <option value="private">仅当前用户</option>
                    </Select>
                  </div>
                  <Input
                    value={uploadOwner}
                    onChange={(event) => setUploadOwner(event.target.value)}
                    className="h-9 border-sky-100 bg-white"
                    placeholder="归属部门"
                  />
                  <Textarea
                    value={uploadSummary}
                    onChange={(event) => setUploadSummary(event.target.value)}
                    className="min-h-[58px] resize-none border-sky-100 bg-white text-sm"
                    placeholder="摘要，可不填，默认从正文生成"
                  />
                  <Textarea
                    data-testid="knowledge-upload-content"
                    value={uploadContent}
                    onChange={(event) => setUploadContent(event.target.value)}
                    className="min-h-[126px] resize-none border-sky-100 bg-sky-50/40 text-sm leading-6"
                    placeholder={selectedFile && !TEXT_FILE_EXTENSIONS.has(selectedFile.name.split('.').pop()?.toLowerCase() ?? '')
                      ? '该文件由后端解析，发布后可在文档详情中查看提取正文。'
                      : '粘贴制度、SOP、政策、合同规则等正文，或点击下方选择文件。'}
                    disabled={Boolean(selectedFile && !TEXT_FILE_EXTENSIONS.has(selectedFile.name.split('.').pop()?.toLowerCase() ?? ''))}
                  />
                  {selectedFile && (
                    <div data-testid="knowledge-selected-file" className="flex items-center gap-3 rounded-md border border-sky-100 bg-sky-50/60 px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-sky-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-700">{selectedFile.name}</p>
                        <p className="mt-0.5 text-2xs text-slate-400">{formatFileSize(selectedFile.size)} · 发布后自动解析与索引</p>
                      </div>
                      <button
                        type="button"
                        title="移除文件"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                        onClick={() => {
                          setSelectedFile(null);
                          setNotice('已移除待上传文件，可以粘贴正文或重新选择。');
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="h-8 rounded-full border-sky-100 px-3 text-xs shadow-none" onClick={() => fileInputRef.current?.click()}>
                      选择文件
                    </Button>
                    <Button data-testid="knowledge-publish-button" className="h-8 rounded-full px-3 text-xs shadow-none" disabled={uploading} onClick={submitKnowledge}>
                      {uploading ? '发布中...' : '发布并索引'}
                    </Button>
                  </div>
                  <p className="text-2xs leading-5 text-slate-400">支持 PDF、DOCX、XLSX、CSV、Markdown 和文本，单文件不超过 8 MB；扫描版 PDF 暂不支持 OCR。</p>
                  {notice && <p className="text-xs leading-5 text-slate-500">{notice}</p>}
                </div>
              </section>
            )}

            {selectedDoc && (
              <section data-testid="knowledge-detail-panel" className="rounded-lg border border-sky-100 bg-white/90 p-4 shadow-sm shadow-sky-950/5">
                {detailLoading ? (
                  <div className="flex h-32 items-center justify-center text-xs text-slate-500">
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-sky-600" />
                    正在读取文档
                  </div>
                ) : editing ? (
                  <div className="grid gap-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-foreground">编辑知识文档</h2>
                      <Badge variant="outline" className="border-sky-100 bg-sky-50 text-2xs text-sky-700">修改后留痕</Badge>
                    </div>
                    <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="h-9 border-sky-100" placeholder="知识标题" />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={editCategory} onChange={(event) => setEditCategory(event.target.value)} className="h-9 border-sky-100 bg-white">
                        <option value="运营制度">运营制度</option>
                        <option value="合同规则">合同规则</option>
                        <option value="政策服务">政策服务</option>
                        <option value="企业资料">企业资料</option>
                        <option value="园区资料">园区资料</option>
                      </Select>
                      <Select value={editScope} onChange={(event) => setEditScope(event.target.value as typeof editScope)} className="h-9 border-sky-100 bg-white">
                        <option value="tenant">全员可见</option>
                        <option value="role">平台/业务负责人</option>
                        <option value="org">总部组织</option>
                        <option value="private">仅当前用户</option>
                      </Select>
                    </div>
                    <Input value={editOwner} onChange={(event) => setEditOwner(event.target.value)} className="h-9 border-sky-100" placeholder="归属部门" />
                    <Textarea value={editSummary} onChange={(event) => setEditSummary(event.target.value)} className="min-h-16 resize-none border-sky-100 text-sm" placeholder="摘要" />
                    <Textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} className="min-h-32 resize-none border-sky-100 bg-sky-50/40 text-sm leading-6" placeholder="知识正文" />
                    <div className="mt-1 flex justify-end gap-2">
                      <Button variant="outline" className="h-8 rounded-full px-3 text-xs" disabled={actionBusy} onClick={() => setEditing(false)}>取消</Button>
                      <Button className="h-8 rounded-full px-3 text-xs" disabled={actionBusy} onClick={saveDocument}>
                        {actionBusy ? '保存中...' : '保存修改'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-sky-600" />
                          <h2 className="truncate text-sm font-semibold text-foreground">{selectedDoc.title}</h2>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{selectedDoc.owner} · {selectedDoc.category}</p>
                      </div>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium', statusClassName[selectedDoc.status])}>
                        {statusLabel[selectedDoc.status]}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-y border-sky-50 py-3 text-xs">
                      <div><span className="text-slate-400">检索片段</span><strong className="ml-2 font-medium text-slate-700">{selectedDoc.chunks}</strong></div>
                      <div><span className="text-slate-400">估算 Token</span><strong className="ml-2 font-medium text-slate-700">{selectedDoc.tokens ?? 0}</strong></div>
                    </div>
                    <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-600">
                      <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
                      {selectedDoc.scope}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-600">
                      {selectedDetail?.summary || selectedDoc.summary || '暂无摘要。'}
                    </p>
                    {selectedDetail?.content && (
                      <div className="mt-3 max-h-28 overflow-y-auto rounded-md bg-sky-50/55 px-3 py-2 text-xs leading-5 text-slate-600">
                        {selectedDetail.content}
                      </div>
                    )}
                    {selectedDetail?.sourceFileName && (
                      <p className="mt-2 text-2xs text-slate-400">
                        来源文件：{selectedDetail.sourceFileName} · {formatFileSize(selectedDetail.sourceFileSize ?? 0)} · {selectedDetail.parserName || '自动解析'}
                      </p>
                    )}
                    {selectedDetail?.ingestionRuns?.[0] && (
                      <p className="mt-2 text-2xs text-slate-400">
                        最近索引：{formatIngestionStatus(selectedDetail.ingestionRuns[0].status)}
                        {' · '}{selectedDetail.ingestionRuns[0].chunksCreated ?? 0} 个片段
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" className="h-8 rounded-full border-sky-100 px-3 text-xs" disabled={actionBusy} onClick={() => void beginEditing()}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />编辑
                      </Button>
                      <Button variant="outline" className="h-8 rounded-full border-sky-100 px-3 text-xs" disabled={actionBusy || selectedDoc.status === 'indexing'} onClick={() => void runDocumentAction('reindex')}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />重新索引
                      </Button>
                      <Button variant="outline" className="h-8 rounded-full border-sky-100 px-3 text-xs" disabled={actionBusy} onClick={() => void runDocumentAction(selectedDoc.status === 'archived' ? 'restore' : 'archive')}>
                        {selectedDoc.status === 'archived' ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> : <Archive className="mr-1.5 h-3.5 w-3.5" />}
                        {selectedDoc.status === 'archived' ? '恢复' : '归档'}
                      </Button>
                      <Button
                        variant="outline"
                        className={cn('h-8 rounded-full px-3 text-xs', deleteArmed ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-100')}
                        disabled={actionBusy || selectedDoc.status === 'indexing'}
                        onClick={() => deleteArmed ? void runDocumentAction('delete') : setDeleteArmed(true)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />{deleteArmed ? '再次确认删除' : '删除'}
                      </Button>
                    </div>
                  </>
                )}
              </section>
            )}

            {!selectedDoc && !uploadOpen && (
              <section className="rounded-lg border border-sky-100 bg-white/82 p-4 shadow-sm shadow-sky-950/5">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-sky-600" />
                  <h2 className="text-sm font-semibold text-foreground">知识治理规则</h2>
                </div>
                <div className="space-y-3 text-sm">
                  <PolicyRow label="总部制度" value="全员可见，只读" />
                  <PolicyRow label="合同规则" value="招商/法务可见" />
                  <PolicyRow label="园区资料" value="按组织与园区隔离" />
                </div>
              </section>
            )}

            <section className="rounded-lg border border-sky-100 bg-white/82 p-4 shadow-sm shadow-sky-950/5">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-sky-600" />
                <h2 className="text-sm font-semibold text-foreground">检索回答预览</h2>
              </div>
              <div data-testid="knowledge-skill-call-chain" className="mb-3 flex items-center gap-2 rounded-md border border-sky-100 bg-sky-50/55 px-3 py-2 text-2xs text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                <span className="font-medium text-slate-700">知识问答 Skill</span>
                <span className="text-slate-300">→</span>
                <span>权限过滤</span>
                <span className="text-slate-300">→</span>
                <span>来源引用</span>
                {lastExecutedTool && <span className="ml-auto text-emerald-600">已调用</span>}
              </div>
              <p className="text-xs font-medium text-slate-500">{searchResult?.query ?? query}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{answerDraft}</p>
              <div className="mt-3 border-t border-sky-50 pt-3">
                <p className="mb-2 text-2xs font-medium uppercase text-slate-400">来源证据</p>
                {searchResult?.citations.length ? searchResult.citations.map((citation, index) => (
                  <button
                    key={citation.chunkId || `${citation.documentId}-${index}`}
                    type="button"
                    className="mb-2 w-full rounded-md bg-sky-50/65 px-3 py-2 text-left transition-colors hover:bg-sky-100/70"
                    onClick={() => void loadDocumentDetail(citation.documentId)}
                  >
                    <span className="block text-xs font-medium text-slate-700">{index + 1}. {citation.title}</span>
                    {citation.snippet && <span className="mt-1 line-clamp-2 block text-2xs leading-5 text-slate-500">{citation.snippet}</span>}
                  </button>
                )) : (
                  <p className="text-xs text-slate-400">执行检索后将在这里展示命中文档和原文片段。</p>
                )}
              </div>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-sky-50/70 px-3 py-2">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <Badge variant="outline" className="border-sky-200 bg-white text-2xs text-sky-700">
        {value}
      </Badge>
    </div>
  );
}

function formatIngestionStatus(status: EnterpriseKnowledgeDetail['ingestionRuns'][number]['status']) {
  const labels = {
    queued: '排队中',
    parsing: '解析中',
    embedding: '建立索引中',
    completed: '已完成',
    failed: '处理失败',
  } as const;
  return labels[status];
}

export default Knowledge;

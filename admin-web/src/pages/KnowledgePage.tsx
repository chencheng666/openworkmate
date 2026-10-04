import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpenCheck,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  FileText,
  Filter,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { adminApi, entityId } from '../api';
import { EmptyBlock, ErrorBanner, LoadingBlock, Modal } from '../components/Feedback';
import type {
  KnowledgeDetail,
  KnowledgeDocument,
  KnowledgeSearchResult,
  KnowledgeStatus,
  VisibilityRule,
  VisibilityScope,
} from '../types';

const statusMeta: Record<KnowledgeStatus, { label: string; className: string }> = {
  ready: { label: '可用', className: 'status-ready' },
  indexing: { label: '处理中', className: 'status-indexing' },
  draft: { label: '草稿', className: 'status-draft' },
  archived: { label: '已归档', className: 'status-archived' },
  failed: { label: '处理失败', className: 'status-failed' },
};

const scopeLabels: Record<VisibilityScope, string> = {
  tenant: '全集团可见',
  org: '指定组织',
  role: '指定角色',
  park: '指定园区',
  private: '指定人员',
};

const inputClassName = 'form-control';

function formatDate(value?: string) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

function formatBytes(value?: number) {
  if (!value) return '--';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function splitIds(value: string) {
  return value.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function scopeIds(visibility: VisibilityRule) {
  const values = visibility.orgIds || visibility.roleIds || visibility.parkIds || visibility.userIds || [];
  return values.join(', ');
}

function createVisibility(scopeType: VisibilityScope, values: string): VisibilityRule {
  const ids = splitIds(values);
  if (scopeType === 'org') return { scopeType, orgIds: ids };
  if (scopeType === 'role') return { scopeType, roleIds: ids };
  if (scopeType === 'park') return { scopeType, parkIds: ids };
  if (scopeType === 'private') return { scopeType, userIds: ids };
  return { scopeType };
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return window.btoa(binary);
}

export function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [documentQuery, setDocumentQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | KnowledgeStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const loadDocuments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await adminApi.knowledge.list();
      setDocuments(next);
      setError('');
      if (!selectedId && next.length > 0) setSelectedId(entityId(next[0]));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '知识文档加载失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (id: string, silent = false) => {
    if (!id) return;
    if (!silent) setDetailLoading(true);
    try {
      const next = await adminApi.knowledge.get(id);
      setDetail(next);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文档详情加载失败');
      setDetail(null);
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [loadDetail, selectedId]);

  useEffect(() => {
    if (!documents.some((item) => item.status === 'indexing')) return;
    const timer = window.setInterval(() => {
      void loadDocuments(true);
      if (selectedId) void loadDetail(selectedId, true);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [documents, loadDetail, loadDocuments, selectedId]);

  const categories = useMemo(() => Array.from(new Set(documents.map((item) => item.category))).sort(), [documents]);
  const filteredDocuments = useMemo(() => documents.filter((document) => {
    const keyword = documentQuery.trim().toLowerCase();
    const matchesKeyword = !keyword || [document.title, document.category, document.ownerDepartment, document.summary]
      .some((value) => value?.toLowerCase().includes(keyword));
    const matchesStatus = statusFilter === 'all' || document.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || document.category === categoryFilter;
    return matchesKeyword && matchesStatus && matchesCategory;
  }), [categoryFilter, documentQuery, documents, statusFilter]);

  const totals = useMemo(() => ({
    all: documents.length,
    ready: documents.filter((item) => item.status === 'ready').length,
    indexing: documents.filter((item) => item.status === 'indexing').length,
    failed: documents.filter((item) => item.status === 'failed').length,
  }), [documents]);

  const refreshAll = async () => {
    await loadDocuments();
    if (selectedId) await loadDetail(selectedId);
  };

  const runAction = async (action: () => Promise<unknown>, after?: () => void) => {
    setActionBusy(true);
    try {
      await action();
      after?.();
      await refreshAll();
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setActionBusy(false);
    }
  };

  const runSearch = async (value: string) => {
    if (value.trim().length < 2) return;
    setSearching(true);
    setSearchOpen(true);
    try {
      setSearchResult(await adminApi.knowledge.search(value.trim(), categoryFilter === 'all' ? undefined : [categoryFilter]));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '知识检索失败');
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="page-stack knowledge-page" data-testid="admin-knowledge-page">
      <section className="page-heading compact-heading">
        <div>
          <div className="eyebrow"><BookOpenCheck size={14} />企业知识资产</div>
          <h1>企业知识库</h1>
          <p>统一管理制度、SOP、合同规则和园区资料，并按组织身份为数智员工提供可信引用。</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => void refreshAll()}><RefreshCw size={16} />刷新</button>
          <button className="button primary" data-testid="admin-knowledge-upload" onClick={() => setUploadOpen(true)}><Plus size={16} />上传知识</button>
        </div>
      </section>

      {error && <ErrorBanner message={error} onClose={() => setError('')} />}

      <section className="knowledge-metrics">
        <div><span>知识总量</span><strong>{totals.all}</strong><small>份企业文档</small></div>
        <div><span>可检索</span><strong>{totals.ready}</strong><small>已完成索引</small></div>
        <div><span>处理中</span><strong>{totals.indexing}</strong><small>异步解析与切片</small></div>
        <div><span>异常任务</span><strong>{totals.failed}</strong><small>需要管理员处理</small></div>
      </section>

      <section className="panel search-console">
        <div className="search-console-copy"><FileSearch size={21} /><div><strong>验证知识检索效果</strong><span>使用与桌面端数智员工相同的权限过滤与引用链路。</span></div></div>
        <form onSubmit={(event) => { event.preventDefault(); void runSearch(searchQuery); }}>
          <Search size={17} />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="输入问题，例如：园区报修超时后如何升级？" />
          <button className="button primary" disabled={searchQuery.trim().length < 2 || searching}>{searching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}检索</button>
        </form>
      </section>

      <section className="knowledge-workspace">
        <div className="panel document-list-panel">
          <div className="list-toolbar">
            <div className="inline-search"><Search size={16} /><input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="搜索标题、分类或部门" /></div>
            <div className="filter-row">
              <label><Filter size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">全部状态</option>{Object.entries(statusMeta).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></label>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">全部分类</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select>
            </div>
          </div>
          <div className="document-list">
            {loading ? <LoadingBlock label="正在加载知识文档" /> : filteredDocuments.length === 0 ? <EmptyBlock title="没有匹配的知识文档" description="调整筛选条件，或上传第一份企业知识。" /> : filteredDocuments.map((document) => {
              const id = entityId(document);
              const meta = statusMeta[document.status];
              return (
                <button className={`document-row ${selectedId === id ? 'is-selected' : ''}`} key={id} onClick={() => setSelectedId(id)}>
                  <div className="document-type-icon"><FileText size={18} /></div>
                  <div className="document-row-copy"><div><strong>{document.title}</strong><span className={`status-pill ${meta.className}`}>{meta.label}</span></div><p>{document.summary || '暂无摘要'}</p><small>{document.category} · {document.ownerDepartment} · {formatDate(document.updatedAt)}</small></div>
                  <div className="document-row-stats"><strong>{document.chunksCount || 0}</strong><span>知识片段</span></div>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </div>

        <aside className="panel document-detail-panel">
          {detailLoading ? <LoadingBlock label="正在读取文档详情" /> : !detail ? <EmptyBlock title="选择一份知识文档" description="查看正文、权限、索引历史和治理操作。" /> : (
            <>
              <div className="detail-heading">
                <div className="document-type-icon large"><BookOpenText size={20} /></div>
                <div><span>{detail.category}</span><h2>{detail.title}</h2><p>{detail.summary || '暂无摘要'}</p></div>
              </div>
              <div className="detail-actions">
                <button className="button secondary" onClick={() => setEditOpen(true)}><Pencil size={15} />编辑</button>
                <button className="button secondary" disabled={actionBusy || detail.status === 'indexing'} onClick={() => void runAction(() => adminApi.knowledge.reindex(entityId(detail)))}><RotateCcw size={15} />重建索引</button>
                {detail.status === 'archived' ? (
                  <button className="button secondary" disabled={actionBusy} onClick={() => void runAction(() => adminApi.knowledge.restore(entityId(detail)))}><RefreshCw size={15} />恢复</button>
                ) : (
                  <button className="button secondary" disabled={actionBusy || detail.status === 'indexing'} onClick={() => void runAction(() => adminApi.knowledge.archive(entityId(detail)))}><Archive size={15} />归档</button>
                )}
                <button className="button danger-ghost" disabled={actionBusy || detail.status === 'indexing'} onClick={() => {
                  if (!window.confirm(`确认删除“${detail.title}”？文档、切片和索引记录将一并删除。`)) return;
                  void runAction(() => adminApi.knowledge.delete(entityId(detail)), () => { setSelectedId(''); setDetail(null); });
                }}><Trash2 size={15} />删除</button>
              </div>
              <div className="detail-meta-grid">
                <div><span>状态</span><strong className={`status-pill ${statusMeta[detail.status].className}`}>{statusMeta[detail.status].label}</strong></div>
                <div><span>归属部门</span><strong>{detail.ownerDepartment}</strong></div>
                <div><span>可见范围</span><strong>{scopeLabels[detail.visibility.scopeType]}</strong><small>{scopeIds(detail.visibility)}</small></div>
                <div><span>索引规模</span><strong>{detail.chunksCount || 0} 个片段</strong><small>约 {detail.tokensEstimate || 0} tokens</small></div>
                <div><span>来源文件</span><strong>{detail.sourceFileName || '在线录入'}</strong><small>{formatBytes(detail.sourceFileSize)}</small></div>
                <div><span>最后更新</span><strong>{formatDate(detail.updatedAt)}</strong><small>{detail.parserName || 'text'}</small></div>
              </div>
              <section className="detail-section"><div className="section-title"><FileText size={16} /><strong>知识正文</strong></div><pre className="knowledge-content">{detail.content || '正文正在异步解析，请稍后刷新。'}</pre></section>
              <section className="detail-section"><div className="section-title"><RefreshCw size={16} /><strong>索引记录</strong></div><div className="run-list">
                {detail.ingestionRuns.length === 0 ? <span className="muted">暂无索引记录</span> : detail.ingestionRuns.map((run) => <div key={entityId(run)}><span className={`run-dot is-${run.status}`} /><div><strong>{run.status === 'completed' ? '索引完成' : run.status === 'failed' ? '索引失败' : '正在处理'}</strong><small>{formatDate(run.updatedAt || run.createdAt)} · {run.trigger || 'manual'} · 第 {run.attempts || 0} 次执行</small>{run.errorMessage && <p>{run.errorMessage}</p>}</div><span>{run.chunksCreated || 0} 片段</span></div>)}
              </div></section>
            </>
          )}
        </aside>
      </section>

      {uploadOpen && <KnowledgeEditorModal mode="create" categories={categories} onClose={() => setUploadOpen(false)} onSaved={async (id) => { setUploadOpen(false); await loadDocuments(); setSelectedId(id); }} />}
      {editOpen && detail && <KnowledgeEditorModal mode="edit" document={detail} categories={categories} onClose={() => setEditOpen(false)} onSaved={async (id) => { setEditOpen(false); await loadDocuments(); setSelectedId(id); await loadDetail(id); }} />}
      {searchOpen && <SearchResultModal query={searchQuery} searching={searching} result={searchResult} onClose={() => setSearchOpen(false)} onSelect={(id) => { setSearchOpen(false); setSelectedId(id); }} />}
    </div>
  );
}

function KnowledgeEditorModal({ mode, document, categories, onClose, onSaved }: {
  mode: 'create' | 'edit';
  document?: KnowledgeDetail;
  categories: string[];
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [sourceMode, setSourceMode] = useState<'file' | 'text'>(mode === 'edit' ? 'text' : 'file');
  const [title, setTitle] = useState(document?.title || '');
  const [category, setCategory] = useState(document?.category || '运营制度');
  const [ownerDepartment, setOwnerDepartment] = useState(document?.ownerDepartment || '园区运营中心');
  const [summary, setSummary] = useState(document?.summary || '');
  const [content, setContent] = useState(document?.content || '');
  const [scope, setScope] = useState<VisibilityScope>(document?.visibility.scopeType || 'tenant');
  const [ids, setIds] = useState(document ? scopeIds(document.visibility) : '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !category.trim() || !ownerDepartment.trim()) return setError('标题、分类和归属部门不能为空。');
    if (scope !== 'tenant' && splitIds(ids).length === 0) return setError('请填写可见范围对应的组织、角色、园区或人员 ID。');
    if (mode === 'create' && sourceMode === 'file' && !file) return setError('请选择需要上传的文件。');
    if (sourceMode === 'text' && !content.trim()) return setError('知识正文不能为空。');
    if (file && file.size > 8 * 1024 * 1024) return setError('单个知识文件不能超过 8 MB。');

    setBusy(true);
    setError('');
    try {
      const visibility = createVisibility(scope, ids);
      let saved: KnowledgeDetail;
      if (mode === 'edit' && document) {
        saved = await adminApi.knowledge.update(entityId(document), {
          title: title.trim(), category: category.trim(), ownerDepartment: ownerDepartment.trim(), summary: summary.trim(),
          ...(content.trim() !== document.content.trim() ? { content: content.trim() } : {}), visibility,
        });
      } else if (sourceMode === 'file' && file) {
        saved = await adminApi.knowledge.import({
          filename: file.name, mimeType: file.type, fileBase64: await fileToBase64(file), title: title.trim(), category: category.trim(),
          ownerDepartment: ownerDepartment.trim(), summary: summary.trim(), visibility,
        });
      } else {
        saved = await adminApi.knowledge.create({
          title: title.trim(), category: category.trim(), ownerDepartment: ownerDepartment.trim(), summary: summary.trim(), content: content.trim(), visibility,
        });
      }
      await onSaved(entityId(saved));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存知识文档失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? '上传企业知识' : '编辑知识文档'} subtitle="上传后由异步任务完成解析、切片与索引，权限在检索阶段实时生效。" onClose={onClose} wide>
      <form className="knowledge-editor" onSubmit={(event) => void submit(event)}>
        {error && <ErrorBanner message={error} onClose={() => setError('')} />}
        {mode === 'create' && <div className="segmented-control"><button type="button" className={sourceMode === 'file' ? 'is-active' : ''} onClick={() => setSourceMode('file')}><UploadCloud size={16} />上传文件</button><button type="button" className={sourceMode === 'text' ? 'is-active' : ''} onClick={() => setSourceMode('text')}><FileText size={16} />在线录入</button></div>}
        <div className="form-grid two-columns">
          <label><span>知识标题 <b>*</b></span><input className={inputClassName} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：园区报修处理 SOP" /></label>
          <label><span>知识分类 <b>*</b></span><input className={inputClassName} value={category} onChange={(event) => setCategory(event.target.value)} list="knowledge-categories" /><datalist id="knowledge-categories">{categories.map((item) => <option value={item} key={item} />)}</datalist></label>
          <label><span>归属部门 <b>*</b></span><input className={inputClassName} value={ownerDepartment} onChange={(event) => setOwnerDepartment(event.target.value)} /></label>
          <label><span>可见范围 <b>*</b></span><select className={inputClassName} value={scope} onChange={(event) => setScope(event.target.value as VisibilityScope)}>{Object.entries(scopeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        {scope !== 'tenant' && <label><span>{scopeLabels[scope]} ID <b>*</b></span><input className={inputClassName} value={ids} onChange={(event) => setIds(event.target.value)} placeholder="多个 ID 使用逗号分隔" /></label>}
        <label><span>摘要</span><textarea className={inputClassName} rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="说明这份知识解决什么问题，便于管理员识别。" /></label>
        {mode === 'create' && sourceMode === 'file' ? (
          <label className={`file-drop ${file ? 'has-file' : ''}`}><input type="file" accept=".pdf,.docx,.xlsx,.csv,.md,.markdown,.txt,.json,.log" onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, '')); }} /><UploadCloud size={24} /><strong>{file ? file.name : '点击选择或拖入知识文件'}</strong><span>{file ? `${formatBytes(file.size)} · 上传后异步解析` : '支持 PDF、DOCX、XLSX、CSV、Markdown、JSON 和文本，最大 8 MB'}</span></label>
        ) : (
          <label><span>知识正文 <b>*</b></span><textarea className={`${inputClassName} content-editor`} rows={14} value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴制度、流程或业务规则正文..." /></label>
        )}
        <div className="permission-note"><LockKeyhole size={16} /><span><strong>权限会贯穿检索链路。</strong>桌面端数智员工只能检索当前员工有权访问的知识片段，所有查询均记录审计。</span></div>
        <footer className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}{mode === 'create' ? '提交并建立索引' : '保存修改'}</button></footer>
      </form>
    </Modal>
  );
}

function SearchResultModal({ query, searching, result, onClose, onSelect }: {
  query: string;
  searching: boolean;
  result: KnowledgeSearchResult | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Modal title="知识检索验证" subtitle={`问题：${query}`} onClose={onClose} wide>
      <div className="search-results">
        {searching ? <LoadingBlock label="正在执行权限过滤和知识检索" /> : !result ? <EmptyBlock title="没有检索结果" description="请调整问题或检查知识文档索引状态。" /> : (
          <>
            <section className="answer-draft"><div><ShieldCheck size={17} /><strong>基于知识库生成的回答草稿</strong></div><p>{result.answerDraft}</p></section>
            <div className="result-caption"><span>命中 {result.citations.length} 个知识片段</span><small>回答必须保留以下来源引用</small></div>
            <div className="citation-list">{result.citations.map((citation, index) => <button key={citation.chunkId || `${citation.documentId}-${index}`} onClick={() => onSelect(citation.documentId)}><span className="citation-index">{index + 1}</span><div><strong>{citation.title}</strong><small>{citation.category} · 相关度 {Number(citation.score || 0).toFixed(1)}</small><p>{citation.snippet}</p></div><ChevronRight size={16} /></button>)}</div>
          </>
        )}
      </div>
    </Modal>
  );
}

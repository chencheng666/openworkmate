import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Check, CircleAlert, Code2, LoaderCircle, PackageCheck, Plus, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { adminApi, entityId } from '../api';
import { EmptyBlock, ErrorBanner, LoadingBlock, Modal } from '../components/Feedback';
import type { InstalledSkill, SkillSubmission } from '../types';

const manifestTemplate = `{
  "schemaVersion": "1.0",
  "name": "park-ticket-assistant",
  "displayName": "园区工单助手",
  "description": "查询园区工单并生成处置建议",
  "ownerDepartment": "园区运营中心",
  "businessDomain": "园区运营",
  "version": "1.0.0",
  "riskLevel": "low",
  "inputFields": [
    { "name": "parkName", "type": "string", "required": true, "description": "园区名称" }
  ],
  "tools": [
    { "name": "ticketing_query", "description": "查询园区工单", "connectorId": "ticketing-main", "actionKind": "read", "requiredScopes": ["ticket:read"], "riskLevel": "low", "confirmationRequired": false }
  ],
  "promptTemplate": "根据园区和时间范围查询工单，结合 SLA 规则输出处置建议。",
  "outputContract": { "type": "text" },
  "governance": { "dataDomains": ["park_operation"], "allowedRoleIds": ["park-operator"], "humanConfirmation": "on_write", "auditLevel": "standard" }
}`;

const statusLabels: Record<SkillSubmission['status'], string> = {
  draft: '草稿', submitted: '待审核', approved: '已通过', rejected: '已驳回', published: '已发布',
};

export function SkillsPage() {
  const [submissions, setSubmissions] = useState<SkillSubmission[]>([]);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [tab, setTab] = useState<'review' | 'installed'>('review');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSubmissions, nextInstalled] = await Promise.all([adminApi.skills.submissions(), adminApi.skills.installed()]);
      setSubmissions(nextSubmissions);
      setInstalled(nextInstalled);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Skill 数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const pending = useMemo(() => submissions.filter((item) => item.status === 'submitted').length, [submissions]);

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try { await action(); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); } finally { setBusyId(''); }
  };

  return (
    <div className="page-stack" data-testid="admin-skills-page">
      <section className="page-heading compact-heading"><div><div className="eyebrow"><Boxes size={14} />企业能力资产</div><h1>Skill 管理</h1><p>员工提交业务经验，平台完成规范校验、风险审核和发布，最终装配到数智员工。</p></div><div className="heading-actions"><button className="button secondary" onClick={() => void load()}><RefreshCw size={16} />刷新</button><button className="button primary" onClick={() => setSubmitOpen(true)}><Plus size={16} />提交 Skill</button></div></section>
      {error && <ErrorBanner message={error} onClose={() => setError('')} />}
      <section className="metric-grid three"><article className="metric-card"><div className="metric-icon tone-blue"><Send size={19} /></div><div className="metric-label">待审核提交</div><div className="metric-value"><strong>{pending}</strong><span>项</span></div></article><article className="metric-card"><div className="metric-icon tone-green"><PackageCheck size={19} /></div><div className="metric-label">已发布能力</div><div className="metric-value"><strong>{installed.length}</strong><span>项</span></div></article><article className="metric-card"><div className="metric-icon tone-violet"><ShieldCheck size={19} /></div><div className="metric-label">高风险待治理</div><div className="metric-value"><strong>{submissions.filter((item) => item.manifest.riskLevel === 'high' && item.status === 'submitted').length}</strong><span>项</span></div></article></section>
      <section className="panel data-panel">
        <div className="tab-bar"><button className={tab === 'review' ? 'is-active' : ''} onClick={() => setTab('review')}>提交审核 <span>{submissions.length}</span></button><button className={tab === 'installed' ? 'is-active' : ''} onClick={() => setTab('installed')}>已发布 Skills <span>{installed.length}</span></button></div>
        {loading ? <LoadingBlock /> : tab === 'review' ? (
          submissions.length === 0 ? <EmptyBlock title="暂无 Skill 提交" description="员工提交的 Skill manifest 会进入这里等待审核。" /> : <div className="data-list">{submissions.map((item) => { const id = entityId(item); return <article className="data-row" key={id}><div className="row-primary-icon"><Code2 size={18} /></div><div className="data-row-main"><div><strong>{item.manifest.displayName}</strong><span className={`status-pill status-${item.status}`}>{statusLabels[item.status]}</span><span className={`risk-pill risk-${item.manifest.riskLevel}`}>{item.manifest.riskLevel} 风险</span></div><p>{item.manifest.description}</p><small>{item.manifest.ownerDepartment} · {item.manifest.businessDomain} · v{item.manifest.version} · 提交人 {item.submittedBy}</small></div><div className="row-actions">{item.status === 'submitted' && <><button className="button small secondary" disabled={busyId === id} onClick={() => void act(id, () => adminApi.skills.review(id, 'rejected', 'Manifest 或权限设计需调整'))}><X size={14} />驳回</button><button className="button small primary" disabled={busyId === id} onClick={() => void act(id, () => adminApi.skills.review(id, 'approved', '规范与权限校验通过'))}>{busyId === id ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}通过</button></>}{item.status === 'approved' && <button className="button small primary" disabled={busyId === id} onClick={() => void act(id, () => adminApi.skills.publish(id))}><PackageCheck size={14} />发布</button>}</div></article>; })}</div>
        ) : installed.length === 0 ? <EmptyBlock title="暂无已发布 Skill" description="审核通过的 Skill 发布后会成为可装配的企业能力。" /> : <div className="data-list">{installed.map((item) => { const id = entityId(item); return <article className="data-row" key={id}><div className="row-primary-icon"><Boxes size={18} /></div><div className="data-row-main"><div><strong>{item.displayName}</strong><span className={`status-pill ${item.enabled ? 'status-ready' : 'status-archived'}`}>{item.enabled ? '已启用' : '已停用'}</span></div><p>{item.manifest.description}</p><small>{item.manifest.ownerDepartment} · {item.name} · v{item.version}</small></div><label className="switch"><input type="checkbox" checked={item.enabled} disabled={busyId === id} onChange={(event) => void act(id, () => adminApi.skills.setEnabled(id, event.target.checked))} /><span /></label></article>; })}</div>}
      </section>
      {submitOpen && <SkillSubmitModal onClose={() => setSubmitOpen(false)} onSaved={async () => { setSubmitOpen(false); await load(); }} />}
    </div>
  );
}

function SkillSubmitModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [manifest, setManifest] = useState(manifestTemplate);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await adminApi.skills.submit(JSON.parse(manifest) as Record<string, unknown>); await onSaved(); }
    catch (reason) { setError(reason instanceof SyntaxError ? 'Manifest 不是有效的 JSON。' : reason instanceof Error ? reason.message : '提交失败'); }
    finally { setBusy(false); }
  };
  return <Modal title="提交 Skill Manifest" subtitle="平台会校验字段、Tool 权限、风险等级和人工确认策略。" onClose={onClose} wide><form className="knowledge-editor" onSubmit={(event) => void submit(event)}>{error && <ErrorBanner message={error} onClose={() => setError('')} />}<div className="permission-note"><CircleAlert size={16} /><span>写入、审批和高风险 Tool 必须配置人工确认，发布后所有调用进入审计中心。</span></div><label><span>Manifest JSON</span><textarea className="form-control code-editor" rows={22} value={manifest} onChange={(event) => setManifest(event.target.value)} spellCheck={false} /></label><footer className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}提交审核</button></footer></form></Modal>;
}

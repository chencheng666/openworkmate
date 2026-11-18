import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, CheckCircle2, DatabaseZap, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { adminApi, entityId } from '../api';
import { EmptyBlock, ErrorBanner, LoadingBlock, Modal } from '../components/Feedback';
import type { Connector } from '../types';

const typeLabels: Record<Connector['type'], string> = { oa: 'OA', ticketing: '工单', crm: 'CRM', contract: '合同', bi: 'BI', database: '数据库', custom: '自定义' };

export function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const createOpen = params.get('create') === '1';
  const setCreateOpen = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('create', '1');
    else next.delete('create');
    setParams(next, { replace: true });
  };
  const [busyId, setBusyId] = useState('');
  const load = useCallback(async () => { setLoading(true); try { setConnectors(await adminApi.connectors.list()); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '连接器加载失败'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (id: string, action: () => Promise<unknown>) => { setBusyId(id); try { await action(); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); } finally { setBusyId(''); } };
  return <div className="page-stack" data-testid="admin-connectors-page">
    <section className="page-heading compact-heading"><div><h1>系统接入</h1><p>管理 Skill 可以调用的业务接口。</p></div><div className="heading-actions"><button className="button secondary" onClick={() => void load()}><RefreshCw size={16} />刷新</button><button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16} />新建连接器</button></div></section>
    {error && <ErrorBanner message={error} onClose={() => setError('')} />}
    <div className="summary-line"><span>连接器 <b>{connectors.length}</b></span><span>连接正常 <b>{connectors.filter((item) => item.lastHealthStatus === 'healthy').length}</b></span></div>
    <section className="panel data-panel">{loading ? <LoadingBlock /> : connectors.length === 0 ? <EmptyBlock title="暂无业务系统连接" description="创建连接器，把内部系统 API 治理成可被 Skill 调用的能力。" /> : <div className="connector-grid">{connectors.map((item) => { const id = entityId(item); return <article className="connector-card" key={id}><div className="connector-card-head"><div className="connector-icon"><DatabaseZap size={19} /></div><div><span>{typeLabels[item.type]}</span><strong>{item.displayName}</strong><small>{item.systemName}</small></div><span className={`status-pill status-${item.status === 'active' ? 'ready' : item.status}`}>{item.status === 'active' ? '已启用' : item.status === 'disabled' ? '已停用' : item.status === 'error' ? '异常' : '草稿'}</span></div><div className="connector-meta"><span><small>认证方式</small><strong>{item.authMode}</strong></span><span><small>归属部门</small><strong>{item.ownerDepartment}</strong></span><span><small>能力数量</small><strong>{item.capabilities.length} 个</strong></span><span><small>健康状态</small><strong className={`health-${item.lastHealthStatus}`}>{item.lastHealthStatus || 'unknown'}</strong></span></div><div className="tag-row">{item.dataDomains.map((domain) => <span key={domain}>{domain}</span>)}</div><div className="connector-actions"><button className="button small secondary" disabled={busyId === id} onClick={() => void act(id, () => adminApi.connectors.healthCheck(id))}>{busyId === id ? <LoaderCircle className="spin" size={14} /> : <Activity size={14} />}健康检查</button><button className={`button small ${item.status === 'active' ? 'secondary' : 'primary'}`} disabled={busyId === id} onClick={() => void act(id, () => adminApi.connectors.setStatus(id, item.status === 'active' ? 'disabled' : 'active'))}>{item.status === 'active' ? '停用' : '启用'}</button></div></article>; })}</div>}</section>
    {createOpen && <ConnectorCreateModal onClose={() => setCreateOpen(false)} onSaved={async () => { setCreateOpen(false); await load(); }} />}
  </div>;
}

function ConnectorCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [authMode, setAuthMode] = useState('none');
  const [generatedKey] = useState(() => 'http-' + crypto.randomUUID().slice(0, 8));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const read = (name: string) => String(fields.get(name) ?? '').trim();
    const displayName = read('displayName');
    const key = read('key') || generatedKey;
    const capability = read('capability') || 'query';
    setError('');
    setBusy(true);
    try {
      const endpoint = URL.parse(read('endpoint'));
      if (!endpoint || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
        throw new Error('请填写完整的 HTTP 或 HTTPS 查询地址，地址中不能包含凭证或锚点。');
      }
      if (!displayName) throw new Error('请填写系统名称。');
      await adminApi.connectors.create({
        key,
        displayName,
        systemName: displayName,
        type: read('type'),
        authMode,
        baseUrl: endpoint.origin,
        status: 'draft',
        ownerDepartment: read('owner') || '信息化中心',
        dataDomains: read('domains').split(/[,，\s]+/).filter(Boolean),
        capabilities: [{ name: capability, description: read('description') || ('查询' + displayName), actionKind: 'read', riskLevel: 'low', requiredScopes: [key + ':read'] }],
        metadata: {
          transport: 'http',
          ...(authMode !== 'none' ? { apiKeyEnv: read('credential') } : {}),
          ...(read('healthPath') ? { healthPath: read('healthPath') } : {}),
          operations: { [capability]: { path: endpoint.pathname + endpoint.search, method: read('method') } },
        },
      });
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建连接器失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="新建系统连接器" subtitle="填写系统名称和查询地址即可创建草稿。" onClose={onClose}>
      <form className="knowledge-editor" onSubmit={(event) => void submit(event)}>
        {error && <ErrorBanner message={error} onClose={() => setError('')} />}
        <label><span>系统名称</span><input className="form-control" name="displayName" required placeholder="例如：企业工单" /></label>
        <label><span>查询接口地址</span><input className="form-control" name="endpoint" type="url" required placeholder="https://tickets.example.com/api/query" /></label>
        <label><span>认证方式</span><select className="form-control" value={authMode} onChange={(event) => setAuthMode(event.target.value)}><option value="none">无认证</option><option value="apiKey">API Key</option><option value="jwt">Bearer Token</option></select></label>
        {authMode !== 'none' && <label><span>凭证环境变量名</span><input className="form-control" name="credential" required pattern="[A-Za-z_][A-Za-z0-9_]*" placeholder="TICKETS_API_KEY" /><small>填写服务端环境变量名，不要粘贴密钥。</small></label>}
        <details className="connector-advanced" onInvalid={(event) => { event.currentTarget.open = true; }}>
          <summary>高级配置</summary>
          <div className="form-grid two-columns">
            <label><span>系统类型</span><select className="form-control" name="type" defaultValue="custom">{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>请求方法</span><select className="form-control" name="method"><option>GET</option><option>POST</option></select></label>
            <label><span>健康检查路径</span><input className="form-control" name="healthPath" placeholder="/health" /></label>
            <label><span>连接器标识</span><input className="form-control" name="key" placeholder={generatedKey} pattern={'[a-zA-Z0-9_\\-]+'} /></label>
            <label><span>能力标识</span><input className="form-control" name="capability" placeholder="query" pattern={'[a-zA-Z0-9_\\-]+'} /></label>
            <label><span>能力说明</span><input className="form-control" name="description" placeholder="查询业务数据" /></label>
            <label><span>归属部门</span><input className="form-control" name="owner" placeholder="信息化中心" /></label>
            <label><span>数据域</span><input className="form-control" name="domains" placeholder="工单、客户" /></label>
          </div>
        </details>
        <footer className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>取消</button>
          <button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}创建草稿</button>
        </footer>
      </form>
    </Modal>
  );
}

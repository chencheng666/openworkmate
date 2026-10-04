import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  Cable,
  CheckCircle2,
  Code2,
  Database,
  FileJson,
  KeyRound,
  LockKeyhole,
  Play,
  PlugZap,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  enterpriseApi,
  type ConnectorStatus,
  type ConnectorType,
  type ConnectorRuntimeResult,
  type ConnectorToolDeclaration,
  type EnterpriseConnector,
  type EnterpriseHealth,
} from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

const initialConnectors: EnterpriseConnector[] = [
  {
    key: 'oa-approval',
    displayName: 'OA 审批中心',
    type: 'oa',
    systemName: '企业 OA',
    authMode: 'sso',
    status: 'active',
    ownerDepartment: '流程与信息化部',
    dataDomains: ['审批', '组织', '岗位', '待办'],
    capabilities: [
      { name: 'query-todo', description: '查询当前用户待办和审批详情', actionKind: 'read', riskLevel: 'low', requiredScopes: ['approval:read'] },
      { name: 'approve-flow', description: '提交同意、驳回或转交审批动作', actionKind: 'approve', riskLevel: 'high', requiredScopes: ['approval:write'] },
    ],
    syncPolicy: { mode: 'webhook' },
    lastHealthStatus: 'healthy',
  },
  {
    key: 'park-ticketing',
    displayName: '园区工单系统',
    type: 'ticketing',
    systemName: '企业工单平台',
    authMode: 'apiKey',
    status: 'active',
    ownerDepartment: '园区运营中心',
    dataDomains: ['工单', '园区', 'SLA', '企业服务'],
    capabilities: [
      { name: 'search-ticket', description: '按园区、企业、问题类型查询工单', actionKind: 'read', riskLevel: 'low', requiredScopes: ['ticket:read'] },
      { name: 'dispatch-ticket', description: '创建派单建议并写回处理人', actionKind: 'write', riskLevel: 'medium', requiredScopes: ['ticket:write'] },
    ],
    syncPolicy: { mode: 'scheduled', intervalMinutes: 15 },
    lastHealthStatus: 'healthy',
  },
  {
    key: 'crm-carrier',
    displayName: 'CRM / 载体库',
    type: 'crm',
    systemName: '招商 CRM 与载体库',
    authMode: 'oauth2',
    status: 'active',
    ownerDepartment: '招商管理部',
    dataDomains: ['客户', '商机', '载体', '政策'],
    capabilities: [
      { name: 'match-carrier', description: '读取客户画像并匹配园区和载体', actionKind: 'read', riskLevel: 'low', requiredScopes: ['lead:read', 'carrier:read'] },
    ],
    syncPolicy: { mode: 'scheduled', intervalMinutes: 30 },
    lastHealthStatus: 'healthy',
  },
];

const typeLabel: Record<ConnectorType, string> = {
  oa: 'OA',
  ticketing: '工单',
  crm: 'CRM',
  contract: '合同',
  bi: 'BI',
  database: '数据库',
  custom: '自定义',
};

const statusLabel: Record<ConnectorStatus, string> = {
  draft: '草稿',
  active: '已启用',
  disabled: '已停用',
  error: '异常',
};

const statusClassName: Record<ConnectorStatus, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  disabled: 'border-slate-200 bg-slate-50 text-slate-600',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
};

function getConnectorId(connector: EnterpriseConnector): string {
  return connector._id || connector.id || connector.key;
}

function buildDemoToolDeclarations(connector: EnterpriseConnector): ConnectorToolDeclaration[] {
  return connector.capabilities.map((capability) => ({
    name: `workmate_${connector.key}_${capability.name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
    title: `${connector.displayName} / ${capability.description}`,
    description: `${capability.description}\n目标系统：${connector.systemName}`,
    inputSchema: {
      type: 'object',
      properties: {
        businessGoal: { type: 'string', description: '用户希望完成的业务目标' },
        filters: { type: 'object', description: '查询或执行条件' },
        payload: { type: 'object', description: '写入、审批或通知载荷' },
      },
      required: ['businessGoal'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: capability.actionKind === 'read',
      destructiveHint: capability.actionKind === 'write' || capability.actionKind === 'approve',
      idempotentHint: capability.actionKind === 'read' || capability.actionKind === 'notify',
      openWorldHint: false,
    },
    governance: {
      connectorId: getConnectorId(connector),
      connectorKey: connector.key,
      connectorType: connector.type,
      capabilityName: capability.name,
      actionKind: capability.actionKind,
      riskLevel: capability.riskLevel,
      requiredScopes: capability.requiredScopes,
      dataDomains: connector.dataDomains,
      humanConfirmationRequired: capability.actionKind !== 'read' || capability.riskLevel === 'high',
      auditLevel: capability.riskLevel === 'high' ? 'strict' : 'standard',
    },
    execution: {
      transport: 'workmate-connector-gateway',
      connectorKey: connector.key,
      capabilityName: capability.name,
      targetSystem: connector.systemName,
      status: connector.status,
    },
  }));
}

export function Connectors() {
  const [connectors, setConnectors] = useState<EnterpriseConnector[]>(initialConnectors);
  const [typeFilter, setTypeFilter] = useState<ConnectorType | 'all'>('all');
  const [backendState, setBackendState] = useState<'connecting' | 'connected' | 'demo'>('connecting');
  const [health, setHealth] = useState<EnterpriseHealth | null>(null);
  const [toolDeclarations, setToolDeclarations] = useState<ConnectorToolDeclaration[]>([]);
  const [selectedToolSource, setSelectedToolSource] = useState('全部已启用连接器');
  const [runtimeResult, setRuntimeResult] = useState<ConnectorRuntimeResult | null>(null);
  const [lastExecution, setLastExecution] = useState<{
    tool: ConnectorToolDeclaration;
    input: {
      toolName: string;
      businessGoal: string;
      filters: Record<string, unknown>;
      payload: Record<string, unknown>;
    };
  } | null>(null);
  const [confirmExecuting, setConfirmExecuting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      enterpriseApi.getHealth(),
      enterpriseApi.listConnectors(),
    ])
      .then(([healthResult, items]) => {
        if (cancelled) return;
        setHealth(healthResult);
        setBackendState(healthResult.status === 'ok' ? 'connected' : 'demo');
        if (items.length > 0) {
          setConnectors(items);
        }
        void enterpriseApi.listConnectorToolDeclarations()
          .then((declarations) => {
            if (!cancelled) setToolDeclarations(declarations);
          })
          .catch(() => undefined);
      })
      .catch(() => {
        if (!cancelled) setBackendState('demo');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return connectors;
    return connectors.filter((connector) => connector.type === typeFilter);
  }, [connectors, typeFilter]);

  const activeCount = useMemo(() => connectors.filter((connector) => connector.status === 'active').length, [connectors]);
  const capabilityCount = useMemo(() => connectors.reduce((sum, connector) => sum + connector.capabilities.length, 0), [connectors]);
  const visibleToolCount = toolDeclarations.length || connectors
    .filter((connector) => connector.status === 'active')
    .reduce((sum, connector) => sum + connector.capabilities.length, 0);

  const toggleConnector = async (connector: EnterpriseConnector, enabled: boolean) => {
    const nextStatus: ConnectorStatus = enabled ? 'active' : 'disabled';
    const id = getConnectorId(connector);
    setConnectors((current) => current.map((item) =>
      getConnectorId(item) === id ? { ...item, status: nextStatus } : item,
    ));

    try {
      const updated = await enterpriseApi.setConnectorStatus(id, nextStatus);
      setConnectors((current) => current.map((item) =>
        getConnectorId(item) === id ? updated : item,
      ));
      setBackendState('connected');
    } catch {
      setBackendState('demo');
    }
  };

  const runHealthCheck = async (connector: EnterpriseConnector) => {
    const id = getConnectorId(connector);
    try {
      const result = await enterpriseApi.runConnectorHealthCheck(id);
      setConnectors((current) => current.map((item) =>
        getConnectorId(item) === id
          ? { ...item, lastHealthStatus: result.status, lastHealthCheckAt: result.checkedAt }
          : item,
      ));
      setBackendState('connected');
    } catch {
      setBackendState('demo');
    }
  };

  const previewToolDeclarations = async (connector: EnterpriseConnector) => {
    const id = getConnectorId(connector);
    setSelectedToolSource(connector.displayName);
    try {
      const declarations = await enterpriseApi.getConnectorToolDeclarations(id);
      setToolDeclarations(declarations);
      setBackendState('connected');
    } catch {
      setToolDeclarations(buildDemoToolDeclarations(connector));
      setBackendState('demo');
    }
  };

  const executeTool = async (tool: ConnectorToolDeclaration) => {
    const demoInput = {
      toolName: tool.name,
      businessGoal: `${tool.governance.connectorKey} ${tool.governance.capabilityName} 试运行`,
      filters: {
        parkId: 'demo-park-001',
        keyword: '企业演示',
      },
      payload: tool.governance.humanConfirmationRequired
        ? { decision: 'approve', comment: 'UI mock confirmation path' }
        : {},
    };
    setLastExecution({ tool, input: demoInput });

    try {
      const result = await enterpriseApi.executeConnectorTool(demoInput);
      setRuntimeResult(result);
      setBackendState('connected');
    } catch {
      setRuntimeResult({
        status: tool.governance.humanConfirmationRequired ? 'confirmation_required' : 'executed',
        toolName: tool.name,
        requiresConfirmation: tool.governance.humanConfirmationRequired,
        confirmation: tool.governance.humanConfirmationRequired
          ? {
            tokenHint: `confirm:${tool.name}:demo`,
            requestId: `demo-${Date.now()}`,
            reason: '演示模式：该工具需要人工确认后执行。',
            riskLevel: tool.governance.riskLevel,
            actionKind: tool.governance.actionKind,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }
          : undefined,
        result: tool.governance.humanConfirmationRequired
          ? undefined
          : {
            mode: 'mock',
            targetSystem: tool.execution.targetSystem,
            connectorKey: tool.execution.connectorKey,
            capabilityName: tool.execution.capabilityName,
            summary: '演示模式：已完成模拟查询。',
            businessGoal: demoInput.businessGoal,
            filters: demoInput.filters,
            payload: demoInput.payload,
            generatedAt: new Date().toISOString(),
          },
        governance: tool.governance,
      });
      setBackendState('demo');
    }
  };

  const confirmAndExecute = async () => {
    if (!runtimeResult || runtimeResult.status !== 'confirmation_required' || !lastExecution) return;

    setConfirmExecuting(true);
    const confirmationId = runtimeResult.confirmation?.requestId;
    try {
      const approval = confirmationId && !confirmationId.startsWith('demo-')
        ? await enterpriseApi.approveConnectorConfirmation(confirmationId, '页面确认执行高风险 Tool')
        : { confirmationToken: `demo-token-${Date.now()}` };
      const confirmationToken = approval.confirmationToken;
      if (!confirmationToken) {
        throw new Error('确认请求已过期，未返回执行令牌。');
      }
      const result = await enterpriseApi.executeConnectorTool({
        ...lastExecution.input,
        confirmationToken,
      });
      setRuntimeResult(result);
      setBackendState('connected');
    } catch {
      const { tool, input } = lastExecution;
      setRuntimeResult({
        status: 'executed',
        toolName: tool.name,
        result: {
          mode: 'mock',
          targetSystem: tool.execution.targetSystem,
          connectorKey: tool.execution.connectorKey,
          capabilityName: tool.execution.capabilityName,
          summary: '演示模式：已完成人工确认后的模拟执行。',
          businessGoal: input.businessGoal,
          filters: input.filters,
          payload: input.payload,
          generatedAt: new Date().toISOString(),
        },
        governance: tool.governance,
        audit: {
          recorded: true,
          action: 'connector_runtime.execute.demo',
        },
      });
      setBackendState('demo');
    } finally {
      setConfirmExecuting(false);
    }
  };

  return (
    <div data-testid="connectors-page" className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden -m-6 bg-background">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-8 py-8">
        <header className="mb-6 flex shrink-0 items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-3 py-1 text-xs font-medium text-sky-700">
              <PlugZap className="h-3.5 w-3.5" />
              企业系统连接器
            </div>
            <Badge variant="outline" className="ml-2 border-sky-100 bg-white text-2xs text-sky-700">
              {backendState === 'connected' ? '后端已连接' : backendState === 'connecting' ? '连接后端中' : '演示数据'}
            </Badge>
            {health && (
              <Badge variant="outline" className="ml-2 border-slate-200 bg-white text-2xs text-slate-600">
                连接器 {health.collections.connectors}
              </Badge>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">系统接入中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              将 OA、工单、CRM、合同和 BI 平台声明为可治理连接器，Skill 只能调用已启用、已授权、可审计的系统能力。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right">
            <Metric label="启用连接" value={activeCount} />
            <Metric label="Tool 声明" value={visibleToolCount || capabilityCount} />
          </div>
        </header>

        <section className="mb-4 grid shrink-0 gap-3 md:grid-cols-4">
          <GovernanceTile icon={<ShieldCheck className="h-4 w-4" />} title="权限绑定" body="连接器声明数据域、角色和 scope" />
          <GovernanceTile icon={<KeyRound className="h-4 w-4" />} title="凭证隔离" body="前端不接触密钥，后续进入密钥托管" />
          <GovernanceTile icon={<LockKeyhole className="h-4 w-4" />} title="风险门控" body="写入、审批类能力必须人工确认" />
          <GovernanceTile icon={<Activity className="h-4 w-4" />} title="健康检查" body="连接状态和调用结果写审计" />
        </section>

        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-sky-600" />
            <h2 className="text-sm font-semibold text-foreground">内部系统资产</h2>
          </div>
          <Select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as ConnectorType | 'all')}
            className="h-9 w-44 rounded-full border-sky-100 bg-white"
          >
            <option value="all">全部系统</option>
            {Object.entries(typeLabel).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-sky-100 bg-white/80">
          {filtered.map((connector) => (
            <article key={getConnectorId(connector)} className="grid grid-cols-[1fr_auto] gap-4 border-b border-sky-50 px-5 py-4 last:border-b-0">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                    <Database className="h-[18px] w-[18px]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{connector.displayName}</h3>
                    <p className="text-2xs text-muted-foreground">{connector.systemName} · {connector.ownerDepartment}</p>
                  </div>
                  <Badge variant="outline" className="border-sky-100 bg-sky-50 text-2xs text-sky-700">
                    {typeLabel[connector.type]}
                  </Badge>
                  <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-medium', statusClassName[connector.status])}>
                    {statusLabel[connector.status]}
                  </span>
                </div>

                <div className="mb-2 flex flex-wrap gap-2">
                  {connector.dataDomains.map((domain) => (
                    <Badge key={domain} variant="outline" className="border-slate-200 bg-white text-2xs text-slate-600">
                      {domain}
                    </Badge>
                  ))}
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {connector.capabilities.map((capability) => (
                    <div key={capability.name} className="rounded-md border border-sky-50 bg-sky-50/50 px-3 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{capability.description}</span>
                        <span className="shrink-0 text-2xs text-sky-700">{capability.actionKind}</span>
                      </div>
                      <p className="truncate text-2xs text-muted-foreground">{capability.requiredScopes.join(' / ')}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex min-w-36 flex-col items-end justify-between gap-3">
                <div className="text-right text-2xs text-muted-foreground">
                  <div>认证：{connector.authMode}</div>
                  <div>健康：{connector.lastHealthStatus || 'unknown'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="h-8 rounded-full border-sky-100 px-3 text-xs shadow-none" onClick={() => previewToolDeclarations(connector)}>
                    <FileJson className="mr-1.5 h-3.5 w-3.5" />
                    Tool
                  </Button>
                  <Button variant="outline" className="h-8 rounded-full border-sky-100 px-3 text-xs shadow-none" onClick={() => runHealthCheck(connector)}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    检测
                  </Button>
                  <Switch checked={connector.status === 'active'} onCheckedChange={(checked) => toggleConnector(connector, checked)} />
                </div>
              </div>
            </article>
          ))}
        </main>

        <footer className="mt-4 shrink-0 rounded-lg border border-sky-100 bg-white/82 p-4 shadow-sm shadow-sky-950/5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-sky-600" />
              <h2 className="text-sm font-semibold text-foreground">Gateway / MCP Tool 声明</h2>
              <Badge variant="outline" className="border-sky-100 bg-sky-50 text-2xs text-sky-700">
                {selectedToolSource}
              </Badge>
            </div>
            <span className="text-2xs text-muted-foreground">{toolDeclarations.length || visibleToolCount} tools</span>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {(toolDeclarations.length > 0
              ? toolDeclarations
              : connectors.filter((connector) => connector.status === 'active').flatMap(buildDemoToolDeclarations)
            ).slice(0, 3).map((tool) => (
              <div key={tool.name} className="min-w-0 rounded-md border border-sky-50 bg-sky-50/50 px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-semibold text-foreground">{tool.name}</div>
                  <Button variant="outline" className="h-7 shrink-0 rounded-full border-sky-100 px-2 text-2xs shadow-none" onClick={() => executeTool(tool)}>
                    <Play className="mr-1 h-3 w-3" />
                    试运行
                  </Button>
                </div>
                <p className="line-clamp-2 text-2xs leading-5 text-muted-foreground">{tool.title}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="outline" className="border-slate-200 bg-white text-2xs text-slate-600">
                    {tool.governance.actionKind}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-2xs text-slate-600">
                    {tool.governance.riskLevel}
                  </Badge>
                  {tool.governance.humanConfirmationRequired && (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-2xs text-amber-700">
                      需确认
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
          {runtimeResult && (
            <div className="mt-3 rounded-md border border-sky-50 bg-white px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">执行结果</span>
                <Badge variant="outline" className="border-sky-100 bg-sky-50 text-2xs text-sky-700">
                  {runtimeResult.status}
                </Badge>
              </div>
              <p className="text-2xs leading-5 text-muted-foreground">
                {runtimeResult.status === 'executed'
                  ? runtimeResult.result?.summary
                  : runtimeResult.confirmation?.reason || '执行被策略拦截'}
              </p>
              {runtimeResult.status === 'confirmation_required' && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-100 bg-amber-50/70 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-amber-800">高风险动作等待确认</div>
                    <p className="mt-0.5 text-2xs text-amber-700">
                      请求 {runtimeResult.confirmation?.requestId || runtimeResult.confirmation?.tokenHint || 'demo'} ·
                      {runtimeResult.confirmation?.actionKind} · {runtimeResult.confirmation?.riskLevel}
                    </p>
                  </div>
                  <Button
                    className="h-8 rounded-full bg-sky-600 px-3 text-xs text-white shadow-none hover:bg-sky-700"
                    disabled={confirmExecuting}
                    onClick={confirmAndExecute}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    {confirmExecuting ? '确认中' : '确认并执行'}
                  </Button>
                </div>
              )}
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <ResultMeta label="Tool" value={runtimeResult.toolName} />
                <ResultMeta label="系统" value={runtimeResult.result?.targetSystem || runtimeResult.governance.connectorKey} />
                <ResultMeta label="审计" value={runtimeResult.audit?.recorded ? '已记录' : '待确认'} />
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white/82 px-4 py-3 shadow-sm shadow-sky-950/5">
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}

function GovernanceTile({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white/82 p-3 shadow-sm shadow-sky-950/5">
      <div className="mb-2 flex items-center gap-2 text-sky-600">
        {icon}
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-2xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}

function ResultMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-sky-50/70 px-2 py-1.5">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="truncate text-2xs font-medium text-slate-700">{value}</div>
    </div>
  );
}

export default Connectors;

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Database,
  GitPullRequest,
  History,
  LockKeyhole,
  PackageCheck,
  Plus,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  enterpriseApi,
  type EnterpriseHealth,
  type InstalledSkill,
  type SkillManifest,
  type SkillSubmission,
  type SkillSubmissionStatus,
} from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

type SkillStatus = 'review' | 'approved' | 'installed';
type BusinessSkill = {
  id: string;
  name: string;
  owner: string;
  domain: string;
  targetSystem: string;
  risk: 'low' | 'medium' | 'high';
  status: SkillStatus;
  enabled: boolean;
  description: string;
};

const initialSkills: BusinessSkill[] = [
  {
    id: 'skill-enterprise-knowledge',
    name: '企业知识问答',
    owner: '流程与信息化部',
    domain: '企业知识',
    targetSystem: '知识库 Runtime',
    risk: 'low',
    status: 'installed',
    enabled: true,
    description: '按员工身份和组织权限检索企业制度、SOP、合同规则、政策及园区资料，并返回原文引用。',
  },
  {
    id: 'skill-ticket-dispatch',
    name: '园区工单自动派单',
    owner: '园区运营中心',
    domain: '园区运营',
    targetSystem: '工单系统',
    risk: 'medium',
    status: 'installed',
    enabled: true,
    description: '根据报修位置、问题类型、SLA 和园区责任人配置生成派单建议。',
  },
  {
    id: 'skill-lead-match',
    name: '招商线索匹配',
    owner: '招商管理部',
    domain: '招商选址',
    targetSystem: 'CRM / 载体库',
    risk: 'low',
    status: 'approved',
    enabled: false,
    description: '抽取客户画像，匹配园区、面积、产业方向、政策和下一步跟进任务。',
  },
  {
    id: 'skill-contract-risk',
    name: '合同风险预审',
    owner: '法务部',
    domain: '合同法务',
    targetSystem: '合同系统',
    risk: 'high',
    status: 'review',
    enabled: false,
    description: '读取合同条款并输出风险点，高风险建议必须经法务确认。',
  },
];

const statusLabel: Record<SkillStatus, string> = {
  review: '审核中',
  approved: '已通过',
  installed: '已安装',
};

const riskLabel: Record<BusinessSkill['risk'], string> = {
  low: '只读',
  medium: '写入需确认',
  high: '高风险审批',
};

const riskClassName: Record<BusinessSkill['risk'], string> = {
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  medium: 'border-sky-200 bg-sky-50 text-sky-700',
  high: 'border-rose-200 bg-rose-50 text-rose-700',
};

function getRecordId(record: { _id?: string; id?: string }): string {
  return record._id || record.id || `record-${Date.now()}`;
}

function submissionStatusToSkillStatus(status: SkillSubmissionStatus): SkillStatus {
  if (status === 'approved') return 'approved';
  if (status === 'published') return 'installed';
  return 'review';
}

function mapSubmissionToSkill(submission: SkillSubmission): BusinessSkill {
  const manifest = submission.manifest;
  return {
    id: getRecordId(submission),
    name: manifest.displayName,
    owner: manifest.ownerDepartment || submission.submittedBy,
    domain: manifest.businessDomain,
    targetSystem: manifest.tools[0]?.connectorId || '内部系统',
    risk: manifest.riskLevel,
    status: submissionStatusToSkillStatus(submission.status),
    enabled: false,
    description: manifest.description,
  };
}

function mapInstalledToSkill(skill: InstalledSkill): BusinessSkill {
  return {
    id: getRecordId(skill),
    name: skill.displayName,
    owner: skill.manifest.ownerDepartment,
    domain: skill.manifest.businessDomain,
    targetSystem: skill.manifest.tools[0]?.connectorId || '内部系统',
    risk: skill.manifest.riskLevel,
    status: 'installed',
    enabled: skill.enabled,
    description: skill.manifest.description,
  };
}

function buildSkillManifest(input: {
  displayName: string;
  domain: string;
  targetSystem: string;
  risk: BusinessSkill['risk'];
  description: string;
}): SkillManifest {
  const isReadOnly = input.risk === 'low';
  return {
    schemaVersion: '1.0',
    name: `workmate-${Date.now().toString(36)}`,
    displayName: input.displayName,
    description: input.description || '企业业务团队提交的企业内部 Skill，用于调取内部系统数据并辅助推进流程。',
    ownerDepartment: '当前用户',
    businessDomain: input.domain,
    version: '1.0.0',
    riskLevel: input.risk,
    inputFields: [
      { name: 'businessGoal', type: 'string', required: true, description: '用户希望达成的业务目标' },
      { name: 'context', type: 'object', required: false, description: '组织、园区、客户、工单或合同等上下文' },
    ],
    tools: [
      {
        name: 'query-or-execute',
        description: `通过${input.targetSystem}读取数据或推进业务动作`,
        connectorId: input.targetSystem,
        actionKind: isReadOnly ? 'read' : input.risk === 'high' ? 'approve' : 'write',
        requiredScopes: [input.domain, input.targetSystem],
        riskLevel: input.risk,
        confirmationRequired: !isReadOnly,
      },
    ],
    promptTemplate: '根据用户目标、组织权限、业务上下文和工具返回结果，涉及写入或审批动作时必须说明风险并等待确认。',
    outputContract: {
      type: isReadOnly ? 'text' : 'workflow',
    },
    governance: {
      dataDomains: [input.domain, input.targetSystem],
      allowedRoleIds: ['platform-admin', 'business-owner'],
      humanConfirmation: isReadOnly ? 'never' : input.risk === 'high' ? 'always' : 'on_write',
      auditLevel: input.risk === 'high' ? 'strict' : 'standard',
    },
  };
}

export function SkillFactory() {
  const [skills, setSkills] = useState<BusinessSkill[]>(initialSkills);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('园区运营');
  const [targetSystem, setTargetSystem] = useState('工单系统');
  const [risk, setRisk] = useState<BusinessSkill['risk']>('medium');
  const [description, setDescription] = useState('');
  const [backendState, setBackendState] = useState<'connecting' | 'connected' | 'demo'>('connecting');
  const [health, setHealth] = useState<EnterpriseHealth | null>(null);

  const reviewCount = useMemo(() => skills.filter((skill) => skill.status === 'review').length, [skills]);
  const installedCount = useMemo(() => skills.filter((skill) => skill.status === 'installed').length, [skills]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      enterpriseApi.getHealth(),
      enterpriseApi.listSkillSubmissions(),
      enterpriseApi.listInstalledSkills(),
    ])
      .then(([healthResult, submissions, installed]) => {
        if (cancelled) return;
        setHealth(healthResult);
        const installedSubmissionIds = new Set(installed.map((skill) => String(skill.submissionId)));
        const backendSkills = [
          ...installed.map(mapInstalledToSkill),
          ...submissions
            .filter((submission) => !installedSubmissionIds.has(getRecordId(submission)))
            .map(mapSubmissionToSkill),
        ];
        setBackendState(healthResult.status === 'ok' ? 'connected' : 'demo');
        if (backendSkills.length > 0) {
          setSkills(backendSkills);
        }
      })
      .catch(() => {
        if (!cancelled) setBackendState('demo');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submitSkill = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const manifest = buildSkillManifest({
      displayName: trimmedName,
      domain,
      targetSystem,
      risk,
      description: description.trim(),
    });
    const next: BusinessSkill = {
      id: `skill-${Date.now()}`,
      name: trimmedName,
      owner: '当前用户',
      domain,
      targetSystem,
      risk,
      status: 'review',
      enabled: false,
      description: description.trim() || '待补充业务规则、输入输出和异常处理说明。',
    };
    setSkills((current) => [next, ...current]);
    try {
      const submission = await enterpriseApi.submitSkill(manifest);
      setSkills((current) => [
        mapSubmissionToSkill(submission),
        ...current.filter((skill) => skill.id !== next.id),
      ]);
      setBackendState('connected');
    } catch {
      setBackendState('demo');
    }
    setName('');
    setDescription('');
  };

  const approveSkill = async (id: string) => {
    try {
      const submission = await enterpriseApi.reviewSkillSubmission(id, 'approved', '业务规则、权限声明和审计策略通过初审。');
      setSkills((current) => current.map((skill) =>
        skill.id === id ? mapSubmissionToSkill(submission) : skill,
      ));
      setBackendState('connected');
      return;
    } catch {
      setBackendState('demo');
    }
    setSkills((current) => current.map((skill) =>
      skill.id === id ? { ...skill, status: 'approved' } : skill,
    ));
  };

  const installSkill = async (id: string) => {
    try {
      const installed = await enterpriseApi.publishSkillSubmission(id);
      setSkills((current) => current.map((skill) =>
        skill.id === id ? mapInstalledToSkill(installed) : skill,
      ));
      setBackendState('connected');
      return;
    } catch {
      setBackendState('demo');
    }
    setSkills((current) => current.map((skill) =>
      skill.id === id ? { ...skill, status: 'installed', enabled: true } : skill,
    ));
  };

  const toggleSkill = async (id: string, enabled: boolean) => {
    try {
      const installed = await enterpriseApi.setInstalledSkillEnabled(id, enabled);
      setSkills((current) => current.map((skill) =>
        skill.id === id ? mapInstalledToSkill(installed) : skill,
      ));
      setBackendState('connected');
      return;
    } catch {
      setBackendState('demo');
    }
    setSkills((current) => current.map((skill) =>
      skill.id === id ? { ...skill, enabled } : skill,
    ));
  };

  return (
    <div data-testid="skill-factory-page" className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden -m-6 bg-background">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-8 py-8">
        <header className="mb-6 flex shrink-0 items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-3 py-1 text-xs font-medium text-sky-700">
              <PackageCheck className="h-3.5 w-3.5" />
              员工 Skill 工厂
            </div>
            <Badge variant="outline" className="ml-2 border-sky-100 bg-white text-2xs text-sky-700">
              {backendState === 'connected' ? '后端已连接' : backendState === 'connecting' ? '连接后端中' : '演示数据'}
            </Badge>
            {health && (
              <Badge variant="outline" className="ml-2 border-slate-200 bg-white text-2xs text-slate-600">
                Skill {health.collections.skillSubmissions} · 已装 {health.collections.installedSkills}
              </Badge>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">业务能力治理中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              让业务团队提交自己的 Skill，经规则校验、权限审核、灰度安装后，进入企业内部可调用的企业能力库。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right">
            <Metric label="审核中" value={reviewCount} />
            <Metric label="已安装" value={installedCount} />
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <section className="rounded-lg border border-sky-100 bg-white/82 p-5 shadow-sm shadow-sky-950/5">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4 text-sky-600" />
              <h2 className="text-sm font-semibold text-foreground">提交业务 Skill</h2>
            </div>
            <div className="space-y-3">
              <Field label="Skill 名称">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：招商客户尽调助手" className="border-sky-100 bg-white" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="业务域">
                  <Select value={domain} onChange={(event) => setDomain(event.target.value)} className="border-sky-100 bg-white">
                    <option>园区运营</option>
                    <option>招商选址</option>
                    <option>企业服务</option>
                    <option>合同法务</option>
                    <option>经营分析</option>
                  </Select>
                </Field>
                <Field label="风险等级">
                  <Select value={risk} onChange={(event) => setRisk(event.target.value as BusinessSkill['risk'])} className="border-sky-100 bg-white">
                    <option value="low">只读</option>
                    <option value="medium">写入需确认</option>
                    <option value="high">高风险审批</option>
                  </Select>
                </Field>
              </div>
              <Field label="目标系统">
                <Select value={targetSystem} onChange={(event) => setTargetSystem(event.target.value)} className="border-sky-100 bg-white">
                  <option>工单系统</option>
                  <option>OA 审批</option>
                  <option>CRM / 载体库</option>
                  <option>合同系统</option>
                  <option>BI 数据平台</option>
                </Select>
              </Field>
              <Field label="业务规则">
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="描述输入字段、调用系统、输出结果、异常处理和需要人工确认的节点。"
                  className="min-h-[132px] resize-none border-sky-100 bg-white"
                />
              </Field>
              <Button data-testid="skill-submit-button" onClick={submitSkill} className="h-9 w-full rounded-full shadow-none">
                <GitPullRequest className="mr-2 h-4 w-4" />
                提交审核
              </Button>
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="mb-3 grid grid-cols-3 gap-3">
              <GovernanceTile icon={<Database className="h-4 w-4" />} title="数据声明" body="声明要访问的内部系统与字段" />
              <GovernanceTile icon={<LockKeyhole className="h-4 w-4" />} title="权限门控" body="按角色和风险等级审批" />
              <GovernanceTile icon={<ShieldAlert className="h-4 w-4" />} title="审计留痕" body="记录每次调用与结果" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-sky-100 bg-white/80">
              {skills.map((skill) => (
                <article key={skill.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-sky-50 px-5 py-4 last:border-b-0">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">{skill.name}</h2>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-2xs text-slate-600">
                        {statusLabel[skill.status]}
                      </Badge>
                      <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-medium', riskClassName[skill.risk])}>
                        {riskLabel[skill.risk]}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{skill.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-sky-600" />{skill.domain}</span>
                      <span className="inline-flex items-center gap-1"><Code2 className="h-3.5 w-3.5 text-sky-600" />{skill.targetSystem}</span>
                      <span>{skill.owner}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {skill.status === 'review' && (
                      <Button variant="outline" className="h-8 rounded-full border-sky-100 px-3 text-xs shadow-none" onClick={() => approveSkill(skill.id)}>
                        审核通过
                      </Button>
                    )}
                    {skill.status === 'approved' && (
                      <Button className="h-8 rounded-full px-3 text-xs shadow-none" onClick={() => installSkill(skill.id)}>
                        安装
                      </Button>
                    )}
                    {skill.status === 'installed' && (
                      <Switch checked={skill.enabled} onCheckedChange={(checked) => toggleSkill(skill.id, checked)} />
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>

        <footer className="mt-5 grid shrink-0 gap-3 md:grid-cols-3">
          <AuditItem icon={<ClipboardCheck className="h-4 w-4" />} text="张敏提交了「招商线索匹配」并通过审核" />
          <AuditItem icon={<CheckCircle2 className="h-4 w-4" />} text="园区工单自动派单已安装到默认 Agent" />
          <AuditItem icon={<History className="h-4 w-4" />} text="合同风险预审因高风险权限进入人工复核" />
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
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

function AuditItem({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-sky-100 bg-white/72 px-3 py-2 text-xs text-slate-600">
      <span className="text-sky-600">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

export default SkillFactory;

import 'reflect-metadata';
import { Types, connect, connection } from 'mongoose';
import { SkillManifest } from './modules/skill-factory/skill-manifest.types';

const tenantId = 'workmate';
const now = new Date();

const ids = {
  oaConnector: new Types.ObjectId('665000000000000000000401'),
  ticketConnector: new Types.ObjectId('665000000000000000000402'),
  crmConnector: new Types.ObjectId('665000000000000000000403'),
  contractConnector: new Types.ObjectId('665000000000000000000404'),
  biConnector: new Types.ObjectId('665000000000000000000405'),
  sop: new Types.ObjectId('665000000000000000000001'),
  contract: new Types.ObjectId('665000000000000000000002'),
  policy: new Types.ObjectId('665000000000000000000003'),
  ticketSubmission: new Types.ObjectId('665000000000000000000101'),
  leadSubmission: new Types.ObjectId('665000000000000000000102'),
  contractSubmission: new Types.ObjectId('665000000000000000000103'),
  knowledgeSubmission: new Types.ObjectId('665000000000000000000104'),
  ticketInstalled: new Types.ObjectId('665000000000000000000201'),
  leadInstalled: new Types.ObjectId('665000000000000000000202'),
  knowledgeInstalled: new Types.ObjectId('665000000000000000000203'),
};

type KnowledgeSeed = {
  _id: Types.ObjectId;
  title: string;
  category: string;
  ownerDepartment: string;
  sourceUri: string;
  summary: string;
  visibility: {
    scopeType: 'tenant' | 'org' | 'role' | 'park' | 'private';
    orgIds: string[];
    roleIds: string[];
    parkIds: string[];
    userIds: string[];
  };
  chunks: string[];
};

const connectors = [
  {
    _id: ids.oaConnector,
    key: 'oa-approval',
    displayName: 'OA 审批中心',
    type: 'oa',
    systemName: '企业 OA',
    baseUrl: 'https://oa.example.local',
    authMode: 'sso',
    status: 'active',
    ownerDepartment: '流程与信息化部',
    dataDomains: ['审批', '组织', '岗位', '待办'],
    capabilities: [
      { name: 'query-todo', description: '查询当前用户待办和审批详情', actionKind: 'read', riskLevel: 'low', requiredScopes: ['approval:read'] },
      { name: 'approve-flow', description: '提交同意、驳回或转交审批动作', actionKind: 'approve', riskLevel: 'high', requiredScopes: ['approval:write'] },
    ],
    syncPolicy: { mode: 'webhook' },
  },
  {
    _id: ids.ticketConnector,
    key: 'park-ticketing',
    displayName: '园区工单系统',
    type: 'ticketing',
    systemName: '企业工单平台',
    baseUrl: 'https://ticket.example.local',
    authMode: 'apiKey',
    status: 'active',
    ownerDepartment: '园区运营中心',
    dataDomains: ['工单', '园区', 'SLA', '企业服务'],
    capabilities: [
      { name: 'search-ticket', description: '按园区、企业、问题类型查询工单', actionKind: 'read', riskLevel: 'low', requiredScopes: ['ticket:read'] },
      { name: 'dispatch-ticket', description: '创建派单建议并写回处理人', actionKind: 'write', riskLevel: 'medium', requiredScopes: ['ticket:write'] },
    ],
    syncPolicy: { mode: 'scheduled', intervalMinutes: 15 },
  },
  {
    _id: ids.crmConnector,
    key: 'crm-carrier',
    displayName: 'CRM / 载体库',
    type: 'crm',
    systemName: '招商 CRM 与载体库',
    baseUrl: 'https://crm.example.local',
    authMode: 'oauth2',
    status: 'active',
    ownerDepartment: '招商管理部',
    dataDomains: ['客户', '商机', '载体', '政策'],
    capabilities: [
      { name: 'match-carrier', description: '读取客户画像并匹配园区和载体', actionKind: 'read', riskLevel: 'low', requiredScopes: ['lead:read', 'carrier:read'] },
      { name: 'create-followup', description: '生成招商跟进任务', actionKind: 'write', riskLevel: 'medium', requiredScopes: ['lead:write'] },
    ],
    syncPolicy: { mode: 'scheduled', intervalMinutes: 30 },
  },
  {
    _id: ids.contractConnector,
    key: 'contract-center',
    displayName: '合同系统',
    type: 'contract',
    systemName: '企业合同中心',
    baseUrl: 'https://contract.example.local',
    authMode: 'sso',
    status: 'draft',
    ownerDepartment: '法务部',
    dataDomains: ['合同', '客户主体', '用印', '法务意见'],
    capabilities: [
      { name: 'read-contract', description: '读取合同正文、条款和审批链', actionKind: 'read', riskLevel: 'medium', requiredScopes: ['contract:read'] },
      { name: 'submit-legal-review', description: '提交法务风险复核意见', actionKind: 'approve', riskLevel: 'high', requiredScopes: ['contract:approve'] },
    ],
    syncPolicy: { mode: 'manual' },
  },
  {
    _id: ids.biConnector,
    key: 'bi-analytics',
    displayName: 'BI 数据平台',
    type: 'bi',
    systemName: '企业经营分析平台',
    baseUrl: 'https://bi.example.local',
    authMode: 'jwt',
    status: 'active',
    ownerDepartment: '经营管理部',
    dataDomains: ['收入', '出租率', '工单指标', '客户满意度'],
    capabilities: [
      { name: 'query-metric', description: '查询经营指标、趋势和异常明细', actionKind: 'read', riskLevel: 'low', requiredScopes: ['metric:read'] },
      { name: 'notify-risk', description: '将异常指标通知责任部门', actionKind: 'notify', riskLevel: 'medium', requiredScopes: ['metric:notify'] },
    ],
    syncPolicy: { mode: 'scheduled', intervalMinutes: 60 },
  },
] as const;

function manifest(input: {
  name: string;
  displayName: string;
  description: string;
  ownerDepartment: string;
  businessDomain: string;
  connectorId: string;
  actionKind: 'read' | 'write' | 'approve' | 'notify';
  riskLevel: 'low' | 'medium' | 'high';
  humanConfirmation: 'never' | 'on_write' | 'always';
  auditLevel: 'standard' | 'strict';
  toolName?: string;
  requiredScopes?: string[];
}): SkillManifest {
  return {
    schemaVersion: '1.0',
    name: input.name,
    displayName: input.displayName,
    description: input.description,
    ownerDepartment: input.ownerDepartment,
    businessDomain: input.businessDomain,
    version: '1.0.0',
    riskLevel: input.riskLevel,
    inputFields: [
      { name: 'businessGoal', type: 'string', required: true, description: '员工用自然语言描述的业务目标' },
      { name: 'target', type: 'object', required: false, description: '客户、合同、工单、园区或政策对象' },
    ],
    tools: [
      {
        name: input.toolName ?? `${input.name}-tool`,
        description: `调用${input.connectorId}完成${input.displayName}`,
        connectorId: input.connectorId,
        actionKind: input.actionKind,
        requiredScopes: input.requiredScopes ?? [input.businessDomain, input.connectorId],
        riskLevel: input.riskLevel,
        confirmationRequired: input.humanConfirmation !== 'never',
      },
    ],
    promptTemplate: [
      '你是示例企业内部业务执行智能体。',
      '先识别用户身份、组织、园区和权限，再读取必要数据。',
      '涉及写入、审批、通知或高风险动作时必须输出风险说明并等待人工确认。',
      '完成后返回执行结果、引用来源和审计摘要。',
    ].join('\n'),
    outputContract: {
      type: input.actionKind === 'read' ? 'text' : 'workflow',
    },
    governance: {
      dataDomains: [input.businessDomain, input.connectorId],
      allowedRoleIds: ['platform-admin', 'business-owner'],
      humanConfirmation: input.humanConfirmation,
      auditLevel: input.auditLevel,
    },
  };
}

const knowledgeDocuments: KnowledgeSeed[] = [
  {
    _id: ids.sop,
    title: '园区报修处理 SOP',
    category: '运营制度',
    ownerDepartment: '园区运营中心',
    sourceUri: 'seed://knowledge/park-ticket-sop',
    summary: '覆盖报修受理、派单、SLA 升级、回访和满意度闭环。',
    visibility: {
      scopeType: 'role',
      orgIds: [],
      roleIds: ['park-operator', 'platform-admin', 'business-owner'],
      parkIds: [],
      userIds: [],
    },
    chunks: [
      '普通报修 24 小时未响应时，系统应提醒责任部门并升级给园区负责人。',
      '影响企业办公或安全的报修应标记为高优先级，派单后 2 小时内必须确认处理计划。',
      '工单关闭后需要发起满意度回访，低于 3 分的反馈进入二次处理。',
    ],
  },
  {
    _id: ids.contract,
    title: '招商合同审批规则',
    category: '合同规则',
    ownerDepartment: '法务与招商管理部',
    sourceUri: 'seed://knowledge/investment-contract-rules',
    summary: '覆盖租赁条款、优惠政策、付款节点、用印和法务复核规则。',
    visibility: {
      scopeType: 'role',
      orgIds: [],
      roleIds: ['investment-manager', 'legal', 'platform-admin', 'business-owner'],
      parkIds: [],
      userIds: [],
    },
    chunks: [
      '合同涉及租金减免、超标准优惠或非标付款节点时，必须进入法务和城市公司负责人复核。',
      '客户主体、租赁面积、租期、保证金和付款周期必须与 CRM 商机和载体库数据一致。',
      '用印前应核验审批链完整性，缺少财务或法务节点的合同不得进入盖章环节。',
    ],
  },
  {
    _id: ids.policy,
    title: '专精特新政策申报材料清单',
    category: '政策服务',
    ownerDepartment: '企业服务中心',
    sourceUri: 'seed://knowledge/specialized-policy-materials',
    summary: '沉淀专精特新申报资格、材料清单、时间节点和企业服务跟进规则。',
    visibility: {
      scopeType: 'org',
      orgIds: ['enterprise-service-center'],
      roleIds: ['platform-admin', 'business-owner'],
      parkIds: [],
      userIds: [],
    },
    chunks: [
      '申报材料通常包括企业营业执照、财务报表、研发投入证明、知识产权证明和主营业务说明。',
      '企业服务岗应在政策窗口开启前 30 天完成潜在企业筛选和材料缺口清单。',
      '涉及企业敏感经营数据时，仅企业服务岗和授权园区负责人可见。',
    ],
  },
];

const skillSubmissions = [
  {
    _id: ids.ticketSubmission,
    submittedBy: 'ops-admin',
    status: 'published',
    manifest: manifest({
      name: 'park-ticket-dispatch',
      displayName: '园区工单自动派单',
      description: '根据报修位置、问题类型、SLA 和园区责任人配置生成派单建议，并在确认后写入工单系统。',
      ownerDepartment: '园区运营中心',
      businessDomain: '园区运营',
      connectorId: '工单系统',
      actionKind: 'write',
      riskLevel: 'medium',
      humanConfirmation: 'on_write',
      auditLevel: 'standard',
    }),
  },
  {
    _id: ids.leadSubmission,
    submittedBy: 'investment-admin',
    status: 'published',
    manifest: manifest({
      name: 'investment-lead-match',
      displayName: '招商线索匹配',
      description: '抽取客户画像，匹配园区、面积、产业方向、政策适配度和下一步跟进任务。',
      ownerDepartment: '招商管理部',
      businessDomain: '招商选址',
      connectorId: 'CRM / 载体库',
      actionKind: 'read',
      riskLevel: 'low',
      humanConfirmation: 'never',
      auditLevel: 'standard',
    }),
  },
  {
    _id: ids.contractSubmission,
    submittedBy: 'legal-admin',
    status: 'approved',
    manifest: manifest({
      name: 'contract-risk-review',
      displayName: '合同风险预审',
      description: '读取合同条款、审批链和客户主体信息，输出风险点；高风险合同必须经法务确认。',
      ownerDepartment: '法务部',
      businessDomain: '合同法务',
      connectorId: '合同系统',
      actionKind: 'approve',
      riskLevel: 'high',
      humanConfirmation: 'always',
      auditLevel: 'strict',
    }),
  },
  {
    _id: ids.knowledgeSubmission,
    submittedBy: 'platform-admin',
    status: 'published',
    manifest: manifest({
      name: 'enterprise-knowledge-search',
      displayName: '企业知识问答',
      description: '按员工租户、组织、角色和个人权限检索企业制度、SOP、合同规则、政策及园区资料，并返回原文引用。',
      ownerDepartment: '流程与信息化部',
      businessDomain: '企业知识',
      connectorId: '知识库 Runtime',
      toolName: 'workmate_knowledge_search',
      requiredScopes: ['knowledge:read'],
      actionKind: 'read',
      riskLevel: 'low',
      humanConfirmation: 'never',
      auditLevel: 'standard',
    }),
  },
];

async function upsertOne(collection: string, _id: Types.ObjectId, document: Record<string, unknown>) {
  await connection.db?.collection(collection).updateOne(
    { _id },
    {
      $set: {
        ...document,
        updatedAt: now,
      },
      $setOnInsert: {
        _id,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

async function seedKnowledge() {
  for (const doc of knowledgeDocuments) {
    await upsertOne('knowledge_documents', doc._id, {
      tenantId,
      title: doc.title,
      category: doc.category,
      ownerDepartment: doc.ownerDepartment,
      sourceUri: doc.sourceUri,
      parserName: 'seed',
      summary: doc.summary,
      rawText: doc.chunks.join('\n\n'),
      status: 'ready',
      visibility: doc.visibility,
      chunksCount: doc.chunks.length,
      tokensEstimate: doc.chunks.join('').length,
      lastIndexedAt: now,
      createdBy: 'seed',
    });

    for (const [index, content] of doc.chunks.entries()) {
      const chunkId = new Types.ObjectId(`6650000000000000001${doc._id.toString().slice(-3)}${index.toString().padStart(2, '0')}`);
      await upsertOne('knowledge_chunks', chunkId, {
        tenantId,
        documentId: doc._id,
        chunkIndex: index,
        content,
        embedding: [],
        metadata: {
          seeded: true,
          title: doc.title,
          category: doc.category,
        },
      });
    }

    await upsertOne('knowledge_ingestion_runs', new Types.ObjectId(`6650000000000000002${doc._id.toString().slice(-3)}00`), {
      tenantId,
      documentId: doc._id,
      status: 'completed',
      chunksCreated: doc.chunks.length,
    });
  }
}

async function seedConnectors() {
  for (const connector of connectors) {
    await upsertOne('connectors', connector._id, {
      tenantId,
      key: connector.key,
      displayName: connector.displayName,
      type: connector.type,
      systemName: connector.systemName,
      baseUrl: connector.baseUrl,
      authMode: connector.authMode,
      status: connector.status,
      ownerDepartment: connector.ownerDepartment,
      dataDomains: connector.dataDomains,
      capabilities: connector.capabilities,
      syncPolicy: connector.syncPolicy,
      metadata: { seeded: true },
      lastHealthCheckAt: now,
      lastHealthStatus: connector.status === 'active' ? 'healthy' : 'unknown',
    });
  }
}

async function seedSkills() {
  for (const submission of skillSubmissions) {
    await upsertOne('skill_submissions', submission._id, {
      tenantId,
      submittedBy: submission.submittedBy,
      manifest: submission.manifest,
      status: submission.status,
      reviewerId: 'platform-admin',
      reviewComment: submission.status === 'approved' ? '已通过审核，等待发布。' : '已审核并发布到默认能力库。',
      reviewedAt: now,
    });
  }

  const installed = [
    { _id: ids.ticketInstalled, submissionId: ids.ticketSubmission, manifest: skillSubmissions[0].manifest, enabled: true },
    { _id: ids.leadInstalled, submissionId: ids.leadSubmission, manifest: skillSubmissions[1].manifest, enabled: true },
    { _id: ids.knowledgeInstalled, submissionId: ids.knowledgeSubmission, manifest: skillSubmissions[3].manifest, enabled: true },
  ];

  for (const skill of installed) {
    await upsertOne('installed_skills', skill._id, {
      tenantId,
      submissionId: skill.submissionId,
      name: skill.manifest.name,
      displayName: skill.manifest.displayName,
      version: skill.manifest.version,
      manifest: skill.manifest,
      enabled: skill.enabled,
      publishedToDefaultAgent: true,
    });
  }
}

async function seedAudit() {
  const events = [
    {
      _id: new Types.ObjectId('665000000000000000000301'),
      action: 'seed.knowledge.ready',
      resourceType: 'knowledge_document',
      resourceId: ids.sop.toString(),
      detail: { title: '园区报修处理 SOP' },
    },
    {
      _id: new Types.ObjectId('665000000000000000000302'),
      action: 'seed.skill.publish',
      resourceType: 'installed_skill',
      resourceId: ids.ticketInstalled.toString(),
      detail: { name: 'park-ticket-dispatch' },
    },
    {
      _id: new Types.ObjectId('665000000000000000000303'),
      action: 'seed.skill.approved',
      resourceType: 'skill_submission',
      resourceId: ids.contractSubmission.toString(),
      detail: { name: 'contract-risk-review', status: 'approved' },
    },
  ];

  for (const event of events) {
    await upsertOne('audit_events', event._id, {
      tenantId,
      actorId: 'seed',
      actorName: '企业平台初始化',
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      detail: event.detail,
      result: 'success',
    });
  }
}

async function main() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/workmate_agent_platform';
  await connect(uri);
  await seedConnectors();
  await seedKnowledge();
  await seedSkills();
  await seedAudit();

  const [connectorCount, knowledgeCount, submissionCount, installedCount] = await Promise.all([
    connection.db?.collection('connectors').countDocuments({ tenantId }),
    connection.db?.collection('knowledge_documents').countDocuments({ tenantId }),
    connection.db?.collection('skill_submissions').countDocuments({ tenantId }),
    connection.db?.collection('installed_skills').countDocuments({ tenantId }),
  ]);

  console.log(`Seeded WorkMate data: connectors=${connectorCount ?? 0}, knowledge=${knowledgeCount ?? 0}, submissions=${submissionCount ?? 0}, installed=${installedCount ?? 0}`);
  await connection.close();
}

main().catch(async (error) => {
  console.error(error);
  await connection.close().catch(() => undefined);
  process.exitCode = 1;
});

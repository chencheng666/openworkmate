export const KNOWLEDGE_SEARCH_TOOL_NAME = 'workmate_knowledge_search';

export type KnowledgeToolDeclaration = {
  name: typeof KNOWLEDGE_SEARCH_TOOL_NAME;
  title: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
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
    endpoint: '/api/knowledge/runtime/execute';
  };
};

export function buildKnowledgeSearchToolDeclaration(): KnowledgeToolDeclaration {
  return {
    name: KNOWLEDGE_SEARCH_TOOL_NAME,
    title: '企业企业知识库检索',
    description: [
      '按当前员工的租户、组织、角色和个人权限检索企业内部知识。',
      '适用于制度、SOP、合同规则、政策材料、园区资料和历史案例问答。',
      '返回回答草稿以及可追溯到文档和原文片段的引用证据。',
      '回答时必须严格区分制度原文、基于制度的推断、知识库未规定，不得把推断说成制度条款，也不得补写资料未提供的金额、处罚或责任结论。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '员工提出的完整业务问题，不要只传关键词。',
          minLength: 2,
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: '可选知识分类，例如运营制度、合同规则、政策服务。',
        },
        topK: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          default: 6,
          description: '最多返回的引用片段数。',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    governance: {
      actionKind: 'read',
      riskLevel: 'low',
      requiredScopes: ['knowledge:read'],
      dataDomains: ['企业知识', '制度', 'SOP', '合同规则', '园区资料'],
      permissionStrategy: 'request-context',
      humanConfirmationRequired: false,
      auditLevel: 'standard',
    },
    execution: {
      transport: 'workmate-knowledge-runtime',
      endpoint: '/api/knowledge/runtime/execute',
    },
  };
}

const TOOL_NAME = 'workmate_knowledge_search';
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:18790/api';

export function resolveKnowledgePluginConfig(value) {
  const config = value && typeof value === 'object' ? value : {};
  return {
    backendUrl: typeof config.backendUrl === 'string' && config.backendUrl.trim()
      ? config.backendUrl.trim().replace(/\/$/, '')
      : DEFAULT_BACKEND_URL,
    tenantId: typeof config.tenantId === 'string' && config.tenantId.trim()
      ? config.tenantId.trim()
      : 'workmate',
    defaultOrgId: typeof config.defaultOrgId === 'string' && config.defaultOrgId.trim()
      ? config.defaultOrgId.trim()
      : 'headquarters',
    roleIds: Array.isArray(config.roleIds)
      ? config.roleIds.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
      : ['employee'],
  };
}

export function buildKnowledgeRequestHeaders(context, config) {
  const userId = context?.requesterSenderId || context?.agentId || 'openclaw-user';
  return {
    'content-type': 'application/json',
    'x-tenant-id': config.tenantId,
    'x-user-id': userId,
    'x-user-name': userId,
    'x-org-id': config.defaultOrgId,
    'x-role-ids': config.roleIds.join(','),
  };
}

function buildTool(api, context) {
  const config = resolveKnowledgePluginConfig(api.pluginConfig);
  return {
    name: TOOL_NAME,
    label: '企业企业知识库检索',
    description: '检索企业内部制度、SOP、合同规则、政策、园区资料和历史案例。遇到企业业务事实、办理规则、流程口径或内部资料问题时优先调用；回答必须保留返回的引用来源，并严格区分制度原文、基于制度的推断、知识库未规定，不得把推断说成制度条款。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 2,
          description: '员工提出的完整业务问题。',
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
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(toolCallId, params, signal) {
      const response = await fetch(`${config.backendUrl}/knowledge/runtime/execute`, {
        method: 'POST',
        headers: buildKnowledgeRequestHeaders(context, config),
        body: JSON.stringify({
          toolName: TOOL_NAME,
          requestId: toolCallId,
          input: {
            query: params.query,
            categories: params.categories,
            topK: params.topK,
          },
        }),
        signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.result) {
        const message = payload?.message || payload?.error || `HTTP ${response.status}`;
        throw new Error(`企业知识库暂不可用：${message}`);
      }

      const result = payload.result;
      return {
        content: [{
          type: 'text',
        text: JSON.stringify({
          answer: result.answerDraft,
          citations: result.citations,
          answerPolicy: [
            '制度原文：只陈述引用片段明确写出的规则，并标注文档和章节。',
            '基于制度的推断：必须明确标注为推断，不得包装成制度明确规定。',
            '知识库未规定：没有写明的金额、处罚、时限、责任认定或例外，必须说明未规定，不得自行编造。',
          ],
          auditRecorded: payload.audit?.recorded === true,
          }, null, 2),
        }],
        details: payload,
      };
    },
  };
}

export default {
  id: 'workmate-knowledge',
  name: '企业企业知识库',
  description: '提供受权限控制、带引用和审计的企业企业知识检索。',
  register(api) {
    api.registerTool((context) => buildTool(api, context));
  },
};

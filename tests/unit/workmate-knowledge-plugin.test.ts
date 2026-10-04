import { describe, expect, it, vi } from 'vitest';
import {
  buildKnowledgeRequestHeaders,
  default as knowledgePlugin,
  resolveKnowledgePluginConfig,
} from '../../resources/openclaw-plugins/workmate-knowledge/index.js';

describe('OpenClaw 企业知识库插件', () => {
  it('使用可信会话身份构建后端权限请求头', () => {
    const config = resolveKnowledgePluginConfig({
      backendUrl: 'http://knowledge.internal/api/',
      tenantId: 'workmate-test',
      defaultOrgId: 'park-001',
      roleIds: ['park-operator'],
    });
    const headers = buildKnowledgeRequestHeaders({
      requesterSenderId: 'employee-001',
      agentId: 'main',
    }, config);

    expect(config.backendUrl).toBe('http://knowledge.internal/api');
    expect(headers['x-user-id']).toBe('employee-001');
    expect(headers['x-tenant-id']).toBe('workmate-test');
    expect(headers['x-org-id']).toBe('park-001');
    expect(headers['x-role-ids']).toBe('park-operator');
  });

  it('缺少配置时使用企业本地默认值', () => {
    const config = resolveKnowledgePluginConfig(undefined);
    expect(config.backendUrl).toBe('http://127.0.0.1:18790/api');
    expect(config.tenantId).toBe('workmate');
    expect(config.roleIds).toEqual(['employee']);
  });

  it('向 OpenClaw 注册工具并调用 Knowledge Runtime', async () => {
    const registerTool = vi.fn();
    knowledgePlugin.register({
      pluginConfig: { backendUrl: 'http://127.0.0.1:18790/api' },
      registerTool,
    });
    const factory = registerTool.mock.calls[0][0];
    const tool = factory({ requesterSenderId: 'employee-002' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'executed',
      result: {
        answerDraft: '按园区报修 SOP 升级处理。',
        citations: [{ title: '园区报修 SOP', snippet: '超过 24 小时应升级。' }],
      },
      audit: { recorded: true },
    }), { status: 200 }));

    const result = await tool.execute('tool-call-001', {
      query: '园区报修超过 24 小时怎么办',
      topK: 4,
    });

    expect(tool.name).toBe('workmate_knowledge_search');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:18790/api/knowledge/runtime/execute',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-user-id': 'employee-002' }),
      }),
    );
    expect(result.content[0].text).toContain('园区报修 SOP');
    fetchMock.mockRestore();
  });
});

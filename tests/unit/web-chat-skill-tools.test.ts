import { describe, expect, it, vi } from 'vitest';
import { WebChatService } from '../../backend/src/modules/web-chat/web-chat.service';

describe('Web 对话 Skill Tool 编排', () => {
  it('会执行模型选择的已启用 Skill，并把结果回传模型生成最终回答', async () => {
    const config = {
      get: (key: string) => ({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test/v1',
        DEEPSEEK_MODEL: 'deepseek-chat',
      }[key]),
    };
    const knowledge = {
      executeTool: vi.fn().mockResolvedValue({ result: { answerDraft: '知识库命中', citations: [] } }),
    };
    const skills = {
      listRuntimeTools: vi.fn().mockResolvedValue([{
        name: 'workmate_skill_ticket-query',
        skillName: 'ticket-query',
        description: '查询园区工单',
        inputSchema: { type: 'object', properties: { businessGoal: { type: 'string' } }, required: ['businessGoal'], additionalProperties: false },
      }]),
      execute: vi.fn().mockResolvedValue({ status: 'executed', result: { records: [{ ticketId: 'TK-1' }] } }),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'workmate_skill_ticket-query', arguments: '{"businessGoal":"查询超时工单"}' } }] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '已查询到 1 条工单。' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new WebChatService(config as never, knowledge as never, skills as never);
    const result = await service.chat({
      tenantId: 'workmate', userId: 'user-1', userName: '张三', orgId: 'ops', roleIds: ['platform-admin'], parkIds: [],
    }, { message: '查询超时工单', sessionId: 'session-1', history: [] });

    expect(result.answer).toBe('已查询到 1 条工单。');
    expect(skills.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      skillName: 'ticket-query',
      input: { businessGoal: '查询超时工单' },
    }));
    expect(result.skillExecutions).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

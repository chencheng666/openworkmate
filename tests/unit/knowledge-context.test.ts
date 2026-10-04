import { describe, expect, it, vi } from 'vitest';

const { executeKnowledgeTool } = vi.hoisted(() => ({ executeKnowledgeTool: vi.fn() }));

vi.mock('@/lib/enterprise-api', () => ({
  enterpriseApi: { executeKnowledgeTool },
}));

import { buildKnowledgeAugmentedPrompt, prefetchWorkMateKnowledge, stripKnowledgeContext } from '@/stores/chat/knowledge-context';

describe('桌面对话知识库上下文', () => {
  it('把知识库命中片段带入模型请求，并保留来源', async () => {
    executeKnowledgeTool.mockResolvedValueOnce({
      result: {
        query: '园区报修超过 24 小时未响应怎么办？',
        answerDraft: '应提醒责任部门并升级给园区负责人。',
        citations: [{
          title: '园区报修处理 SOP',
          category: '运营制度',
          snippet: '普通报修 24 小时未响应时，应提醒责任部门并升级给园区负责人。',
        }],
      },
    });

    const context = await prefetchWorkMateKnowledge('园区报修超过 24 小时未响应怎么办？');
    const prompt = buildKnowledgeAugmentedPrompt('园区报修超过 24 小时未响应怎么办？', context);

    expect(prompt).toContain('园区报修处理 SOP');
    expect(prompt).toContain('24 小时未响应');
    expect(stripKnowledgeContext(prompt)).toBe('园区报修超过 24 小时未响应怎么办？');
    expect(executeKnowledgeTool).toHaveBeenCalledWith({ query: '园区报修超过 24 小时未响应怎么办？', topK: 6 });
  });

  it('没有命中时保持原始问题，不阻塞普通对话', async () => {
    executeKnowledgeTool.mockResolvedValueOnce({ result: { query: '你好', answerDraft: '', citations: [] } });

    const context = await prefetchWorkMateKnowledge('你好');

    expect(context).toBe('');
    expect(buildKnowledgeAugmentedPrompt('你好', context)).toBe('你好');
  });
});

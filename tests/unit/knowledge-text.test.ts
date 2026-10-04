import { describe, expect, it } from 'vitest';
import {
  buildAnswerDraft,
  buildKnowledgeChunks,
  rankKnowledgeChunks,
  tokenizeKnowledgeText,
} from '../../backend/src/modules/knowledge/knowledge-text';

describe('企业知识库文本处理', () => {
  it('能把知识正文切成可检索片段', () => {
    const chunks = buildKnowledgeChunks([
      '普通报修 24 小时未响应时，系统应提醒责任部门并升级给园区负责人。',
      '',
      '影响企业办公或安全的报修应标记为高优先级，派单后 2 小时内必须确认处理计划。',
    ].join('\n'), { title: '园区报修处理 SOP' }, 40);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].metadata.title).toBe('园区报修处理 SOP');
  });

  it('能按中文业务问题命中相关片段', () => {
    const tokens = tokenizeKnowledgeText('园区报修超过 24 小时怎么办');
    expect(tokens).toContain('报修');

    const ranked = rankKnowledgeChunks('园区报修超过 24 小时怎么办', [
      { content: '普通报修 24 小时未响应时，系统应提醒责任部门并升级给园区负责人。' },
      { content: '合同涉及租金减免时，必须进入法务复核。' },
    ]);

    expect(ranked[0].content).toContain('24 小时');
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it('配置向量时按关键词与余弦相似度混合排序', () => {
    const ranked = rankKnowledgeChunks('报修升级', [
      { content: '普通报修需要升级处理。', embedding: [1, 0] },
      { content: '合同审批规则。', embedding: [0.99, 0.01] },
    ], 2, { queryEmbedding: [1, 0] });

    expect(ranked[0].content).toContain('报修');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('能生成带引用口径的回答草稿', () => {
    const answer = buildAnswerDraft({
      query: '合同优惠需要谁复核',
      rankedChunks: [{
        title: '招商合同审批规则',
        category: '合同规则',
        content: '合同涉及租金减免、超标准优惠或非标付款节点时，必须进入法务和城市公司负责人复核。',
        score: 10,
        highlights: ['合同', '优惠'],
      }],
    });

    expect(answer).toContain('招商合同审批规则');
    expect(answer).toContain('人工确认');
  });
});

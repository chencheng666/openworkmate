import { describe, expect, it } from 'vitest';
import { buildDemoAnswer } from '../../backend/src/modules/web-chat/demo-answer';

describe('公开演示模式', () => {
  it('明确标记演示模式，只使用检索片段，不编造处罚', () => {
    const answer = buildDemoAnswer([{ title: '工单示例制度', snippet: '普通工单应在 24 小时内首次响应。' }]);
    expect(answer).toContain('未调用大模型');
    expect(answer).toContain('普通工单应在 24 小时内首次响应。');
    expect(answer).toContain('演示模式不生成推断');
    expect(answer).not.toContain('罚款 100');
  });
  it('没有可见资料时明确说明未检索到', () => {
    expect(buildDemoAnswer([])).toContain('没有检索到相关资料');
  });
});

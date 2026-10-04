type DemoCitation = { title?: string; snippet?: string };

// 演示模式只展示真实检索片段，不伪造模型回复或真实业务执行结果。
export function buildDemoAnswer(citations: DemoCitation[]) {
  const evidence = citations.filter((item) => item.snippet?.trim()).slice(0, 3);
  return [
    '> 本地演示模式：以下为示例知识库的检索片段，未调用大模型，也未执行业务写入。',
    '', '制度原文：',
    evidence.length ? evidence.map((item, index) => `### ${index + 1}. ${item.title || '知识文档'}\n\n${item.snippet}`).join('\n\n')
      : '当前可见知识库没有检索到相关资料，请先在管理后台导入示例文档。',
    '', '基于制度的推断：', '演示模式不生成推断。请结合原文核查适用条件，配置模型后可生成进一步分析。',
    '', '知识库未规定：', '检索片段未明确规定的金额、处罚、责任认定和例外条件，不能作为确定结论。',
    '', '如需真实 AI 对话，请关闭后端 WEB_CHAT_DEMO_MODE 并配置服务端模型密钥。',
  ].join('\n');
}

import { enterpriseApi, type KnowledgeSearchResult } from '@/lib/enterprise-api';

const MAX_CONTEXT_CHARS = 6_000;
const KNOWLEDGE_CONTEXT_START = '<!-- workmate-knowledge-context -->';
const KNOWLEDGE_CONTEXT_END = '<!-- /workmate-knowledge-context -->';

function formatKnowledgeContext(result: KnowledgeSearchResult): string {
  const citations = result.citations
    .filter((citation) => citation.snippet?.trim())
    .slice(0, 6)
    .map((citation, index) => {
      const source = `${citation.title}${citation.category ? ` / ${citation.category}` : ''}`;
      return `${index + 1}. 来源：${source}\n   内容：${citation.snippet}`;
    })
    .join('\n');

  if (!citations) return '';

  const context = [
    '[企业企业知识库检索上下文]',
    '以下内容由企业 Knowledge Runtime 按当前员工权限检索得到。请优先依据这些资料回答原始问题，不要编造资料之外的企业内部规则；回答中保留来源标题。',
    '回答必须严格区分三类内容：',
    '1. 制度原文：只能表述检索片段中明确写出的规则，并标注来源标题和章节（如资料提供章节）。',
    '2. 基于制度的推断：可以在原文之后给出，但必须明确写“基于制度的推断”，不得说成制度明确规定。',
    '3. 知识库未规定：资料没有写明的金额、处罚、时限、责任认定或例外，不得自行补充，必须明确写“知识库未规定”。',
    '当资料不足时，先说明“知识库暂未查到”，再给出通用建议，并明确通用建议不是企业制度口径。',
    `知识库摘要：${result.answerDraft}`,
    '来源片段：',
    citations,
    '[知识库检索上下文结束]',
  ].join('\n');

  return context.slice(0, MAX_CONTEXT_CHARS);
}

export async function prefetchWorkMateKnowledge(query: string): Promise<string> {
  if (query.trim().length < 2) return '';

  try {
    const result = await enterpriseApi.executeKnowledgeTool({ query: query.trim(), topK: 6 });
    return formatKnowledgeContext(result.result);
  } catch (error) {
    // 知识库不可用时不阻塞普通对话，仍让模型回答原始问题。
    console.warn('[knowledge] 桌面对话预检索失败:', error);
    return '';
  }
}

export function buildKnowledgeAugmentedPrompt(query: string, context: string): string {
  return context ? `${query}\n\n${KNOWLEDGE_CONTEXT_START}\n${context}\n${KNOWLEDGE_CONTEXT_END}` : query;
}

export function stripKnowledgeContext(text: string): string {
  const markerIndex = text.indexOf(KNOWLEDGE_CONTEXT_START);
  return markerIndex >= 0 ? text.slice(0, markerIndex).trimEnd() : text;
}

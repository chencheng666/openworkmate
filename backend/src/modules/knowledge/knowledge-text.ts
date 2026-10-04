export type KnowledgeChunkInput = {
  content: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
};

export type RankedKnowledgeChunk<T extends { content: string }> = T & {
  score: number;
  highlights: string[];
};

export type KnowledgeRankingOptions = {
  queryEmbedding?: number[];
};

const CHINESE_TOKEN_PATTERN = /[\u4e00-\u9fa5]{2,}|[a-zA-Z0-9][a-zA-Z0-9_-]{1,}/g;

export function normalizeKnowledgeText(input?: string): string {
  return (input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function estimateTokens(text: string): number {
  const normalized = normalizeKnowledgeText(text);
  if (!normalized) return 0;
  return Math.ceil(normalized.length / 1.8);
}

export function tokenizeKnowledgeText(input: string): string[] {
  const normalized = normalizeKnowledgeText(input).toLowerCase();
  const tokens = normalized.match(CHINESE_TOKEN_PATTERN) ?? [];
  const splitTokens = tokens.flatMap((token) => {
    if (/^[\u4e00-\u9fa5]+$/.test(token) && token.length > 2) {
      const parts = new Set<string>([token]);
      for (let index = 0; index < token.length - 1; index += 1) {
        parts.add(token.slice(index, index + 2));
      }
      return [...parts];
    }
    return [token];
  });
  return [...new Set(splitTokens)].filter((token) => token.length >= 2);
}

export function buildKnowledgeChunks(
  content: string,
  metadata: Record<string, unknown> = {},
  chunkSize = 520,
): KnowledgeChunkInput[] {
  const normalized = normalizeKnowledgeText(content);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = '';

  for (const paragraph of paragraphs) {
    if (!buffer) {
      buffer = paragraph;
      continue;
    }
    if (buffer.length + paragraph.length + 2 <= chunkSize) {
      buffer = `${buffer}\n\n${paragraph}`;
      continue;
    }
    chunks.push(buffer);
    buffer = paragraph;
  }
  if (buffer) chunks.push(buffer);

  return chunks.flatMap((chunk) => {
    if (chunk.length <= chunkSize * 1.35) return [chunk];
    const slices: string[] = [];
    for (let start = 0; start < chunk.length; start += chunkSize) {
      slices.push(chunk.slice(start, start + chunkSize));
    }
    return slices;
  }).map((chunk, index) => ({
    content: chunk,
    chunkIndex: index,
    metadata: {
      ...metadata,
      tokensEstimate: estimateTokens(chunk),
    },
  }));
}

export function rankKnowledgeChunks<T extends { content: string }>(
  query: string,
  chunks: T[],
  topK = 6,
  options: KnowledgeRankingOptions = {},
): Array<RankedKnowledgeChunk<T>> {
  const queryTokens = tokenizeKnowledgeText(query);
  if (queryTokens.length === 0) return [];

  const keywordRanked = chunks
    .map((chunk) => {
      const content = chunk.content.toLowerCase();
      const highlights = queryTokens.filter((token) => content.includes(token));
      const exactBonus = normalizeKnowledgeText(chunk.content).includes(normalizeKnowledgeText(query)) ? 3 : 0;
      const keywordScore = highlights.reduce((sum, token) => {
        const occurrences = content.split(token).length - 1;
        return sum + Math.max(1, occurrences) * Math.min(token.length, 8);
      }, exactBonus);
      const vectorScore = options.queryEmbedding && Array.isArray((chunk as T & { embedding?: number[] }).embedding)
        ? cosineSimilarity(options.queryEmbedding, (chunk as T & { embedding?: number[] }).embedding ?? [])
        : 0;
      return { ...chunk, keywordScore, vectorScore, highlights };
    });
  const maxKeyword = Math.max(1, ...keywordRanked.map((chunk) => chunk.keywordScore));
  return keywordRanked
    .map((chunk) => ({
      ...chunk,
      score: options.queryEmbedding
        ? (chunk.keywordScore / maxKeyword) * 60 + chunk.vectorScore * 40
        : chunk.keywordScore,
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? Math.max(0, dot / Math.sqrt(leftNorm * rightNorm)) : 0;
}

export function buildAnswerDraft(input: {
  query: string;
  rankedChunks: Array<RankedKnowledgeChunk<{ content: string; title?: string; category?: string }>>;
}): string {
  if (input.rankedChunks.length === 0) {
    return '知识库暂未命中可引用内容。建议补充相关制度、SOP、合同规则或扩大检索分类后重试。';
  }

  const top = input.rankedChunks.slice(0, 3);
  const evidence = top.map((chunk, index) => {
    const source = [chunk.title, chunk.category].filter(Boolean).join(' / ');
    const excerpt = normalizeKnowledgeText(chunk.content).slice(0, 140);
    return `${index + 1}. ${source ? `${source}：` : ''}${excerpt}${excerpt.length >= 140 ? '...' : ''}`;
  });

  return [
    `根据企业知识库，针对“${input.query}”可先按以下口径处理：`,
    ...evidence,
    '建议执行时继续结合用户岗位权限、园区范围和对应业务系统数据；涉及写入、审批或对外通知时，需要走人工确认并记录审计。'
  ].join('\n');
}

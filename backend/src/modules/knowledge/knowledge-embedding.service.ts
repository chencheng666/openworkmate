import { Injectable } from '@nestjs/common';

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
};

/**
 * 可选的 OpenAI 兼容 Embedding 客户端。
 * 未配置时保持纯关键词检索，配置后由知识索引和查询共同使用同一模型。
 */
@Injectable()
export class KnowledgeEmbeddingService {
  get modelId() {
    return [process.env.KNOWLEDGE_EMBEDDING_BASE_URL?.trim().replace(/\/$/, ''), process.env.KNOWLEDGE_EMBEDDING_MODEL?.trim()].join('#');
  }
  isConfigured() {
    return Boolean(
      process.env.KNOWLEDGE_EMBEDDING_BASE_URL?.trim()
      && process.env.KNOWLEDGE_EMBEDDING_MODEL?.trim(),
    );
  }

  async embed(input: string | string[]): Promise<number[][] | null> {
    if (!this.isConfigured()) return null;
    if (Array.isArray(input) && input.length > 32) {
      const result: number[][] = [];
      for (let i = 0; i < input.length; i += 32) result.push(...await this.request(input.slice(i, i + 32)));
      return result;
    }
    return this.request(input);
  }

  private async request(input: string | string[]): Promise<number[][]> {
    const baseUrl = process.env.KNOWLEDGE_EMBEDDING_BASE_URL!.trim().replace(/\/$/, '');
    const model = process.env.KNOWLEDGE_EMBEDDING_MODEL!.trim();
    const timeoutMs = Number(process.env.KNOWLEDGE_EMBEDDING_TIMEOUT_MS || 15_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15_000);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = process.env.KNOWLEDGE_EMBEDDING_API_KEY?.trim() ||
        (baseUrl === 'https://api.openai.com/v1' ? process.env.OPENAI_API_KEY?.trim() : undefined);
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Embedding 服务返回 HTTP ${response.status}`);
      const payload = await response.json() as EmbeddingResponse;
      const data = [...(payload.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vectors = data.map((item) => item.embedding ?? []);
      if (vectors.length !== (Array.isArray(input) ? input.length : 1) || vectors.some((item, i) =>
        data[i].index !== i || !Array.isArray(item) || !item.length || item.length !== vectors[0].length || !item.every(Number.isFinite))) {
        throw new Error('Embedding 服务返回结果格式不完整。');
      }
      return vectors;
    } finally {
      clearTimeout(timer);
    }
  }
}

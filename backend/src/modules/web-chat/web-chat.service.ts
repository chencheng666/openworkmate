import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RequestContext } from '../../common/request-context';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KNOWLEDGE_SEARCH_TOOL_NAME } from '../knowledge/knowledge-tool-declaration';
import { SkillFactoryService } from '../skill-factory/skill-factory.service';
import { WebChatDto } from './dto/web-chat.dto';
import { buildDemoAnswer } from './demo-answer';

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string; tool_calls?: DeepSeekMessage['tool_calls'] } }>;
};

@Injectable()
export class WebChatService {
  constructor(
    private readonly config: ConfigService,
    private readonly knowledge: KnowledgeService,
    private readonly skills: SkillFactoryService,
  ) {}

  async chat(ctx: RequestContext, dto: WebChatDto) {
    const knowledgeRuntime = await this.knowledge.executeTool(ctx, {
      toolName: KNOWLEDGE_SEARCH_TOOL_NAME,
      requestId: randomUUID(),
      input: { query: dto.message, topK: 6 },
    });

    const citations = knowledgeRuntime.result.citations ?? [];
    if (this.config.get<string>('WEB_CHAT_DEMO_MODE') === 'true') {
      return { answer: buildDemoAnswer(citations), citations, mode: 'demo', skillExecutions: [] };
    }
    const evidence = citations
      .filter((citation) => citation.snippet?.trim())
      .slice(0, 6)
      .map((citation, index) => `${index + 1}. ${citation.title}${citation.category ? ` / ${citation.category}` : ''}\n${citation.snippet}`)
      .join('\n\n');

    const systemPrompt = [
      '你是OpenWorkMate，服务示例企业内部员工。',
      '只围绕企业园区运营、企业服务、招商、OA、工单、CRM、合同、BI 和企业制度回答。',
      '回答必须严格区分三类依据：',
      '1. 制度原文：只能陈述知识库片段明确写出的规则，并标注文档名称和章节。',
      '2. 基于制度的推断：可以给出，但必须明确写“基于制度的推断”，不得说成制度明确规定。',
      '3. 知识库未规定：资料没有写明的金额、处罚、时限、责任认定或例外，必须明确写“知识库未规定”，不得自行编造。',
      '资料不足时先说明知识库未查到，再给通用建议，并明确通用建议不是企业制度口径。',
      '回答专业、简洁、中文优先，先给结论，再给依据和下一步。',
    ].join('\n');

    const knowledgePrompt = [
      '[企业企业知识库检索结果]',
      `摘要：${knowledgeRuntime.result.answerDraft}`,
      evidence ? `引用片段：\n${evidence}` : '引用片段：无',
      '[检索结果结束]',
    ].join('\n');

    const runtimeTools = await this.skills.listRuntimeTools(ctx);
    const skillTools = runtimeTools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    const messages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(runtimeTools.length > 0 ? [{
        role: 'system' as const,
        content: `可用企业业务 Skill：${runtimeTools.map((tool) => `${tool.name}（${tool.description}）`).join('；')}。只有确实需要执行业务动作时才调用 Skill。`,
      }] : []),
      ...(dto.history ?? []).slice(-10).map((item) => ({ role: item.role, content: item.content })),
      { role: 'user', content: `${dto.message}\n\n${knowledgePrompt}` },
    ];

    const apiKey = await this.resolveApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException('Web 对话尚未配置 DeepSeek 服务端密钥。');
    }

    const baseUrl = (this.config.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com/v1').replace(/\/$/, '');
    const model = this.config.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-chat';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      let answer = '';
      const skillExecutions: unknown[] = [];
      for (let round = 0; round < 3; round += 1) {
        const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 1800,
          ...(skillTools.length > 0 ? { tools: skillTools, tool_choice: 'auto' } : {}),
        }),
        signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as DeepSeekResponse | { error?: { message?: string } } | null;
        if (!response.ok) {
          const message = payload && 'error' in payload && payload.error?.message
            ? payload.error.message
            : `DeepSeek 请求失败（HTTP ${response.status}）`;
          throw new BadGatewayException(message);
        }

        const assistantMessage = payload && 'choices' in payload ? (payload as DeepSeekResponse).choices?.[0]?.message : undefined;
        const toolCalls = assistantMessage?.tool_calls ?? [];
        if (toolCalls.length === 0) {
          answer = assistantMessage?.content?.trim() || '';
          break;
        }

        messages.push({ role: 'assistant', content: assistantMessage?.content ?? '', tool_calls: toolCalls });
        for (const call of toolCalls) {
          const runtimeTool = runtimeTools.find((tool) => tool.name === call.function.name);
          let result: unknown;
          if (!runtimeTool) {
            result = { status: 'blocked', reason: '未找到或无权使用该 Skill。' };
          } else {
            let input: Record<string, unknown>;
            try {
              input = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
            } catch {
              input = {};
            }
            result = await this.skills.execute(ctx, {
              skillName: runtimeTool.skillName,
              input,
              requestId: dto.sessionId,
            });
            skillExecutions.push({ skillName: runtimeTool.skillName, result });
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }
      if (!answer) throw new BadGatewayException('DeepSeek 未返回有效回答。');

      return {
        sessionId: dto.sessionId || randomUUID(),
        answer,
        citations,
        retrieval: knowledgeRuntime.result.retrieval,
        skillExecutions,
        knowledgeHit: citations.length > 0,
        model,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('企业智能体生成回答超时，请稍后重试。');
      }
      throw new BadGatewayException(`企业智能体暂时无法生成回答：${String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveApiKey(): Promise<string | undefined> {
    return this.config.get<string>('DEEPSEEK_API_KEY')?.trim() || undefined;
  }
}

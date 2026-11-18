import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RequestContext } from '../../common/request-context';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KNOWLEDGE_SEARCH_TOOL_NAME } from '../knowledge/knowledge-tool-declaration';
import { SkillFactoryService } from '../skill-factory/skill-factory.service';
import { WebChatDto } from './dto/web-chat.dto';
import { buildDemoAnswer } from './demo-answer';
import { chatProvider } from './chat-provider';
import {answerWithTools,ResponsesPermissionError} from './responses-tools';

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

type DeepSeekResponse = {
  model?: string;
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
    const general = dto.mode === 'general';
    const demo = this.config.get<string>('WEB_CHAT_DEMO_MODE') === 'true';
    if (general && demo) throw new ServiceUnavailableException('当前是演示模式。通用问答需要管理员开启真实模型服务。');
    const knowledgeRuntime = general ? undefined : await this.knowledge.executeTool(ctx, {
      toolName: KNOWLEDGE_SEARCH_TOOL_NAME,
      requestId: randomUUID(),
      input: { query: dto.message, topK: 6 },
    });

    const citations = knowledgeRuntime?.result.citations ?? [];
    if (demo) {
      return { answer: buildDemoAnswer(citations), citations, mode: 'demo', skillExecutions: [] };
    }
    const evidence = citations
      .filter((citation) => citation.snippet?.trim())
      .slice(0, 6)
      .map((citation, index) => `${index + 1}. ${citation.title}${citation.category ? ` / ${citation.category}` : ''}\n${citation.snippet}`)
      .join('\n\n');

    const systemPrompt = general
      ? '你是通用问答助手，可以就不同主题直接回答。使用用户的语言；不确定时说明不确定。你没有访问企业资料、业务系统或实时联网检索的能力。不要虚构图片或下载链接。如果用户想看图，可以提示输入「找图：主题」或「画：主题」，由独立图片服务处理。'
      : [
      '你是企业内部员工的工作助手。',
      '只围绕企业园区运营、企业服务、招商、OA、工单、CRM、合同、BI 和企业制度回答。',
      '回答必须严格区分三类依据：',
      '1. 制度原文：只能陈述知识库片段明确写出的规则，并标注文档名称和章节。',
      '2. 基于制度的推断：可以给出，但必须明确写“基于制度的推断”，不得说成制度明确规定。',
      '3. 知识库未规定：资料没有写明的金额、处罚、时限、责任认定或例外，必须明确写“知识库未规定”，不得自行编造。',
      '资料不足时先说明知识库未查到，再给通用建议，并明确通用建议不是企业制度口径。',
      '回答专业、简洁、中文优先，先给结论，再给依据和下一步。',
      '可用 Markdown 表格整理数据，注明来自用户还是企业资料。没有已生成的文件时，不得虚构图片、视频、附件或下载地址。',
    ].join('\n');

    const knowledgePrompt = knowledgeRuntime ? [
      '[企业知识库检索结果]',
      `摘要：${knowledgeRuntime.result.answerDraft}`,
      evidence ? `引用片段：\n${evidence}` : '引用片段：无',
      '[检索结果结束]',
    ].join('\n') : '';

    const runtimeTools = general ? [] : await this.skills.listRuntimeTools(ctx);
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
      { role: 'user', content: general ? dto.message : `${dto.message}\n\n${knowledgePrompt}` },
    ];

    const { openai, apiKey, baseUrl, model } = chatProvider(this.config);
    if (!apiKey) {
      throw new ServiceUnavailableException('Web 对话尚未配置所选模型的服务端密钥。');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      let answer = '';
      let providerModel: string | undefined;
      const skillExecutions: unknown[] = [];
      let toolsUnavailable=false;
      if(openai && skillTools.length>0 && model.startsWith('gpt-6')){
        try{
          ({answer,providerModel}=await answerWithTools({apiKey,model,messages,tools:skillTools.map(t=>t.function),signal:controller.signal,
            execute:async (name,input)=>{
              const tool=runtimeTools.find(t=>t.name===name)!;
              const result=await this.skills.execute(ctx,{skillName:tool.skillName,input,requestId:dto.sessionId});
              skillExecutions.push({skillName:tool.skillName,result});return result;
            },
          }));
        }catch(e){
          if(!(e instanceof ResponsesPermissionError))throw e;
          // 仅首轮、未执行业务前才允许改为纯知识回答，不重放可能已执行的动作。
          toolsUnavailable=true;
          messages.splice(1,1,{role:'system',content:'业务工具当前不可用。只能根据知识资料回答；不能声称已查询、创建或修改任何业务记录。'});
        }
      }
      for (let round = 0; !answer && round < 3; round += 1) {
        const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          ...(openai ? { max_completion_tokens: 1800 } : { temperature: 0.2, max_tokens: 1800 }),
          ...(skillTools.length > 0 && !toolsUnavailable ? { tools: skillTools, tool_choice: 'auto' } : {}),
        }),
        signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as DeepSeekResponse | { error?: { message?: string } } | null;
        if (!response.ok) {
          const message = `模型请求失败（HTTP ${response.status}），请检查后台模型权限、额度与可用地区。`;
          throw new BadGatewayException(message);
        }

        const completion = payload && 'choices' in payload ? payload : undefined;
        providerModel = completion?.model;
        const assistantMessage = completion?.choices?.[0]?.message;
        const toolCalls = assistantMessage?.tool_calls ?? [];
        if ((general||toolsUnavailable) && toolCalls.length) throw new BadGatewayException('当前问答不执行业务工具，请重新提问。');
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
      if (!answer) throw new BadGatewayException('模型未返回有效回答。');

      return {
        sessionId: dto.sessionId || randomUUID(),
        answer:toolsUnavailable?'业务工具暂不可用，本次未查询或操作业务系统。\n\n'+answer:answer,
        ...(toolsUnavailable?{toolStatus:'responses_permission_required'}:{}),
        citations,
        mode: general ? 'general' : 'enterprise',
        retrieval: knowledgeRuntime?.result.retrieval,
        skillExecutions,
        knowledgeHit: citations.length > 0,
        model,
        providerModel,
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

}

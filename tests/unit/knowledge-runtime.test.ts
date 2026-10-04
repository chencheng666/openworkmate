import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../backend/src/modules/knowledge/knowledge.schema', () => ({
  KnowledgeDocument: class KnowledgeDocument {},
  KnowledgeChunk: class KnowledgeChunk {},
  KnowledgeIngestionRun: class KnowledgeIngestionRun {},
}));

async function createService() {
  const { KnowledgeService } = await import('../../backend/src/modules/knowledge/knowledge.service');
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new KnowledgeService(
    {} as never,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
    {} as never,
  );
  return { service, audit };
}

const context = {
  tenantId: 'workmate',
  userId: 'user-001',
  userName: '测试员工',
  orgId: 'park-001',
  roleIds: ['park-operator'],
};

describe('企业知识库 Skill Runtime', () => {
  it('执行知识检索并返回可审计的结构化结果', async () => {
    const { service, audit } = await createService();
    vi.spyOn(service, 'search').mockResolvedValue({
      query: '园区报修超时怎么办',
      answerDraft: '按园区报修 SOP 升级处理。',
      citations: [{ documentId: 'doc-1', title: '园区报修 SOP' }],
    } as never);

    const result = await service.executeTool(context, {
      toolName: 'workmate_knowledge_search',
      requestId: 'req-001',
      input: { query: '园区报修超时怎么办', topK: 4 },
    });

    expect(service.search).toHaveBeenCalledWith(context, {
      query: '园区报修超时怎么办',
      topK: 4,
    });
    expect(result.status).toBe('executed');
    expect(result.result.citations).toHaveLength(1);
    expect(result.governance.requiredScopes).toContain('knowledge:read');
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({
      action: 'knowledge_runtime.execute',
      resourceId: 'workmate_knowledge_search',
    }));
  });

  it('拒绝执行未声明的知识库工具', async () => {
    const { service } = await createService();

    await expect(service.executeTool(context, {
      toolName: 'unknown_tool',
      input: { query: '测试问题' },
    })).rejects.toBeInstanceOf(NotFoundException);
  });
});

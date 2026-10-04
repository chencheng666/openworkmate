import { describe, expect, it, vi } from 'vitest';
import { KnowledgeIngestionWorker } from '../../backend/src/modules/knowledge/knowledge-ingestion.worker';
import type { KnowledgeService } from '../../backend/src/modules/knowledge/knowledge.service';

describe('KnowledgeIngestionWorker', () => {
  it('启动时恢复失联任务并持续领取排队任务', async () => {
    const knowledge = {
      recoverStaleIngestionRuns: vi.fn().mockResolvedValue(1),
      processNextQueuedIngestion: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
    } as unknown as KnowledgeService;
    const worker = new KnowledgeIngestionWorker(knowledge);

    await worker.onModuleInit();
    await vi.waitFor(() => {
      expect(knowledge.processNextQueuedIngestion).toHaveBeenCalledTimes(3);
    });
    expect(knowledge.recoverStaleIngestionRuns).toHaveBeenCalledOnce();
    worker.onModuleDestroy();
  });
});

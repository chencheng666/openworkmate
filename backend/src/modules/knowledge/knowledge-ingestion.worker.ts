import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

@Injectable()
export class KnowledgeIngestionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeIngestionWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly knowledge: KnowledgeService) {}

  async onModuleInit() {
    await this.knowledge.recoverStaleIngestionRuns();
    this.timer = setInterval(() => void this.tick(), 1_000);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (let index = 0; index < 3; index += 1) {
        const processed = await this.knowledge.processNextQueuedIngestion();
        if (!processed) break;
      }
    } catch (error) {
      this.logger.error('知识索引 Worker 执行失败', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }
}

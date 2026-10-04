import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import {
  KnowledgeChunk,
  KnowledgeChunkSchema,
  KnowledgeDocument,
  KnowledgeDocumentSchema,
  KnowledgeIngestionRun,
  KnowledgeIngestionRunSchema,
} from './knowledge.schema';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeFileParser } from './knowledge-file-parser';
import { KnowledgeIngestionWorker } from './knowledge-ingestion.worker';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeEmbeddingService } from './knowledge-embedding.service';
import { LocalKnowledgeObjectStorage } from './storage/local-knowledge-object-storage';
import { KNOWLEDGE_OBJECT_STORAGE } from './storage/knowledge-object-storage';

@Module({
  imports: [
    AuditModule,
    MongooseModule.forFeature([
      { name: KnowledgeDocument.name, schema: KnowledgeDocumentSchema },
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
      { name: KnowledgeIngestionRun.name, schema: KnowledgeIngestionRunSchema },
    ]),
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    KnowledgeEmbeddingService,
    KnowledgeFileParser,
    KnowledgeIngestionWorker,
    LocalKnowledgeObjectStorage,
    { provide: KNOWLEDGE_OBJECT_STORAGE, useExisting: LocalKnowledgeObjectStorage },
  ],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}

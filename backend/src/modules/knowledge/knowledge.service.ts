import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto';
import { ExecuteKnowledgeToolDto } from './dto/execute-knowledge-tool.dto';
import { ImportKnowledgeDocumentDto } from './dto/import-knowledge-document.dto';
import { SearchKnowledgeDto } from './dto/search-knowledge.dto';
import { UpdateKnowledgeDocumentDto } from './dto/update-knowledge-document.dto';
import {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeDocumentRecord,
  KnowledgeIngestionRun,
  KnowledgeIngestionRunRecord,
} from './knowledge.schema';
import { KnowledgeFileParseError, KnowledgeFileParser } from './knowledge-file-parser';
import { KnowledgeEmbeddingService } from './knowledge-embedding.service';
import {
  buildKnowledgeSearchToolDeclaration,
  KNOWLEDGE_SEARCH_TOOL_NAME,
} from './knowledge-tool-declaration';
import {
  KNOWLEDGE_OBJECT_STORAGE,
  type KnowledgeObjectStorage,
} from './storage/knowledge-object-storage';
import {
  buildAnswerDraft,
  buildKnowledgeChunks,
  estimateTokens,
  normalizeKnowledgeText,
  rankKnowledgeChunks,
} from './knowledge-text';

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectModel(KnowledgeDocument.name) private readonly documentModel: Model<KnowledgeDocument>,
    @InjectModel(KnowledgeChunk.name) private readonly chunkModel: Model<KnowledgeChunk>,
    @InjectModel(KnowledgeIngestionRun.name) private readonly runModel: Model<KnowledgeIngestionRun>,
    private readonly audit: AuditService,
    private readonly fileParser: KnowledgeFileParser,
    private readonly embedding: KnowledgeEmbeddingService,
    @Inject(KNOWLEDGE_OBJECT_STORAGE) private readonly objectStorage: KnowledgeObjectStorage,
  ) {}

  listToolDeclarations() {
    return [buildKnowledgeSearchToolDeclaration()];
  }

  async executeTool(ctx: RequestContext, dto: ExecuteKnowledgeToolDto) {
    if (dto.toolName !== KNOWLEDGE_SEARCH_TOOL_NAME) {
      throw new NotFoundException(`Knowledge tool not found: ${dto.toolName}`);
    }

    const declaration = buildKnowledgeSearchToolDeclaration();
    const result = await this.search(ctx, dto.input);
    await this.audit.record(ctx, {
      action: 'knowledge_runtime.execute',
      resourceType: 'knowledge_tool',
      resourceId: declaration.name,
      detail: {
        requestId: dto.requestId,
        query: dto.input.query,
        categories: dto.input.categories,
        citations: result.citations.length,
      },
    });

    return {
      status: 'executed' as const,
      toolName: declaration.name,
      result,
      governance: declaration.governance,
      audit: {
        recorded: true,
        action: 'knowledge_runtime.execute',
      },
    };
  }

  async createDocument(ctx: RequestContext, dto: CreateKnowledgeDocumentDto) {
    const normalizedContent = normalizeKnowledgeText(dto.content);
    const created = await this.documentModel.create({
      tenantId: ctx.tenantId,
      title: this.requiredText(dto.title, '知识标题'),
      category: this.requiredText(dto.category, '知识分类'),
      ownerDepartment: this.requiredText(dto.ownerDepartment, '归属部门'),
      sourceUri: dto.sourceUri,
      summary: dto.summary,
      rawText: normalizedContent || undefined,
      visibility: this.buildVisibility(ctx, dto.visibility),
      status: normalizedContent ? 'indexing' : 'draft',
      createdBy: ctx.userId,
    });

    await this.audit.record(ctx, {
      action: 'knowledge.document.create',
      resourceType: 'knowledge_document',
      resourceId: created.id,
      detail: { title: created.title, category: created.category, hasContent: Boolean(normalizedContent) },
    });

    if (normalizedContent) {
      try {
        await this.queueIngestion(ctx, created, { sourceKind: 'document', trigger: 'create' });
      } catch (error) {
        created.status = 'failed';
        await created.save();
        throw error;
      }
      return this.getDocument(ctx, created.id);
    }

    return created;
  }

  async importDocument(ctx: RequestContext, dto: ImportKnowledgeDocumentDto) {
    let objectKey: string | undefined;
    let createdDocumentId: string | undefined;
    try {
      const fileBuffer = this.fileParser.prepareUpload({
        filename: dto.filename,
        fileBase64: dto.fileBase64,
      });
      const stored = await this.objectStorage.put({
        tenantId: ctx.tenantId,
        filename: dto.filename,
        data: fileBuffer,
      });
      objectKey = stored.key;
      const created = await this.documentModel.create({
        tenantId: ctx.tenantId,
        title: this.requiredText(dto.title, '知识标题'),
        category: this.requiredText(dto.category, '知识分类'),
        ownerDepartment: this.requiredText(dto.ownerDepartment, '归属部门'),
        summary: dto.summary,
        sourceUri: `object://${stored.key}`,
        sourceFileName: dto.filename,
        sourceMimeType: dto.mimeType,
        sourceFileSize: stored.size,
        sourceObjectKey: stored.key,
        visibility: this.buildVisibility(ctx, dto.visibility),
        status: 'indexing',
        createdBy: ctx.userId,
      });
      const documentId = String(created._id);
      createdDocumentId = documentId;
      const run = await this.queueIngestion(ctx, created, {
        sourceKind: 'object',
        objectKey: stored.key,
        originalFileName: dto.filename,
        mimeType: dto.mimeType,
        trigger: 'import',
      });
      await this.audit.record(ctx, {
        action: 'knowledge.document.create',
        resourceType: 'knowledge_document',
        resourceId: documentId,
        detail: { title: created.title, category: created.category, hasContent: true },
      });
      await this.audit.record(ctx, {
        action: 'knowledge.document.import.queued',
        resourceType: 'knowledge_document',
        resourceId: documentId,
        detail: {
          runId: run.id,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sourceFileSize: stored.size,
        },
      });
      return this.getDocument(ctx, documentId);
    } catch (error) {
      if (createdDocumentId) {
        await Promise.all([
          this.runModel.deleteMany({ tenantId: ctx.tenantId, documentId: createdDocumentId }),
          this.documentModel.deleteOne({ tenantId: ctx.tenantId, _id: createdDocumentId }),
        ]).catch(() => undefined);
      }
      if (objectKey) await this.objectStorage.delete(objectKey).catch(() => undefined);
      if (error instanceof KnowledgeFileParseError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async listDocuments(ctx: RequestContext, category?: string) {
    const query: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (!this.isKnowledgeManager(ctx)) {
      query.$or = [
        ...this.visibilityClauses(ctx),
        { createdBy: ctx.userId },
      ];
    }
    if (category) query.category = category;
    return this.documentModel.find(query).sort({ updatedAt: -1 }).lean();
  }

  async getDocument(ctx: RequestContext, documentId: string) {
    this.assertValidDocumentId(documentId);
    const accessQuery: Record<string, unknown> = { _id: documentId, tenantId: ctx.tenantId };
    if (!this.isKnowledgeManager(ctx)) {
      accessQuery.$or = [...this.visibilityClauses(ctx), { createdBy: ctx.userId }];
    }
    const document = await this.documentModel
      .findOne(accessQuery)
      .select('+rawText')
      .lean();
    if (!document) throw new NotFoundException('Knowledge document not found');

    const ingestionRuns = await this.runModel
      .find({ tenantId: ctx.tenantId, documentId: document._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    const { rawText, ...metadata } = document;
    return { ...metadata, content: rawText ?? '', ingestionRuns };
  }

  async updateDocument(ctx: RequestContext, documentId: string, dto: UpdateKnowledgeDocumentDto) {
    const document = await this.findManageableDocument(ctx, documentId);
    const normalizedContent = dto.content === undefined ? undefined : normalizeKnowledgeText(dto.content);
    if (dto.content !== undefined && !normalizedContent) {
      throw new BadRequestException('知识正文不能为空。');
    }
    if (normalizedContent && await this.hasActiveIngestion(document)) {
      throw new ConflictException('文档正在建立索引，请完成后再修改正文。');
    }

    if (dto.title !== undefined) document.title = this.requiredText(dto.title, '知识标题');
    if (dto.category !== undefined) document.category = this.requiredText(dto.category, '知识分类');
    if (dto.ownerDepartment !== undefined) document.ownerDepartment = this.requiredText(dto.ownerDepartment, '归属部门');
    if (dto.sourceUri !== undefined) document.sourceUri = dto.sourceUri.trim();
    if (dto.summary !== undefined) document.summary = dto.summary.trim();
    if (normalizedContent) {
      document.rawText = normalizedContent;
      document.status = 'indexing';
    }
    if (dto.visibility !== undefined) {
      document.visibility = this.buildVisibility(ctx, dto.visibility);
    }
    await document.save();

    await this.audit.record(ctx, {
      action: 'knowledge.document.update',
      resourceType: 'knowledge_document',
      resourceId: documentId,
      detail: { fields: Object.keys(dto), reindex: Boolean(normalizedContent) },
    });

    if (normalizedContent) {
      try {
        await this.queueIngestion(ctx, document, { sourceKind: 'document', trigger: 'update' });
      } catch (error) {
        document.status = 'failed';
        await document.save();
        throw error;
      }
    }
    return this.getDocument(ctx, documentId);
  }

  async setDocumentArchived(ctx: RequestContext, documentId: string, archived: boolean) {
    const document = await this.findManageableDocument(ctx, documentId);
    document.status = archived ? 'archived' : document.chunksCount > 0 ? 'ready' : 'draft';
    await document.save();
    await this.audit.record(ctx, {
      action: archived ? 'knowledge.document.archive' : 'knowledge.document.restore',
      resourceType: 'knowledge_document',
      resourceId: documentId,
      detail: { status: document.status },
    });
    return document;
  }

  async deleteDocument(ctx: RequestContext, documentId: string) {
    const document = await this.findManageableDocument(ctx, documentId);
    if (await this.hasActiveIngestion(document)) {
      throw new ConflictException('文档正在建立索引，请完成后再删除。');
    }
    await Promise.all([
      this.chunkModel.deleteMany({ tenantId: ctx.tenantId, documentId: document._id }),
      this.runModel.deleteMany({ tenantId: ctx.tenantId, documentId: document._id }),
      this.documentModel.deleteOne({ tenantId: ctx.tenantId, _id: document._id }),
    ]);
    if (document.sourceObjectKey) await this.objectStorage.delete(document.sourceObjectKey);
    await this.audit.record(ctx, {
      action: 'knowledge.document.delete',
      resourceType: 'knowledge_document',
      resourceId: documentId,
      detail: { title: document.title },
    });
    return { id: documentId, deleted: true };
  }

  async startIngestion(ctx: RequestContext, documentId: string) {
    const document = await this.findManageableDocument(ctx, documentId);
    document.status = 'indexing';
    await document.save();
    return this.queueIngestion(ctx, document, document.sourceObjectKey
      ? {
        sourceKind: 'object',
        objectKey: document.sourceObjectKey,
        originalFileName: document.sourceFileName,
        mimeType: document.sourceMimeType,
        trigger: 'manual',
      }
      : { sourceKind: 'document', trigger: 'manual' });
  }

  async search(ctx: RequestContext, dto: SearchKnowledgeDto) {
    const query: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      status: 'ready',
      $or: this.visibilityClauses(ctx),
    };
    if (dto.categories?.length) query.category = { $in: dto.categories };

    const documents = await this.documentModel.find(query).lean();
    const documentIds = documents.map((document) => document._id);
    const documentById = new Map(documents.map((document) => [String(document._id), document]));
    const chunks = documentIds.length
      ? await this.chunkModel.find({
        tenantId: ctx.tenantId,
        documentId: { $in: documentIds },
      }).lean()
      : [];

    const queryEmbedding = await this.embedding.embed(dto.query).then((vectors) => vectors?.[0] ?? null);
    const rankedChunks = rankKnowledgeChunks(
      dto.query,
      chunks.map((chunk) => {
        const document = documentById.get(String(chunk.documentId));
        return {
          chunkId: String(chunk._id),
          documentId: String(chunk.documentId),
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          title: document?.title,
          category: document?.category,
          summary: document?.summary,
          embedding: chunk.embedding,
          metadata: chunk.metadata,
        };
      }),
      dto.topK ?? 6,
      queryEmbedding ? { queryEmbedding } : undefined,
    );

    await this.audit.record(ctx, {
      action: 'knowledge.search',
      resourceType: 'knowledge_query',
      resourceId: ctx.userId,
      detail: {
        query: dto.query,
        categories: dto.categories,
        documents: documents.length,
        chunks: rankedChunks.length,
      },
    });

    return {
      query: dto.query,
      answerDraft: buildAnswerDraft({ query: dto.query, rankedChunks }),
      retrieval: {
        mode: queryEmbedding && rankedChunks.some((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0)
          ? 'hybrid-keyword-vector'
          : 'keyword-bigram',
        vectorReady: rankedChunks.some((chunk) => {
          const embedding = (chunk as { embedding?: number[] }).embedding;
          return Array.isArray(embedding) && embedding.length > 0;
        }),
        confidence: rankedChunks.length === 0 ? 'none' : rankedChunks[0].score >= 12 ? 'high' : rankedChunks[0].score >= 5 ? 'medium' : 'low',
      },
      citations: rankedChunks.map((chunk) => ({
        documentId: chunk.documentId,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        title: chunk.title,
        category: chunk.category,
        summary: chunk.summary,
        snippet: chunk.content,
        score: chunk.score,
        highlights: chunk.highlights,
        metadata: chunk.metadata,
      })),
    };
  }

  async recoverStaleIngestionRuns() {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    const staleRuns = await this.runModel.find({
      status: { $in: ['parsing', 'embedding'] },
      $or: [
        { heartbeatAt: { $lt: staleBefore } },
        { heartbeatAt: { $exists: false }, startedAt: { $lt: staleBefore } },
      ],
    });
    if (staleRuns.length === 0) return 0;
    await this.runModel.updateMany(
      { _id: { $in: staleRuns.map((run) => run._id) } },
      {
        $set: { status: 'queued', errorMessage: '服务重启后自动恢复排队。' },
        $unset: { startedAt: 1, heartbeatAt: 1 },
      },
    );
    return staleRuns.length;
  }

  async processNextQueuedIngestion(): Promise<boolean> {
    const run = await this.runModel.findOneAndUpdate(
      { status: 'queued' },
      {
        $set: { status: 'parsing', startedAt: new Date(), heartbeatAt: new Date(), errorMessage: undefined },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, new: true },
    ).select('+objectKey');
    if (!run) return false;

    const document = await this.documentModel
      .findOne({ _id: run.documentId, tenantId: run.tenantId })
      .select('+rawText +sourceObjectKey');
    if (!document) {
      run.status = 'failed';
      run.errorMessage = '知识文档已不存在。';
      run.completedAt = new Date();
      await run.save();
      return true;
    }

    const ctx = this.contextFromRun(run, document);
    try {
      let content = document.rawText || document.summary || document.title;
      let sourceMetadata: Record<string, unknown> = {};
      if (run.sourceKind === 'object') {
        if (!run.objectKey || !run.originalFileName) throw new Error('对象存储任务缺少文件定位信息。');
        const buffer = await this.objectStorage.get(run.objectKey);
        const parsed = await this.fileParser.parseBuffer({
          filename: run.originalFileName,
          mimeType: run.mimeType,
          buffer,
        });
        content = parsed.text;
        sourceMetadata = parsed.metadata;
        document.parserName = parsed.parserName;
        run.heartbeatAt = new Date();
        await run.save();
      }
      await this.executeIngestion(ctx, document, run, content, sourceMetadata);
    } catch (error) {
      await this.failIngestion(ctx, document, run, error);
    }
    return true;
  }

  private async queueIngestion(
    ctx: RequestContext,
    document: KnowledgeDocumentRecord,
    input: {
      sourceKind: 'document' | 'object';
      objectKey?: string;
      originalFileName?: string;
      mimeType?: string;
      trigger: 'create' | 'manual' | 'update' | 'import';
    },
  ) {
    const active = await this.runModel.findOne({
      tenantId: ctx.tenantId,
      documentId: document._id,
      status: { $in: ['queued', 'parsing', 'embedding'] },
    });
    if (active) return active;
    return this.runModel.create({
      tenantId: ctx.tenantId,
      documentId: document._id,
      status: 'queued',
      sourceKind: input.sourceKind,
      objectKey: input.objectKey,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      trigger: input.trigger,
      requestedBy: ctx.userId,
      requestedByName: ctx.userName,
      requestedOrgId: ctx.orgId,
      requestedRoleIds: ctx.roleIds,
      requestedParkIds: ctx.parkIds,
    });
  }

  private async executeIngestion(
    ctx: RequestContext,
    document: KnowledgeDocumentRecord,
    run: KnowledgeIngestionRunRecord,
    content: string,
    sourceMetadata: Record<string, unknown> = {},
  ) {
    const normalized = normalizeKnowledgeText(content);
    const chunks = buildKnowledgeChunks(normalized, {
      title: document.title,
      category: document.category,
      ownerDepartment: document.ownerDepartment,
      sourceUri: document.sourceUri,
      sourceMetadata,
    });
    if (chunks.length === 0) throw new Error('知识文档内容为空，无法建立检索索引。');

    run.status = 'embedding';
    run.heartbeatAt = new Date();
    await run.save();
    const embeddings = await this.embedding.embed(chunks.map((chunk) => chunk.content));
    await this.chunkModel.insertMany(chunks.map((chunk) => ({
      tenantId: document.tenantId,
      documentId: document._id,
      ingestionRunId: run._id,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      embedding: embeddings?.[chunk.chunkIndex] ?? [],
      metadata: chunk.metadata,
    })));
    await this.chunkModel.deleteMany({
      tenantId: document.tenantId,
      documentId: document._id,
      ingestionRunId: { $ne: run._id },
    });

    const current = await this.documentModel.findById(document._id).select('status');
    document.rawText = normalized;
    document.status = current?.status === 'archived' ? 'archived' : 'ready';
    document.chunksCount = chunks.length;
    document.tokensEstimate = estimateTokens(normalized);
    document.lastIndexedAt = new Date();
    await document.save();

    run.status = 'completed';
    run.chunksCreated = chunks.length;
    run.completedAt = new Date();
    run.heartbeatAt = new Date();
    run.errorMessage = undefined;
    await run.save();
    await this.audit.record(ctx, {
      action: 'knowledge.ingestion.completed',
      resourceType: 'knowledge_document',
      resourceId: String(document._id),
      detail: { runId: run.id, chunksCreated: chunks.length, trigger: run.trigger },
    });
  }

  private async failIngestion(
    ctx: RequestContext,
    document: KnowledgeDocumentRecord,
    run: KnowledgeIngestionRunRecord,
    error: unknown,
  ) {
    document.status = 'failed';
    await document.save();
    run.status = 'failed';
    run.errorMessage = error instanceof Error ? error.message : String(error);
    run.completedAt = new Date();
    run.heartbeatAt = new Date();
    await run.save();
    await this.audit.record(ctx, {
      action: 'knowledge.ingestion.failed',
      resourceType: 'knowledge_document',
      resourceId: String(document._id),
      result: 'failed',
      detail: { runId: run.id, error: run.errorMessage, trigger: run.trigger },
    });
  }

  private contextFromRun(run: KnowledgeIngestionRunRecord, document: KnowledgeDocument): RequestContext {
    return {
      tenantId: run.tenantId,
      userId: run.requestedBy || document.createdBy || 'knowledge-worker',
      userName: run.requestedByName || '知识索引 Worker',
      orgId: run.requestedOrgId || 'headquarters',
      roleIds: run.requestedRoleIds || [],
      parkIds: run.requestedParkIds || [],
    };
  }

  private visibilityClauses(ctx: RequestContext) {
    const clauses: Array<Record<string, unknown>> = [
      { 'visibility.scopeType': 'tenant' },
      { 'visibility.scopeType': 'private', 'visibility.userIds': ctx.userId },
    ];

    if (ctx.orgId) {
      clauses.push({ 'visibility.scopeType': 'org', 'visibility.orgIds': ctx.orgId });
    }
    if (ctx.roleIds.length > 0) {
      clauses.push({ 'visibility.scopeType': 'role', 'visibility.roleIds': { $in: ctx.roleIds } });
    }
    if (ctx.parkIds.length > 0) {
      clauses.push({ 'visibility.scopeType': 'park', 'visibility.parkIds': { $in: ctx.parkIds } });
    }

    return clauses;
  }

  private assertValidDocumentId(documentId: string) {
    if (!Types.ObjectId.isValid(documentId)) {
      throw new BadRequestException('Invalid knowledge document id');
    }
  }

  private async findManageableDocument(ctx: RequestContext, documentId: string) {
    this.assertValidDocumentId(documentId);
    const document = await this.documentModel
      .findOne({ _id: documentId, tenantId: ctx.tenantId })
      .select('+rawText +sourceObjectKey');
    if (!document) throw new NotFoundException('Knowledge document not found');
    if (!this.isKnowledgeManager(ctx) && document.createdBy !== ctx.userId) {
      throw new ForbiddenException('当前用户无权管理该知识文档。');
    }
    return document;
  }

  private isKnowledgeManager(ctx: RequestContext) {
    return ctx.roleIds.some((role) => role === 'platform-admin' || role === 'business-owner');
  }

  private async hasActiveIngestion(document: KnowledgeDocumentRecord) {
    return Boolean(await this.runModel.exists({
      tenantId: document.tenantId,
      documentId: document._id,
      status: { $in: ['queued', 'parsing', 'embedding'] },
    }));
  }

  private buildVisibility(ctx: RequestContext, visibility: CreateKnowledgeDocumentDto['visibility']) {
    return {
      scopeType: visibility.scopeType,
      orgIds: visibility.orgIds ?? [],
      roleIds: visibility.roleIds ?? [],
      parkIds: visibility.parkIds ?? [],
      userIds: visibility.scopeType === 'private'
        ? Array.from(new Set([ctx.userId, ...(visibility.userIds ?? [])]))
        : visibility.userIds ?? [],
    };
  }

  private requiredText(value: string, fieldName: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${fieldName}不能为空。`);
    return normalized;
  }
}

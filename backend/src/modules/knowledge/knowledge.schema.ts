import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { VisibilityRule } from '../../common/visibility.schema';

export type KnowledgeDocumentRecord = HydratedDocument<KnowledgeDocument>;
export type KnowledgeChunkRecord = HydratedDocument<KnowledgeChunk>;
export type KnowledgeIngestionRunRecord = HydratedDocument<KnowledgeIngestionRun>;

export type KnowledgeDocumentStatus = 'draft' | 'indexing' | 'ready' | 'archived' | 'failed';

@Schema({ timestamps: true, collection: 'knowledge_documents' })
export class KnowledgeDocument {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true, index: true })
  category!: string;

  @Prop({ required: true, index: true })
  ownerDepartment!: string;

  @Prop()
  sourceUri?: string;

  @Prop()
  sourceFileName?: string;

  @Prop()
  sourceMimeType?: string;

  @Prop()
  sourceFileSize?: number;

  @Prop()
  parserName?: string;

  @Prop({ select: false })
  sourceObjectKey?: string;

  @Prop()
  summary?: string;

  @Prop({ select: false })
  rawText?: string;

  @Prop({ type: String, required: true, enum: ['draft', 'indexing', 'ready', 'archived', 'failed'], default: 'draft', index: true })
  status!: KnowledgeDocumentStatus;

  @Prop({ type: VisibilityRule, required: true })
  visibility!: VisibilityRule;

  @Prop({ default: 0 })
  chunksCount!: number;

  @Prop({ default: 0 })
  tokensEstimate!: number;

  @Prop()
  lastIndexedAt?: Date;

  @Prop()
  createdBy?: string;
}

export const KnowledgeDocumentSchema = SchemaFactory.createForClass(KnowledgeDocument);

@Schema({ timestamps: true, collection: 'knowledge_chunks' })
export class KnowledgeChunk {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: KnowledgeDocument.name, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'KnowledgeIngestionRun', index: true })
  ingestionRunId?: Types.ObjectId;

  @Prop({ required: true })
  chunkIndex!: number;

  @Prop({ required: true })
  content!: string;

  @Prop({ type: [Number], default: [] })
  embedding!: number[];

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;
}

export const KnowledgeChunkSchema = SchemaFactory.createForClass(KnowledgeChunk);

@Schema({ timestamps: true, collection: 'knowledge_ingestion_runs' })
export class KnowledgeIngestionRun {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: KnowledgeDocument.name, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['queued', 'parsing', 'embedding', 'completed', 'failed'], default: 'queued' })
  status!: 'queued' | 'parsing' | 'embedding' | 'completed' | 'failed';

  @Prop({ type: String, required: true, enum: ['document', 'object'], default: 'document' })
  sourceKind!: 'document' | 'object';

  @Prop({ select: false })
  objectKey?: string;

  @Prop()
  originalFileName?: string;

  @Prop()
  mimeType?: string;

  @Prop({ type: String, required: true, enum: ['create', 'manual', 'update', 'import'], default: 'manual' })
  trigger!: 'create' | 'manual' | 'update' | 'import';

  @Prop({ default: 0 })
  attempts!: number;

  @Prop()
  requestedBy?: string;

  @Prop()
  requestedByName?: string;

  @Prop()
  requestedOrgId?: string;

  @Prop({ type: [String], default: [] })
  requestedRoleIds!: string[];

  @Prop({ type: [String], default: [] })
  requestedParkIds!: string[];

  @Prop()
  startedAt?: Date;

  @Prop()
  heartbeatAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ default: 0 })
  chunksCreated!: number;

  @Prop()
  errorMessage?: string;
}

export const KnowledgeIngestionRunSchema = SchemaFactory.createForClass(KnowledgeIngestionRun);
KnowledgeIngestionRunSchema.index({ status: 1, createdAt: 1 });

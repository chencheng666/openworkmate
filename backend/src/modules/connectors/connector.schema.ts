import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SkillActionKind, SkillRiskLevel } from '../skill-factory/skill-manifest.types';

export type ConnectorDocument = HydratedDocument<ConnectorDefinition>;

export type ConnectorType = 'oa' | 'ticketing' | 'crm' | 'contract' | 'bi' | 'database' | 'custom';
export type ConnectorAuthMode = 'none' | 'apiKey' | 'oauth2' | 'jwt' | 'sso' | 'database';
export type ConnectorStatus = 'draft' | 'active' | 'disabled' | 'error';
export type ConnectorHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'down';

@Schema({ _id: false })
export class ConnectorCapability {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, enum: ['read', 'write', 'approve', 'notify'] })
  actionKind!: SkillActionKind;

  @Prop({ required: true, enum: ['low', 'medium', 'high'] })
  riskLevel!: SkillRiskLevel;

  @Prop({ type: [String], default: [] })
  requiredScopes!: string[];
}

@Schema({ _id: false })
export class ConnectorSyncPolicy {
  @Prop({ required: true, enum: ['manual', 'scheduled', 'webhook'], default: 'manual' })
  mode!: 'manual' | 'scheduled' | 'webhook';

  @Prop()
  intervalMinutes?: number;
}

@Schema({ timestamps: true, collection: 'connectors' })
export class ConnectorDefinition {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  key!: string;

  @Prop({ required: true })
  displayName!: string;

  @Prop({ required: true, enum: ['oa', 'ticketing', 'crm', 'contract', 'bi', 'database', 'custom'], index: true })
  type!: ConnectorType;

  @Prop({ required: true })
  systemName!: string;

  @Prop()
  baseUrl?: string;

  @Prop({ required: true, enum: ['none', 'apiKey', 'oauth2', 'jwt', 'sso', 'database'], default: 'apiKey' })
  authMode!: ConnectorAuthMode;

  @Prop({ required: true, enum: ['draft', 'active', 'disabled', 'error'], default: 'draft', index: true })
  status!: ConnectorStatus;

  @Prop({ required: true })
  ownerDepartment!: string;

  @Prop({ type: [String], default: [] })
  dataDomains!: string[];

  @Prop({ type: [ConnectorCapability], default: [] })
  capabilities!: ConnectorCapability[];

  @Prop({ type: ConnectorSyncPolicy, default: { mode: 'manual' } })
  syncPolicy!: ConnectorSyncPolicy;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  @Prop()
  lastHealthCheckAt?: Date;

  @Prop({ enum: ['unknown', 'healthy', 'degraded', 'down'], default: 'unknown' })
  lastHealthStatus!: ConnectorHealthStatus;
}

export const ConnectorDefinitionSchema = SchemaFactory.createForClass(ConnectorDefinition);
ConnectorDefinitionSchema.index({ tenantId: 1, key: 1 }, { unique: true });

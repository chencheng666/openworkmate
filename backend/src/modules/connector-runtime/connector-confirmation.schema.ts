import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ConnectorConfirmationDocument = HydratedDocument<ConnectorConfirmation>;
export type ConnectorConfirmationStatus = 'pending' | 'approved' | 'rejected' | 'used' | 'expired';

@Schema({ timestamps: true, collection: 'connector_confirmations' })
export class ConnectorConfirmation {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, unique: true, index: true })
  requestId!: string;

  @Prop({ required: true, index: true })
  toolName!: string;

  @Prop({ required: true, index: true })
  connectorKey!: string;

  @Prop({ required: true })
  capabilityName!: string;

  @Prop({ required: true, enum: ['low', 'medium', 'high'] })
  riskLevel!: string;

  @Prop({ required: true, enum: ['read', 'write', 'approve', 'notify'] })
  actionKind!: string;

  @Prop({ required: true, enum: ['pending', 'approved', 'rejected', 'used', 'expired'], default: 'pending', index: true })
  status!: ConnectorConfirmationStatus;

  @Prop({ required: true })
  reason!: string;

  @Prop({ type: Object, default: {} })
  inputSnapshot!: Record<string, unknown>;

  @Prop()
  executionHash?: string;

  @Prop({ required: true })
  requestedBy!: string;

  @Prop()
  requestedByName?: string;

  @Prop({ required: true })
  requestedAt!: Date;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  @Prop()
  approvalTokenHash?: string;

  @Prop()
  approvedBy?: string;

  @Prop()
  approvedByName?: string;

  @Prop()
  approvedAt?: Date;

  @Prop()
  rejectedBy?: string;

  @Prop()
  rejectedByName?: string;

  @Prop()
  rejectedAt?: Date;

  @Prop()
  rejectReason?: string;

  @Prop()
  usedAt?: Date;
}

export const ConnectorConfirmationSchema = SchemaFactory.createForClass(ConnectorConfirmation);
ConnectorConfirmationSchema.index({ tenantId: 1, toolName: 1, status: 1 });
ConnectorConfirmationSchema.index({ tenantId: 1, expiresAt: 1 });

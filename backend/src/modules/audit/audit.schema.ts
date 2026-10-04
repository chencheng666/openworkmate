import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditEventDocument = HydratedDocument<AuditEvent>;

@Schema({ timestamps: true, collection: 'audit_events' })
export class AuditEvent {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  actorId!: string;

  @Prop()
  actorName?: string;

  @Prop({ required: true, index: true })
  action!: string;

  @Prop({ required: true, index: true })
  resourceType!: string;

  @Prop({ required: true, index: true })
  resourceId!: string;

  @Prop({ type: Object, default: {} })
  detail!: Record<string, unknown>;

  @Prop({ required: true, enum: ['success', 'blocked', 'failed'], default: 'success' })
  result!: 'success' | 'blocked' | 'failed';
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);
AuditEventSchema.index({ tenantId: 1, createdAt: -1 });

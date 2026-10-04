import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestContext } from '../../common/request-context';
import { AuditEvent } from './audit.schema';

export type AuditInput = {
  action: string;
  resourceType: string;
  resourceId: string;
  detail?: Record<string, unknown>;
  result?: 'success' | 'blocked' | 'failed';
};

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditEvent.name) private readonly auditModel: Model<AuditEvent>) {}

  async list(
    ctx: RequestContext,
    filters: {
      action?: string;
      resourceType?: string;
      result?: 'success' | 'blocked' | 'failed';
      limit?: number;
    },
  ) {
    const query: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (filters.action) query.action = { $regex: filters.action.trim(), $options: 'i' };
    if (filters.resourceType) query.resourceType = filters.resourceType;
    if (filters.result) query.result = filters.result;
    const limit = Number.isFinite(filters.limit)
      ? Math.min(Math.max(Math.trunc(filters.limit ?? 100), 1), 200)
      : 100;
    return this.auditModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async record(ctx: RequestContext, input: AuditInput) {
    return this.auditModel.create({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorName: ctx.userName,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      detail: input.detail ?? {},
      result: input.result ?? 'success',
    });
  }
}

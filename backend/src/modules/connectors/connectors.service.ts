import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { ConnectorDefinition, ConnectorHealthStatus, ConnectorStatus, ConnectorType } from './connector.schema';
import { buildConnectorToolDeclaration } from './connector-tool-declaration';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { probeConnector } from './connector-health';
import { ConnectorHttpError, validateHttpConfig } from './connector-http-config';
import { UpdateConnectorHttpDto } from './dto/update-connector-http.dto';

@Injectable()
export class ConnectorsService {
  constructor(
    @InjectModel(ConnectorDefinition.name) private readonly connectorModel: Model<ConnectorDefinition>,
    private readonly audit: AuditService,
  ) {}

  async create(ctx: RequestContext, dto: CreateConnectorDto) {
    this.requireConnectorManager(ctx);
    this.validateHttp({ ...dto, metadata: dto.metadata ?? {} });
    const existing = await this.connectorModel.findOne({ tenantId: ctx.tenantId, key: dto.key }).lean();
    if (existing) throw new BadRequestException(`Connector key already exists: ${dto.key}`);

    const connector = await this.connectorModel.create({
      tenantId: ctx.tenantId,
      ...dto,
      status: dto.status ?? 'draft',
      syncPolicy: dto.syncPolicy ?? { mode: 'manual' },
      metadata: dto.metadata ?? {},
      lastHealthStatus: 'unknown',
    });

    await this.audit.record(ctx, {
      action: 'connector.create',
      resourceType: 'connector',
      resourceId: connector.id,
      detail: { key: connector.key, type: connector.type, systemName: connector.systemName },
    });
    return connector;
  }

  async list(ctx: RequestContext, filters: { type?: ConnectorType; status?: ConnectorStatus }) {
    const query: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    return this.connectorModel.find(query).sort({ type: 1, displayName: 1 }).lean();
  }

  async get(ctx: RequestContext, id: string) {
    const connector = await this.connectorModel.findOne({ _id: id, tenantId: ctx.tenantId }).lean();
    if (!connector) throw new NotFoundException('Connector not found');
    return connector;
  }

  async listToolDeclarations(ctx: RequestContext, includeInactive = false) {
    const query: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (!includeInactive) query.status = 'active';
    const connectors = await this.connectorModel.find(query).sort({ type: 1, displayName: 1 }).lean();
    return connectors.flatMap((connector) =>
      connector.capabilities.map((capability) => buildConnectorToolDeclaration(connector, capability)),
    );
  }

  async getToolDeclarations(ctx: RequestContext, id: string) {
    const connector = await this.connectorModel.findOne({ _id: id, tenantId: ctx.tenantId }).lean();
    if (!connector) throw new NotFoundException('Connector not found');
    return connector.capabilities.map((capability) => buildConnectorToolDeclaration(connector, capability));
  }

  async setStatus(ctx: RequestContext, id: string, status: ConnectorStatus) {
    this.requireConnectorManager(ctx);
    const connector = await this.connectorModel.findOne({ _id: id, tenantId: ctx.tenantId });
    if (!connector) throw new NotFoundException('Connector not found');

    if (status === 'active') this.validateHttp(connector);
    connector.status = status;
    await connector.save();

    await this.audit.record(ctx, {
      action: `connector.${status}`,
      resourceType: 'connector',
      resourceId: id,
      detail: { key: connector.key, systemName: connector.systemName },
      result: status === 'error' ? 'failed' : 'success',
    });
    return connector;
  }

  async updateHttpConfig(ctx: RequestContext, id: string, dto: UpdateConnectorHttpDto) {
    this.requireConnectorManager(ctx);
    const connector = await this.connectorModel.findOne({ _id: id, tenantId: ctx.tenantId });
    if (!connector) throw new NotFoundException('Connector not found');
    // metadata 整体替换，避免旧能力路由在修改后继续生效。
    if (dto.baseUrl !== undefined && dto.baseUrl !== null) connector.baseUrl = dto.baseUrl;
    if (dto.authMode !== undefined && dto.authMode !== null) connector.authMode = dto.authMode;
    if (dto.metadata !== undefined && dto.metadata !== null) connector.metadata = dto.metadata;
    this.validateHttp(connector);
    connector.status = 'draft';
    connector.lastHealthStatus = 'unknown';
    connector.lastHealthCheckAt = undefined;
    await connector.save();
    await this.audit.record(ctx, {
      action: 'connector.update_http_config', resourceType: 'connector', resourceId: id,
      detail: { key: connector.key, status: connector.status },
    });
    return connector;
  }

  private validateHttp(connector: Parameters<typeof validateHttpConfig>[0]) {
    try { validateHttpConfig(connector); } catch (error) {
      if (error instanceof ConnectorHttpError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  async healthCheck(ctx: RequestContext, id: string) {
    this.requireConnectorManager(ctx);
    const connector = await this.connectorModel.findOne({ _id: id, tenantId: ctx.tenantId });
    if (!connector) throw new NotFoundException('Connector not found');

    const probe = connector.status === 'active'
      ? await probeConnector(connector)
      : { status: 'degraded' as ConnectorHealthStatus, message: '连接器未启用，Runtime 调用会被阻止。' };
    const healthStatus = probe.status;
    connector.lastHealthStatus = healthStatus;
    connector.lastHealthCheckAt = new Date();
    await connector.save();

    await this.audit.record(ctx, {
      action: 'connector.health_check',
      resourceType: 'connector',
      resourceId: id,
      detail: { key: connector.key, status: connector.status, healthStatus },
      result: healthStatus === 'healthy' ? 'success' : 'blocked',
    });

    return {
      connectorId: id,
      status: healthStatus,
      checkedAt: connector.lastHealthCheckAt,
      message: probe.message,
    };
  }

  private requireConnectorManager(ctx: RequestContext) {
    if (!ctx.roleIds.some((role) => role === 'platform-admin' || role === 'business-owner')) {
      throw new ForbiddenException('当前用户没有连接器治理权限。');
    }
  }
}

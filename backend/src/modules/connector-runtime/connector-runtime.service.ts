import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { ConnectorDefinition } from '../connectors/connector.schema';
import { buildConnectorToolDeclaration } from '../connectors/connector-tool-declaration';
import { ExecuteConnectorToolDto } from './dto/execute-connector-tool.dto';
import { ReviewConnectorConfirmationDto } from './dto/review-connector-confirmation.dto';
import { ConnectorAdapterRegistry } from './adapters/connector-adapter-registry.service';
import { ConnectorConfirmation } from './connector-confirmation.schema';
import { createConfirmationToken, hashConfirmationExecution, hashConfirmationToken } from './confirmation-token';
import { evaluateConnectorRuntimeGate } from './connector-runtime.policy';
import { ConnectorHttpError } from '../connectors/connector-http-config';
import { ConnectorRuntimeAdapterResult } from './adapters/connector-adapter.types';

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ConnectorRuntimeService {
  constructor(
    @InjectModel(ConnectorDefinition.name) private readonly connectorModel: Model<ConnectorDefinition>,
    @InjectModel(ConnectorConfirmation.name) private readonly confirmationModel: Model<ConnectorConfirmation>,
    private readonly adapterRegistry: ConnectorAdapterRegistry,
    private readonly audit: AuditService,
  ) {}

  async listConfirmations(ctx: RequestContext, status?: string) {
    const query: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (!this.isGovernanceManager(ctx)) query.requestedBy = ctx.userId;
    if (status) query.status = status;
    return this.confirmationModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async approveConfirmation(ctx: RequestContext, requestId: string, dto: ReviewConnectorConfirmationDto = {}) {
    const confirmation = await this.confirmationModel.findOne({ tenantId: ctx.tenantId, requestId });
    if (!confirmation) {
      throw new NotFoundException(`Confirmation request not found: ${requestId}`);
    }
    if (confirmation.requestedBy !== ctx.userId && !this.isGovernanceManager(ctx)) {
      throw new ForbiddenException('只有发起人或平台治理管理员可以确认该动作。');
    }

    if (confirmation.expiresAt.getTime() < Date.now()) {
      await this.confirmationModel.updateOne({ _id: confirmation._id, status: { $in: ['pending', 'approved'] } }, { $set: { status: 'expired' } });
      return {
        requestId,
        status: confirmation.status === 'used' || confirmation.status === 'rejected' ? confirmation.status : 'expired',
        expiresAt: confirmation.expiresAt,
      };
    }

    if (confirmation.status !== 'pending') {
      return {
        requestId,
        status: confirmation.status,
        expiresAt: confirmation.expiresAt,
      };
    }

    const token = createConfirmationToken();
    const approved = await this.confirmationModel.findOneAndUpdate({
      _id: confirmation._id, status: 'pending', expiresAt: { $gt: new Date() },
    }, { $set: {
      status: 'approved', approvalTokenHash: hashConfirmationToken(token), approvedBy: ctx.userId,
      approvedByName: ctx.userName, approvedAt: new Date(),
      reason: dto.comment ? `${confirmation.reason} 审批意见：${dto.comment}` : confirmation.reason,
    } }, { new: true });
    if (!approved) return { requestId, status: 'blocked', reason: '确认状态已变化，请刷新后重试。' };

    await this.audit.record(ctx, {
      action: 'connector_runtime.confirmation_approved',
      resourceType: 'connector_confirmation',
      resourceId: requestId,
      detail: {
        toolName: confirmation.toolName,
        connectorKey: confirmation.connectorKey,
        capabilityName: confirmation.capabilityName,
        riskLevel: confirmation.riskLevel,
        expiresAt: confirmation.expiresAt,
      },
    });

    return {
      requestId,
      status: approved.status,
      confirmationToken: token,
      expiresAt: confirmation.expiresAt,
    };
  }

  async rejectConfirmation(ctx: RequestContext, requestId: string, dto: ReviewConnectorConfirmationDto = {}) {
    const confirmation = await this.confirmationModel.findOne({ tenantId: ctx.tenantId, requestId });
    if (!confirmation) {
      throw new NotFoundException(`Confirmation request not found: ${requestId}`);
    }
    if (confirmation.requestedBy !== ctx.userId && !this.isGovernanceManager(ctx)) {
      throw new ForbiddenException('只有发起人或平台治理管理员可以驳回该动作。');
    }

    const rejected = await this.confirmationModel.findOneAndUpdate({
      _id: confirmation._id, status: { $in: ['pending', 'approved'] }, expiresAt: { $gt: new Date() },
    }, { $set: {
      status: 'rejected', rejectedBy: ctx.userId, rejectedByName: ctx.userName,
      rejectedAt: new Date(), rejectReason: dto.comment,
    }, $unset: { approvalTokenHash: 1 } }, { new: true });
    if (!rejected) return { requestId, status: 'blocked', reason: '确认状态已变化或过期，不能再驳回。' };

    await this.audit.record(ctx, {
      action: 'connector_runtime.confirmation_rejected',
      resourceType: 'connector_confirmation',
      resourceId: requestId,
      detail: {
        toolName: confirmation.toolName,
        connectorKey: confirmation.connectorKey,
        capabilityName: confirmation.capabilityName,
        riskLevel: confirmation.riskLevel,
        comment: dto.comment,
      },
      result: 'blocked',
    });

    return {
      requestId,
      status: rejected.status,
      rejectReason: rejected.rejectReason,
    };
  }

  async execute(ctx: RequestContext, dto: ExecuteConnectorToolDto) {
    const connectors = await this.connectorModel.find({ tenantId: ctx.tenantId }).lean();
    for (const connector of connectors) {
      for (const capability of connector.capabilities) {
        const declaration = buildConnectorToolDeclaration(connector, capability);
        if (declaration.name !== dto.toolName) continue;

        const { confirmationToken: _confirmationToken, ...businessInput } = dto.input;
        const executionHash = hashConfirmationExecution({
          input: businessInput, context: ctx,
          connector: { key: connector.key, type: connector.type, baseUrl: connector.baseUrl,
            authMode: connector.authMode, metadata: connector.metadata, capability },
        });
        const gate = evaluateConnectorRuntimeGate(declaration, {
          confirmationToken: dto.input.confirmationToken,
        });

        if (!gate.allowed) {
          const confirmation = gate.status === 'confirmation_required'
            ? await this.createConfirmationRequest(ctx, declaration, dto, gate.reason || '需要人工确认', executionHash)
            : undefined;

          await this.audit.record(ctx, {
            action: gate.status === 'confirmation_required'
              ? 'connector_runtime.confirmation_requested'
              : 'connector_runtime.blocked',
            resourceType: gate.status === 'confirmation_required' ? 'connector_confirmation' : 'connector_tool',
            resourceId: confirmation?.requestId || declaration.name,
            detail: {
              requestId: dto.requestId,
              confirmationRequestId: confirmation?.requestId,
              reason: gate.reason,
              status: gate.status,
              connectorKey: declaration.governance.connectorKey,
              capabilityName: declaration.governance.capabilityName,
              riskLevel: declaration.governance.riskLevel,
            },
            result: 'blocked',
          });

          return {
            status: gate.status,
            toolName: declaration.name,
            requiresConfirmation: gate.status === 'confirmation_required',
            confirmation: gate.status === 'confirmation_required'
              ? {
                requestId: confirmation?.requestId,
                reason: gate.reason,
                riskLevel: declaration.governance.riskLevel,
                actionKind: declaration.governance.actionKind,
                expiresAt: confirmation?.expiresAt.toISOString(),
              }
              : undefined,
            governance: declaration.governance,
          };
        }

        if (declaration.governance.humanConfirmationRequired) {
          const confirmation = await this.consumeConfirmationToken(ctx, declaration.name, executionHash, dto.input.confirmationToken);
          if (!confirmation) {
            await this.audit.record(ctx, {
              action: 'connector_runtime.invalid_confirmation_token',
              resourceType: 'connector_tool',
              resourceId: declaration.name,
              detail: {
                requestId: dto.requestId,
                connectorKey: declaration.governance.connectorKey,
                capabilityName: declaration.governance.capabilityName,
                riskLevel: declaration.governance.riskLevel,
              },
              result: 'blocked',
            });

            return {
              status: 'blocked',
              toolName: declaration.name,
              requiresConfirmation: true,
              confirmation: {
                reason: '确认令牌无效、已过期、已使用，或执行人、参数及连接器配置与确认时不一致。',
                riskLevel: declaration.governance.riskLevel,
                actionKind: declaration.governance.actionKind,
              },
              governance: declaration.governance,
            };
          }
        }

        let result: ConnectorRuntimeAdapterResult;
        try {
          result = await this.adapterRegistry.execute({
            ctx, connector, declaration, runtimeInput: dto.input, requestId: dto.requestId,
          });
        } catch (error) {
          const failure = error instanceof ConnectorHttpError
            ? { code: error.code, message: error.message }
            : { code: 'adapter_failed', message: '业务系统调用失败，请联系管理员核查。' };
          await this.audit.record(ctx, {
            action: 'connector_runtime.execute_failed', resourceType: 'connector_tool', resourceId: declaration.name,
            detail: { requestId: dto.requestId, connectorKey: connector.key, capabilityName: capability.name, errorCode: failure.code },
            result: 'failed',
          });
          return { status: 'failed', toolName: declaration.name, error: failure,
            governance: declaration.governance, audit: { recorded: true, action: 'connector_runtime.execute_failed' } };
        }
        await this.audit.record(ctx, {
          action: 'connector_runtime.execute',
          resourceType: 'connector_tool',
          resourceId: declaration.name,
          detail: {
            requestId: dto.requestId,
            adapter: result.adapter,
            connectorKey: declaration.governance.connectorKey,
            capabilityName: declaration.governance.capabilityName,
            actionKind: declaration.governance.actionKind,
            riskLevel: declaration.governance.riskLevel,
            input: businessInput,
          },
        });

        return {
          status: 'executed',
          toolName: declaration.name,
          result,
          governance: declaration.governance,
          audit: {
            recorded: true,
            action: 'connector_runtime.execute',
          },
        };
      }
    }

    throw new NotFoundException(`Connector tool not found: ${dto.toolName}`);
  }

  private async createConfirmationRequest(
    ctx: RequestContext,
    declaration: ReturnType<typeof buildConnectorToolDeclaration>,
    dto: ExecuteConnectorToolDto,
    reason: string,
    executionHash: string,
  ) {
    const requestId = `cfr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return this.confirmationModel.create({
      tenantId: ctx.tenantId,
      requestId,
      toolName: declaration.name,
      connectorKey: declaration.governance.connectorKey,
      capabilityName: declaration.governance.capabilityName,
      riskLevel: declaration.governance.riskLevel,
      actionKind: declaration.governance.actionKind,
      status: 'pending',
      reason,
      inputSnapshot: dto.input,
      executionHash,
      requestedBy: ctx.userId,
      requestedByName: ctx.userName,
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
    });
  }

  private async consumeConfirmationToken(
    ctx: RequestContext,
    toolName: string,
    executionHash: string,
    token?: string,
  ) {
    if (!token) return null;

    // 原子消费，防止并发请求使用同一确认令牌执行多次。
    return this.confirmationModel.findOneAndUpdate({
      tenantId: ctx.tenantId,
      toolName,
      requestedBy: ctx.userId,
      executionHash,
      expiresAt: { $gt: new Date() },
      status: 'approved',
      approvalTokenHash: hashConfirmationToken(token),
    }, { $set: { status: 'used', usedAt: new Date() }, $unset: { approvalTokenHash: 1 } }, { new: true });
  }

  private isGovernanceManager(ctx: RequestContext) {
    return ctx.roleIds.some((role) => role === 'platform-admin' || role === 'business-owner');
  }
}

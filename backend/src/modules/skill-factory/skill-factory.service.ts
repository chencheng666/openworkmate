import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { ConnectorsService } from '../connectors/connectors.service';
import { ConnectorRuntimeService } from '../connector-runtime/connector-runtime.service';
import { CreateSkillSubmissionDto } from './dto/create-skill-submission.dto';
import { ExecuteSkillDto } from './dto/execute-skill.dto';
import { ReviewSkillSubmissionDto } from './dto/review-skill-submission.dto';
import { InstalledSkill, SkillSubmission } from './skill-factory.schema';
import { validateSkillManifest } from './skill-manifest.validator';
import { validateSkillOutput } from './skill-output-validator';

@Injectable()
export class SkillFactoryService {
  constructor(
    @InjectModel(SkillSubmission.name) private readonly submissionModel: Model<SkillSubmission>,
    @InjectModel(InstalledSkill.name) private readonly installedSkillModel: Model<InstalledSkill>,
    private readonly audit: AuditService,
    private readonly connectors: ConnectorsService,
    private readonly connectorRuntime: ConnectorRuntimeService,
  ) {}

  async submit(ctx: RequestContext, dto: CreateSkillSubmissionDto) {
    validateSkillManifest(dto.manifest);
    const submission = await this.submissionModel.create({
      tenantId: ctx.tenantId,
      submittedBy: ctx.userId,
      manifest: dto.manifest,
      status: 'submitted',
    });
    await this.audit.record(ctx, {
      action: 'skill.submission.create',
      resourceType: 'skill_submission',
      resourceId: submission.id,
      detail: { name: dto.manifest.name, riskLevel: dto.manifest.riskLevel },
    });
    return submission;
  }

  async listSubmissions(ctx: RequestContext, status?: string) {
    const query: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (!this.isSkillManager(ctx)) query.submittedBy = ctx.userId;
    if (status) query.status = status;
    return this.submissionModel.find(query).sort({ updatedAt: -1 }).lean();
  }

  async review(ctx: RequestContext, id: string, dto: ReviewSkillSubmissionDto) {
    this.requireSkillManager(ctx);
    const submission = await this.submissionModel.findOne({ _id: id, tenantId: ctx.tenantId });
    if (!submission) throw new NotFoundException('Skill submission not found');
    if (!['submitted', 'approved', 'rejected'].includes(submission.status)) {
      throw new BadRequestException(`Cannot review submission in status ${submission.status}`);
    }

    submission.status = dto.decision;
    submission.reviewerId = ctx.userId;
    submission.reviewComment = dto.comment;
    submission.reviewedAt = new Date();
    await submission.save();

    await this.audit.record(ctx, {
      action: `skill.submission.${dto.decision}`,
      resourceType: 'skill_submission',
      resourceId: id,
      detail: { comment: dto.comment },
      result: dto.decision === 'approved' ? 'success' : 'blocked',
    });
    return submission;
  }

  async publish(ctx: RequestContext, id: string) {
    this.requireSkillManager(ctx);
    const submission = await this.submissionModel.findOne({ _id: id, tenantId: ctx.tenantId });
    if (!submission) throw new NotFoundException('Skill submission not found');
    if (submission.status !== 'approved') {
      throw new BadRequestException('Only approved submissions can be published');
    }

    const installed = await this.installedSkillModel.create({
      tenantId: ctx.tenantId,
      submissionId: new Types.ObjectId(id),
      name: submission.manifest.name,
      displayName: submission.manifest.displayName,
      version: submission.manifest.version,
      manifest: submission.manifest,
      enabled: true,
      publishedToDefaultAgent: false,
    });

    submission.status = 'published';
    await submission.save();

    await this.audit.record(ctx, {
      action: 'skill.publish',
      resourceType: 'installed_skill',
      resourceId: installed.id,
      detail: { submissionId: id, name: installed.name },
    });
    return installed;
  }

  async listInstalled(ctx: RequestContext) {
    return this.installedSkillModel.find({ tenantId: ctx.tenantId }).sort({ updatedAt: -1 }).lean();
  }

  async setEnabled(ctx: RequestContext, id: string, enabled: boolean) {
    this.requireSkillManager(ctx);
    const skill = await this.installedSkillModel.findOne({ _id: id, tenantId: ctx.tenantId });
    if (!skill) throw new NotFoundException('Installed skill not found');
    skill.enabled = enabled;
    await skill.save();

    await this.audit.record(ctx, {
      action: enabled ? 'skill.enable' : 'skill.disable',
      resourceType: 'installed_skill',
      resourceId: id,
      detail: { name: skill.name },
    });
    return skill;
  }

  async execute(ctx: RequestContext, dto: ExecuteSkillDto) {
    const skill = await this.installedSkillModel.findOne({
      tenantId: ctx.tenantId,
      name: dto.skillName,
      enabled: true,
    }).lean();
    if (!skill) throw new NotFoundException('Enabled Skill not found');

    const manifest = skill.manifest;
    const allowedRoles = manifest.governance.allowedRoleIds ?? [];
    if (allowedRoles.length > 0 && !ctx.roleIds.some((roleId) => allowedRoles.includes(roleId))) {
      throw new ForbiddenException('当前用户没有执行该 Skill 的角色权限。');
    }

    this.validateSkillInput(manifest.inputFields, dto.input);
    const declarations = await this.connectors.listToolDeclarations(ctx, false);
    const results = [];

    for (const tool of manifest.tools) {
      const declaration = this.resolveToolDeclaration(declarations, tool);
      if (!declaration) {
        throw new BadRequestException(`Skill 工具未找到可用连接器能力：${tool.name}`);
      }

      const result = await this.connectorRuntime.execute(ctx, {
        requestId: dto.requestId,
        toolName: declaration.name,
        input: {
          businessGoal: String(dto.input.businessGoal ?? manifest.description),
          filters: this.asRecord(dto.input.filters ?? dto.input.target),
          payload: this.asRecord(dto.input.payload),
          confirmationToken: typeof dto.input.confirmationToken === 'string'
            ? dto.input.confirmationToken
            : undefined,
        },
      });
      results.push({ skillTool: tool.name, connectorTool: declaration.name, result });

      if (result.status !== 'executed') {
        return {
          status: result.status,
          skill: { name: skill.name, displayName: skill.displayName, version: skill.version },
          promptTemplate: manifest.promptTemplate,
          outputContract: manifest.outputContract,
          results,
        };
      }

      const outputErrors = validateSkillOutput(manifest.outputContract.schema, result.result);
      if (outputErrors.length > 0) {
        await this.audit.record(ctx, {
          action: 'skill.runtime.output_contract_invalid',
          resourceType: 'installed_skill',
          resourceId: String(skill._id),
          detail: { name: skill.name, requestId: dto.requestId, tool: tool.name, errors: outputErrors },
          result: 'blocked',
        });
        return {
          status: 'output_contract_invalid',
          skill: { name: skill.name, displayName: skill.displayName, version: skill.version },
          outputContract: manifest.outputContract,
          outputErrors,
          results,
        };
      }
    }

    await this.audit.record(ctx, {
      action: 'skill.runtime.execute',
      resourceType: 'installed_skill',
      resourceId: String(skill._id),
      detail: { name: skill.name, version: skill.version, requestId: dto.requestId, tools: results.map((item) => item.skillTool) },
    });

    return {
      status: 'executed',
      skill: { name: skill.name, displayName: skill.displayName, version: skill.version },
      promptTemplate: manifest.promptTemplate,
      outputContract: manifest.outputContract,
      results,
    };
  }

  async listRuntimeTools(ctx: RequestContext) {
    const skills = await this.installedSkillModel.find({ tenantId: ctx.tenantId, enabled: true }).lean();
    return skills
      .filter((skill) => {
        const allowedRoles = skill.manifest.governance.allowedRoleIds ?? [];
        return allowedRoles.length === 0 || ctx.roleIds.some((roleId) => allowedRoles.includes(roleId));
      })
      .map((skill) => ({
        name: `workmate_skill_${skill.name}`,
        skillName: skill.name,
        description: skill.manifest.description,
        inputSchema: {
          type: 'object' as const,
          properties: Object.fromEntries(skill.manifest.inputFields.map((field) => [field.name, {
            type: field.type === 'date' || field.type === 'enum' ? 'string' : field.type,
            description: field.description,
            ...(field.enumValues?.length ? { enum: field.enumValues } : {}),
          }])),
          required: skill.manifest.inputFields.filter((field) => field.required).map((field) => field.name),
          additionalProperties: false,
        },
      }));
  }

  private validateSkillInput(
    fields: Array<{ name: string; type: string; required: boolean; enumValues?: string[] }>,
    input: Record<string, unknown>,
  ) {
    for (const field of fields) {
      const value = input[field.name];
      if (field.required && (value === undefined || value === null || value === '')) {
        throw new BadRequestException(`缺少 Skill 必填参数：${field.name}`);
      }
      if (value === undefined || value === null) continue;
      const valid = field.type === 'object'
        ? typeof value === 'object' && !Array.isArray(value)
        : field.type === 'number'
          ? typeof value === 'number' && Number.isFinite(value)
          : field.type === 'boolean'
            ? typeof value === 'boolean'
            : field.type === 'enum'
              ? typeof value === 'string' && (field.enumValues ?? []).includes(value)
              : typeof value === 'string';
      if (!valid) throw new BadRequestException(`Skill 参数 ${field.name} 类型不符合定义：${field.type}`);
    }
  }

  private resolveToolDeclaration(
    declarations: Awaited<ReturnType<ConnectorsService['listToolDeclarations']>>,
    tool: { name: string; connectorId: string; actionKind: string },
  ) {
    const connectorCandidates = declarations.filter((declaration) =>
      declaration.governance.connectorKey === tool.connectorId
      || declaration.governance.connectorId === tool.connectorId
      || declaration.execution.connectorDisplayName === tool.connectorId
    );
    const candidates = connectorCandidates.filter((declaration) => declaration.governance.actionKind === tool.actionKind);
    const matchedCandidates = candidates.length > 0 ? candidates : connectorCandidates;
    const namedCandidates = matchedCandidates.filter((declaration) =>
      declaration.governance.capabilityName === tool.name || declaration.name === tool.name,
    );
    return namedCandidates[0] ?? matchedCandidates[0];
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private isSkillManager(ctx: RequestContext) {
    return ctx.roleIds.some((role) => role === 'platform-admin' || role === 'business-owner');
  }

  private requireSkillManager(ctx: RequestContext) {
    if (!this.isSkillManager(ctx)) throw new ForbiddenException('当前用户没有 Skill 治理权限。');
  }
}

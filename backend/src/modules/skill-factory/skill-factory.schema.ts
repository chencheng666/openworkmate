import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SkillManifest } from './skill-manifest.types';

export type SkillSubmissionDocument = HydratedDocument<SkillSubmission>;
export type InstalledSkillDocument = HydratedDocument<InstalledSkill>;

export type SkillSubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'published';

@Schema({ timestamps: true, collection: 'skill_submissions' })
export class SkillSubmission {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  submittedBy!: string;

  @Prop({ required: true, type: Object })
  manifest!: SkillManifest;

  @Prop({ required: true, enum: ['draft', 'submitted', 'approved', 'rejected', 'published'], default: 'submitted', index: true })
  status!: SkillSubmissionStatus;

  @Prop()
  reviewerId?: string;

  @Prop()
  reviewComment?: string;

  @Prop()
  reviewedAt?: Date;
}

export const SkillSubmissionSchema = SchemaFactory.createForClass(SkillSubmission);

@Schema({ timestamps: true, collection: 'installed_skills' })
export class InstalledSkill {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: SkillSubmission.name, index: true })
  submissionId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  name!: string;

  @Prop({ required: true })
  displayName!: string;

  @Prop({ required: true })
  version!: string;

  @Prop({ required: true, type: Object })
  manifest!: SkillManifest;

  @Prop({ default: true })
  enabled!: boolean;

  @Prop({ default: false })
  publishedToDefaultAgent!: boolean;
}

export const InstalledSkillSchema = SchemaFactory.createForClass(InstalledSkill);

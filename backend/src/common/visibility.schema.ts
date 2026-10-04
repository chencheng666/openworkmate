import { Prop, Schema } from '@nestjs/mongoose';

export type VisibilityScopeType = 'tenant' | 'org' | 'role' | 'park' | 'private';

@Schema({ _id: false })
export class VisibilityRule {
  @Prop({ type: String, required: true, enum: ['tenant', 'org', 'role', 'park', 'private'], default: 'tenant' })
  scopeType!: VisibilityScopeType;

  @Prop({ type: [String], default: [] })
  orgIds!: string[];

  @Prop({ type: [String], default: [] })
  roleIds!: string[];

  @Prop({ type: [String], default: [] })
  parkIds!: string[];

  @Prop({ type: [String], default: [] })
  userIds!: string[];
}

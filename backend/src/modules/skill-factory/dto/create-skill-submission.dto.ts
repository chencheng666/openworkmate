import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { SkillManifest } from '../skill-manifest.types';

export class CreateSkillSubmissionDto {
  @ApiProperty({ type: Object })
  @IsObject()
  manifest!: SkillManifest;
}

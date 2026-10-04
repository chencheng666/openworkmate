import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VisibilityScopeType } from '../../../common/visibility.schema';

export class VisibilityRuleDto {
  @ApiProperty({ enum: ['tenant', 'org', 'role', 'park', 'private'] })
  @IsIn(['tenant', 'org', 'role', 'park', 'private'])
  scopeType!: VisibilityScopeType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orgIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parkIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];
}

export class CreateKnowledgeDocumentDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  category!: string;

  @ApiProperty()
  @IsString()
  ownerDepartment!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUri?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: '演示阶段支持直接提交文本内容，后续可替换为对象存储文件解析。' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ type: VisibilityRuleDto })
  @ValidateNested()
  @Type(() => VisibilityRuleDto)
  visibility!: VisibilityRuleDto;
}

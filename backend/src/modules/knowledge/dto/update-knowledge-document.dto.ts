import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VisibilityRuleDto } from './create-knowledge-document.dto';

export class UpdateKnowledgeDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerDepartment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUri?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: '提交新正文时自动重新切片并建立索引。' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: VisibilityRuleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VisibilityRuleDto)
  visibility?: VisibilityRuleDto;
}

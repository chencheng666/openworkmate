import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { VisibilityRuleDto } from './create-knowledge-document.dto';

export class ImportKnowledgeDocumentDto {
  @ApiProperty()
  @IsString()
  filename!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiProperty({ description: '文件的纯 Base64 内容，不包含 data URL 前缀。' })
  @IsString()
  fileBase64!: string;

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
  summary?: string;

  @ApiProperty({ type: VisibilityRuleDto })
  @ValidateNested()
  @Type(() => VisibilityRuleDto)
  visibility!: VisibilityRuleDto;
}

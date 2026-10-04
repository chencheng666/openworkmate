import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';

export class KnowledgeToolInputDto {
  @ApiProperty({ description: '需要从企业企业知识库检索的业务问题。' })
  @IsString()
  @MinLength(2)
  query!: string;

  @ApiPropertyOptional({ type: [String], description: '限定检索的知识分类。' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;
}

export class ExecuteKnowledgeToolDto {
  @ApiProperty({ example: 'workmate_knowledge_search' })
  @IsString()
  toolName!: string;

  @ApiPropertyOptional({ description: '调用方生成的幂等追踪编号。' })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiProperty({ type: KnowledgeToolInputDto })
  @ValidateNested()
  @Type(() => KnowledgeToolInputDto)
  input!: KnowledgeToolInputDto;
}

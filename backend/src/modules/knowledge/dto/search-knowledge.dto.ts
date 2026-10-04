import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class SearchKnowledgeDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  query!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ default: 6 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;
}

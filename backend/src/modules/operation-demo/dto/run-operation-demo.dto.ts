import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RunOperationDemoDto {
  @ApiPropertyOptional({ default: '本周园区超时工单分析与督办建议' })
  @IsOptional()
  @IsString()
  businessGoal?: string;

  @ApiPropertyOptional({ default: '示例产业园' })
  @IsOptional()
  @IsString()
  parkName?: string;
}

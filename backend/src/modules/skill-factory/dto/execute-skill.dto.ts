import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class ExecuteSkillDto {
  @ApiProperty({ example: 'park-ticket-dispatch' })
  @IsString()
  skillName!: string;

  @ApiProperty({ type: Object, example: { businessGoal: '查询园区近期开单的空调故障' } })
  @IsObject()
  input!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '关联本次 Skill 执行的请求编号' })
  @IsOptional()
  @IsString()
  requestId?: string;
}

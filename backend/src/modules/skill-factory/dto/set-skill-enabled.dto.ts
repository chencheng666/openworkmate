import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetSkillEnabledDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

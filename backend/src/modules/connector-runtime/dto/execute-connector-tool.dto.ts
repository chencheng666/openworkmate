import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class ExecuteConnectorToolDto {
  @ApiProperty()
  @IsString()
  toolName!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  input!: {
    businessGoal?: string;
    filters?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    confirmationToken?: string;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReviewConnectorConfirmationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

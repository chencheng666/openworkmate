import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ConnectorStatus } from '../connector.schema';

export class SetConnectorStatusDto {
  @ApiProperty({ enum: ['draft', 'active', 'disabled', 'error'] })
  @IsIn(['draft', 'active', 'disabled', 'error'])
  status!: ConnectorStatus;
}

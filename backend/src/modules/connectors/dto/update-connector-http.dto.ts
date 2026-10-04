import { PartialType, PickType } from '@nestjs/swagger';
import { CreateConnectorDto } from './create-connector.dto';

export class UpdateConnectorHttpDto extends PartialType(PickType(CreateConnectorDto, ['baseUrl', 'authMode', 'metadata'] as const)) {}

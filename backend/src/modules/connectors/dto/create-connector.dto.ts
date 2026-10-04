import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ConnectorAuthMode, ConnectorStatus, ConnectorType } from '../connector.schema';
import { SkillActionKind, SkillRiskLevel } from '../../skill-factory/skill-manifest.types';

export class ConnectorCapabilityDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ enum: ['read', 'write', 'approve', 'notify'] })
  @IsIn(['read', 'write', 'approve', 'notify'])
  actionKind!: SkillActionKind;

  @ApiProperty({ enum: ['low', 'medium', 'high'] })
  @IsIn(['low', 'medium', 'high'])
  riskLevel!: SkillRiskLevel;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredScopes?: string[];
}

export class ConnectorSyncPolicyDto {
  @ApiProperty({ enum: ['manual', 'scheduled', 'webhook'] })
  @IsIn(['manual', 'scheduled', 'webhook'])
  mode!: 'manual' | 'scheduled' | 'webhook';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  intervalMinutes?: number;
}

export class CreateConnectorDto {
  @ApiProperty()
  @IsString()
  key!: string;

  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty({ enum: ['oa', 'ticketing', 'crm', 'contract', 'bi', 'database', 'custom'] })
  @IsIn(['oa', 'ticketing', 'crm', 'contract', 'bi', 'database', 'custom'])
  type!: ConnectorType;

  @ApiProperty()
  @IsString()
  systemName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiProperty({ enum: ['none', 'apiKey', 'oauth2', 'jwt', 'sso', 'database'] })
  @IsIn(['none', 'apiKey', 'oauth2', 'jwt', 'sso', 'database'])
  authMode!: ConnectorAuthMode;

  @ApiPropertyOptional({ enum: ['draft', 'active', 'disabled', 'error'] })
  @IsOptional()
  @IsIn(['draft', 'active', 'disabled', 'error'])
  status?: ConnectorStatus;

  @ApiProperty()
  @IsString()
  ownerDepartment!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  dataDomains!: string[];

  @ApiProperty({ type: [ConnectorCapabilityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConnectorCapabilityDto)
  capabilities!: ConnectorCapabilityDto[];

  @ApiPropertyOptional({ type: ConnectorSyncPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectorSyncPolicyDto)
  syncPolicy?: ConnectorSyncPolicyDto;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

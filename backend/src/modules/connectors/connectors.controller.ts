import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { contextFromHeaders } from '../../common/request-context';
import { ConnectorStatus, ConnectorType } from './connector.schema';
import { ConnectorsService } from './connectors.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { SetConnectorStatusDto } from './dto/set-connector-status.dto';
import { UpdateConnectorHttpDto } from './dto/update-connector-http.dto';

@ApiTags('connectors')
@Controller('connectors')
export class ConnectorsController {
  constructor(private readonly connectors: ConnectorsService) {}

  @Post()
  create(@Headers() headers: Record<string, string | string[] | undefined>, @Body() dto: CreateConnectorDto) {
    return this.connectors.create(contextFromHeaders(headers), dto);
  }

  @Get()
  list(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('type') type?: ConnectorType,
    @Query('status') status?: ConnectorStatus,
  ) {
    return this.connectors.list(contextFromHeaders(headers), { type, status });
  }

  @Get('tool-declarations')
  listToolDeclarations(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.connectors.listToolDeclarations(contextFromHeaders(headers), includeInactive === 'true');
  }

  @Get(':id')
  get(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    return this.connectors.get(contextFromHeaders(headers), id);
  }

  @Get(':id/tool-declarations')
  getToolDeclarations(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    return this.connectors.getToolDeclarations(contextFromHeaders(headers), id);
  }

  @Patch(':id/status')
  setStatus(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() dto: SetConnectorStatusDto,
  ) {
    return this.connectors.setStatus(contextFromHeaders(headers), id, dto.status);
  }

  @Patch(':id/http-config')
  updateHttpConfig(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() dto: UpdateConnectorHttpDto,
  ) {
    return this.connectors.updateHttpConfig(contextFromHeaders(headers), id, dto);
  }

  @Post(':id/health-check')
  healthCheck(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) {
    return this.connectors.healthCheck(contextFromHeaders(headers), id);
  }
}

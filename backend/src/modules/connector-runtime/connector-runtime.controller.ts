import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { contextFromHeaders } from '../../common/request-context';
import { ConnectorRuntimeService } from './connector-runtime.service';
import { ExecuteConnectorToolDto } from './dto/execute-connector-tool.dto';
import { ReviewConnectorConfirmationDto } from './dto/review-connector-confirmation.dto';

@ApiTags('connector-runtime')
@Controller('connector-runtime')
export class ConnectorRuntimeController {
  constructor(private readonly runtime: ConnectorRuntimeService) {}

  @Post('execute')
  execute(@Headers() headers: Record<string, string | string[] | undefined>, @Body() dto: ExecuteConnectorToolDto) {
    return this.runtime.execute(contextFromHeaders(headers), dto);
  }

  @Get('confirmations')
  listConfirmations(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('status') status?: string,
  ) {
    return this.runtime.listConfirmations(contextFromHeaders(headers), status);
  }

  @Post('confirmations/:requestId/approve')
  approveConfirmation(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewConnectorConfirmationDto,
  ) {
    return this.runtime.approveConfirmation(contextFromHeaders(headers), requestId, dto);
  }

  @Post('confirmations/:requestId/reject')
  rejectConfirmation(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewConnectorConfirmationDto,
  ) {
    return this.runtime.rejectConfirmation(contextFromHeaders(headers), requestId, dto);
  }
}

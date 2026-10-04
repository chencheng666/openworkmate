import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { contextFromHeaders } from '../../common/request-context';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('events')
  listEvents(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('result') result?: 'success' | 'blocked' | 'failed',
    @Query('limit') limit?: string,
  ) {
    return this.audit.list(contextFromHeaders(headers), {
      action,
      resourceType,
      result,
      limit: limit ? Number(limit) : undefined,
    });
  }
}

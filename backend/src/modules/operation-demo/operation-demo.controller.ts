import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { contextFromHeaders } from '../../common/request-context';
import { RunOperationDemoDto } from './dto/run-operation-demo.dto';
import { OperationDemoService } from './operation-demo.service';

@ApiTags('operation-demo')
@Controller('operation-demo')
export class OperationDemoController {
  constructor(private readonly demo: OperationDemoService) {}

  @Post('park-operations/run')
  runParkOperationsDemo(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() dto: RunOperationDemoDto = {},
  ) {
    return this.demo.runParkOperationsDemo(contextFromHeaders(headers), dto);
  }
}

import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { contextFromHeaders } from '../../common/request-context';
import { WebChatDto } from './dto/web-chat.dto';
import { WebChatService } from './web-chat.service';

@ApiTags('web-chat')
@Controller('web-chat')
export class WebChatController {
  constructor(private readonly chat: WebChatService) {}

  @Post()
  send(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() dto: WebChatDto,
  ) {
    return this.chat.chat(contextFromHeaders(headers), dto);
  }
}

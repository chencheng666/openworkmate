import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { contextFromHeaders } from '../../common/request-context';
import { WebChatDto } from './dto/web-chat.dto';
import { WebChatService } from './web-chat.service';
import { imageIntent } from './media/contract';
import { ChatMediaService } from './media/chat-media.service';

@ApiTags('web-chat')
@Controller('web-chat')
export class WebChatController {
  constructor(private readonly chat: WebChatService, private readonly media: ChatMediaService) {}

  @Post()
  send(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() dto: WebChatDto,
  ) {
    const ctx = contextFromHeaders(headers);
    const intent = dto.mode === 'general' && imageIntent(dto.message);
    if (intent) return this.media.reply(ctx,intent.action,intent.subject);
    return this.chat.chat(ctx, dto);
  }
}

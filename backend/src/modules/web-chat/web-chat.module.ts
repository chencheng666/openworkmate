import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SkillFactoryModule } from '../skill-factory/skill-factory.module';
import { WebChatController } from './web-chat.controller';
import { WebChatService } from './web-chat.service';
import { ResultsModule } from '../results/results.module';
import { ChatMediaService } from './media/chat-media.service';

@Module({
  imports: [KnowledgeModule, SkillFactoryModule, ResultsModule],
  controllers: [WebChatController],
  providers: [WebChatService, ChatMediaService],
})
export class WebChatModule {}

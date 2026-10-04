import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SkillFactoryModule } from '../skill-factory/skill-factory.module';
import { WebChatController } from './web-chat.controller';
import { WebChatService } from './web-chat.service';

@Module({
  imports: [KnowledgeModule, SkillFactoryModule],
  controllers: [WebChatController],
  providers: [WebChatService],
})
export class WebChatModule {}

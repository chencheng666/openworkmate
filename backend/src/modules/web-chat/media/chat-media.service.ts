import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestContext } from '../../../common/request-context';
import { ResultQueue } from '../../results/results.module';
import { drawIllustration } from './illustration';
import { searchCommons } from './commons';
import type { ChatImage, ImageAction } from './contract';

@Injectable()
export class ChatMediaService {
  private readonly active = new Set<string>();
  constructor(private readonly config: ConfigService, private readonly files: ResultQueue) {}
  async reply(ctx: RequestContext, action: ImageAction, subject: string) {
    if (this.config.get('WEB_CHAT_DEMO_MODE') === 'true') throw new ServiceUnavailableException('演示模式未开启图片服务。');
    const owner = JSON.stringify([ctx.tenantId,ctx.userId]);
    if (this.active.has(owner) || this.active.size >= 8) throw new ConflictException('图片请求正在处理中，请稍后再试。');
    this.active.add(owner);
    try {
      let media: ChatImage[], answer: string;
      if (action === 'search') {
        media = await searchCommons(subject);
        answer = media.length ? '在 Wikimedia Commons 找到了这些图片。使用前可以点「来源与许可」核对原始说明。' : '图库没有找到匹配的图片。试试更短的主题，例如「大熊猫」或「giant panda」。';
      } else {
        const result = await this.files.saveIllustration(ctx, subject, await drawIllustration(this.config,subject));
        media = [{ kind:'illustration', title:result.title, resultId:result.id }];
        answer = '已用对话模型画成一幅矢量插画。PNG 已存入「文件结果」，保留 7 天。';
      }
      return {mode:'general', answer, media, citations:[]};
    } finally { this.active.delete(owner); }
  }
}

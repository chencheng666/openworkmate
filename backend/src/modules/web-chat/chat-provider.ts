import type { ConfigService } from '@nestjs/config';

// 文本回答和插画规划共享同一套模型、地址与服务端凭证。
export function chatProvider(config: ConfigService) {
  const openai = config.get<string>('CHAT_PROVIDER') === 'openai';
  return {
    openai,
    apiKey: config.get<string>(openai ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY')?.trim(),
    baseUrl: openai ? 'https://api.openai.com/v1' : (config.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1').replace(/\/$/,''),
    model: openai ? config.get<string>('OPENAI_CHAT_MODEL')?.trim() || 'gpt-6.2-sol' : config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat',
  };
}

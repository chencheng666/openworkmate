import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Resvg } from '@resvg/resvg-js';
import { chatProvider } from '../chat-provider';

// 只接收颜色和路径坐标，不把模型返回的 HTML、SVG 或外部资源交给渲染器。
export function renderScene(scene: { background?: unknown; layers?: unknown }) {
  const color = (v:unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if (!scene || !color(scene.background) || !Array.isArray(scene.layers) || scene.layers.length < 2 || scene.layers.length > 96) throw Error('画稿无效');
  const paths = scene.layers.map(item => {
    if (!item || !color(item.fill) || typeof item.d !== 'string' || item.d.length > 2400 || !/^[Mm][MmLlHhVvCcSsQqTtAaZz0-9.,+\s-]+$/.test(item.d)) throw Error('路径无效');
    return '<path fill="'+item.fill+'" d="'+item.d+'"/>';
  });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 640 400"><rect width="640" height="400" fill="'+scene.background+'"/>'+paths.join('')+'</svg>';
  return Buffer.from(new Resvg(svg).render().asPng());
}

export async function drawIllustration(config: ConfigService, subject: string) {
  const {openai, apiKey:key, baseUrl:base, model} = chatProvider(config);
  if (!key) throw new ServiceUnavailableException('尚未配置绘制插画所需的服务端模型密钥。');
  try {
    const r = await fetch(base+'/chat/completions',{ method:'POST', redirect:'error', signal:AbortSignal.timeout(90000),
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+key }, body:JSON.stringify({model,
      ...(openai ? {max_completion_tokens:4500} : {max_tokens:4500}), messages:[
        {role:'system',content:'你是一位矢量插画师。根据主题用分层的填色贝塞尔路径创作构图完整、主体清晰的插画。只返回 JSON，格式 {"background":"#RRGGBB","layers":[{"fill":"#RRGGBB","d":"M ... Z"}]}。画布坐标 640×400；建议 12 到 35 层，先背景再主体与细节，每个 d 是合法 SVG 路径，仅使用命令、数字、空格和逗号；颜色必须为六位十六进制。不要写文字、链接或代码围栏。'},
        {role:'user',content:subject.slice(0,2000)}] }) });
    if (!r.ok) throw new BadGatewayException('插画模型请求失败（HTTP '+r.status+'），请检查服务端权限或额度。');
    const data = await r.json();
    return renderScene(JSON.parse(data.choices[0].message.content.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi,'')));
  } catch (e) {
    if (e instanceof BadGatewayException) throw e;
    throw new BadGatewayException('这次没有拿到可绘制的完整画稿，请简化描述后重试。');
  }
}

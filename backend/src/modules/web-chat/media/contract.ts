export type ChatImage =
  | { kind: 'illustration'; title: string; resultId: string }
  | { kind: 'commons'; title: string; thumbnail: string; source: string; artist: string; license: string };

export function commonsUrl(raw: unknown, page = false): string | undefined {
  if (typeof raw !== 'string') return;
  try {
    const u = new URL(raw);
    const origins = page ? ['https://commons.wikimedia.org'] : ['https://upload.wikimedia.org','https://thumb.wikimedia.org'];
    if (!u.username && !u.password && origins.includes(u.origin) && (!page || u.pathname.startsWith('/wiki/File:'))) return u.href;
  } catch { /* 无效链接不能作为媒体加载。 */ }
}

export type ImageAction = 'search' | 'draw';
const prefix = /^(?:(?:请你?|麻烦(?:你)?|帮我|给我|替我|我想要?|能否|可以|一下|先)\s*)*/u;
export function imageIntent(message: string): { action: ImageAction; subject: string } | undefined {
  const text = message.trim().replace(prefix, '');
  if (/^(?:画面|画质|画家|画法|画风)|(?:是什么意思|怎么做|怎么用|的代码|的教程)[？?。!！]*$/u.test(text)) return;
  const found = /^(找(?:一下|一找)?|搜(?:索|一下|一搜)?|查找|看看|看)(?:图[：:]?\s*|(?=.{0,160}(?:照片|图片|配图|插画))(?:一张|几张|两张|三张|一些|些|点)?(?:关于)?)(.+)$/u.exec(text);
  const drawn = /^(?:绘制|绘画|画(?:一下|一画)?|生图[：:]?|(?:生成|制作)(?=.{0,100}(?:图|插画|海报|照片)))(.+)$/u.exec(text);
  if (!found && !drawn) return;
  const subject = (found?.[2] ?? drawn![1]).replace(/^[\s：:]*(?:一幅|一张|一只|一个|一份)?\s*/u,'')
    .replace(/(?:的)?(?:照片|图片|配图)[。！？!？\s]*$/u,'').trim();
  if (subject) return { action: found ? 'search' : 'draw', subject };
}

import { BadGatewayException } from '@nestjs/common';
import { commonsUrl, type ChatImage } from './contract';

type Page = { index: number; title: string; imageinfo?: { thumburl?: string; descriptionurl?: string; mime?: string; extmetadata?: Record<string,{value: string}> }[] };
const plain = (s?: string) => (s || '').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim().slice(0,350);

async function query(host: string, params: Record<string,string>, signal: AbortSignal) {
  const url = new URL('/w/api.php', host);
  url.search = new URLSearchParams({ ...params, format: 'json' }).toString();
  const response = await fetch(url,{ signal, redirect:'error', headers:{ 'User-Agent':'OpenWorkMate/1.0 (https://github.com/chencheng666/openworkmate)' } });
  if (!response.ok) throw Error('图库不可用');
  const body = await response.json();
  if (body.error) throw Error('图库未完成搜索');
  return body;
}

export async function searchCommons(subject: string): Promise<ChatImage[]> {
  const signal = AbortSignal.timeout(22000);
  const search = async (keyword: string) => {
    const data = await query('https://commons.wikimedia.org',{ action:'query', generator:'search', gsrnamespace:'6', gsrlimit:'8',
      gsrsearch: keyword + ' filetype:bitmap', prop:'imageinfo', iiprop:'url|mime|extmetadata', iiurlwidth:'500', iiextmetadatafilter:'Artist|LicenseShortName' },signal);
    return Object.values<Page>(data.query?.pages ?? {}).sort((a,b)=>a.index-b.index).flatMap((page): ChatImage[] => {
      const i = page.imageinfo?.[0], thumbnail = commonsUrl(i?.thumburl), source = commonsUrl(i?.descriptionurl,true);
      if (!thumbnail || !source || !/^image\/(jpeg|png|webp|gif)$/.test(i?.mime ?? '')) return [];
      return [{ kind:'commons', title:plain(page.title.replace(/^File:/,'').replace(/\.[a-z]+$/i,'')), thumbnail, source,
        artist:plain(i?.extmetadata?.Artist?.value), license:plain(i?.extmetadata?.LicenseShortName?.value) }];
    }).slice(0,3);
  };
  try {
    const keyword = subject.slice(0,150);
    const matches = await search(keyword);
    if (matches.length || !/[\u3400-\u9fff]/.test(keyword)) return matches;
    const translated = await query('https://www.wikidata.org',{ action:'wbsearchentities', search:keyword, language:'zh', uselang:'en', limit:'1' },signal);
    const label = translated.search?.[0]?.label;
    return typeof label === 'string' && label !== keyword ? await search(label.slice(0,150)) : [];
  } catch { throw new BadGatewayException('暂时连不上公共图库，请稍后重试或换个关键词。'); }
}

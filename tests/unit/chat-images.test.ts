import { afterEach, expect, it, vi } from 'vitest';
import { commonsUrl, imageIntent } from '../../backend/src/modules/web-chat/media/contract';
import { renderScene } from '../../backend/src/modules/web-chat/media/illustration';
import { searchCommons } from '../../backend/src/modules/web-chat/media/commons';

afterEach(()=>vi.unstubAllGlobals());
it('区分找图、画图和不应该外发的普通问题',()=>{
  expect(imageIntent('请帮我找一张大熊猫的照片')).toEqual({action:'search',subject:'大熊猫'});
  expect(imageIntent('找图：Mount Fuji')).toEqual({action:'search',subject:'Mount Fuji'});
  expect(imageIntent('画：海边灯塔')).toEqual({action:'draw',subject:'海边灯塔'});
  expect(imageIntent('生成一张可爱的小猫插画')?.action).toBe('draw');
  for (const text of ['怎么生成图片？','找一张工单','找些员工资料','不要生成图片','画蛇添足是什么意思？']) expect(imageIntent(text)).toBeUndefined();
});
it('图库缩略图拒绝伪装域名和不安全协议',()=>{
  for (const url of ['https://upload.wikimedia.org.example.com/a.jpg','http://upload.wikimedia.org/a','https://x@thumb.wikimedia.org/a','data:text/html,abc']) expect(commonsUrl(url)).toBeUndefined();
  expect(commonsUrl('https://thumb.wikimedia.org/a.jpg')).toBeTruthy();
});
it('只渲染限定路径和颜色，输出实际 PNG',()=>{
  const layer={fill:'#f0f0f0',d:'M0 0L200 200L30 22Z'};
  const png=renderScene({background:'#001122',layers:[layer,layer]});
  expect([png.toString('ascii',1,4),png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual(['PNG',960,600]);
  for (const d of ['<image href="file:///etc"/>','M0 0" onclick="']) {
    expect(()=>renderScene({background:'#001122',layers:[layer,{...layer,d}]})).toThrow();
  }
});
it('图库失败和没有匹配是不同结果，绝不补造链接',async()=>{
  const f=vi.fn().mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(new Response('',{status:503}));vi.stubGlobal('fetch',f);
  expect(await searchCommons('no matches')).toEqual([]);
  await expect(searchCommons('unavailable')).rejects.toThrow('连不上');
});

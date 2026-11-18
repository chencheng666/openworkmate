import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// 仅在本地开发身份下运行，使用独立测试用户，不访问已有结果。
const base = 'http://127.0.0.1:18790/api/results';
const user = 'files-test-' + randomUUID();
const request = (path='', options={}, identity=user,tenant='files-test') => fetch(base+path,{
  ...options,headers:{'x-user-id':identity,'x-tenant-id':tenant,'Content-Type':'application/json'},
});
const formatList=['md','csv','png','mp4'];
const content='| 工单 | 数量 |\n| --- | --- |\n| 待处理 | 12 |\n| 已完成 | 8 |';
const submitted=[];
for (const format of formatList){
  const res=await request('',{method:'POST',body:JSON.stringify({format,content,title:'本地验收简报'})});
  assert.equal(res.status,202);const item=await res.json();assert.equal(item.status,'queued');submitted.push(item.id);
}
let list=[];
const end=Date.now()+100000;
while(Date.now()<end){
  list=await(await request()).json();
  assert.ok(!list.some(r=>r.status==='failed'),JSON.stringify(list));
  if(list.length===4&&list.every(r=>r.status==='ready'))break;
  await new Promise(r=>setTimeout(r,450));
}
for(const id of submitted){
  const job=list.find(r=>r.id===id);assert.equal(job?.status,'ready');
  const res=await request('/'+id+'/file');assert.equal(res.status,200);const bytes=Buffer.from(await res.arrayBuffer());assert.equal(bytes.length,job.size);
  if(job.format==='md')assert.equal(bytes.toString(),content);
  if(job.format==='csv')assert.ok(bytes.toString().includes('"待处理","12"'));
  if(job.format==='png')assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  if(job.format==='mp4')assert.equal(bytes.subarray(4,8).toString(),'ftyp');
  assert.equal((await request('/'+id+'/file',{},user+'-other')).status,404);
  assert.equal((await request('/'+id+'/file',{},user,'other-org')).status,404);
  console.log(job.format,job.status,bytes.length+' 字节，跨人和跨企业访问均已拒绝');
}

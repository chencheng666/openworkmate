import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { createServer as socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, readFileSync, readdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { mkdir, readdir, symlink } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { setTimeout as pause } from 'node:timers/promises';
import { plan, implement } from './recipes.mjs';
import {generate,modelRequest} from './model.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const state = join(root,'outputs','upgrade-lab');
const run = promisify(execFile);
const env = { PATH: dirname(process.execPath)+':'+process.env.PATH, LANG:'en_US.UTF-8', TMPDIR:tmpdir(), CI:'1' };
const cmd = async (cwd, exe, args, extra={}) => (await run(exe,args,{cwd,env:{...env,...extra},timeout:180000,maxBuffer:4*1024*1024})).stdout.trim();
const git = (cwd,...args) => cmd(cwd,'git',['-c','core.hooksPath=/dev/null',...args]);
const validId = id => /^[a-f0-9]{12}$/.test(id);
mkdirSync(state,{recursive:true,mode:0o700});
const jobs = new Map(), children = new Map();
for (const name of readdirSync(state).filter(n=>/^[a-f0-9]{12}\.json$/.test(n))) {
  const j=JSON.parse(readFileSync(join(state,name),'utf8')); jobs.set(j.id,j);
}
function persist(j) {
  const file=join(state,j.id+'.json');
  writeFileSync(file+'.tmp',JSON.stringify(j),{mode:0o600});renameSync(file+'.tmp',file);
}
function step(j,phase,detail) {
  j.phase=phase;j.steps.push(detail);persist(j);console.log(j.id,detail);
}
function card(j) {
  const disk=JSON.parse(readFileSync(join(state,j.id+'.json'),'utf8'));
  if(disk.phase==='已合并' && j.phase!=='已合并'){Object.assign(j,disk);stop(j);}
  const {id,title,base,sha,branch,target,phase,steps,preview}=j;
  return {id,title,base,sha,branch,target,phase,steps,preview:phase==='待确认'?preview:null};
}
async function port() {
  const s=socket();await new Promise((ok,no)=>s.once('error',no).listen(0,'127.0.0.1',ok));
  const p=s.address().port;await new Promise(ok=>s.close(ok));return p;
}
async function deps(dir) {
  for (const pkg of ['.','backend','web-app','admin-web']) {
    const src=join(root,pkg,'node_modules'), dst=join(dir,pkg,'node_modules');
    await mkdir(dst,{recursive:true});
    for (const entry of await readdir(src)) {
      if (entry.startsWith('.vite')||entry==='.cache'||entry==='.modules.yaml') continue;
      if (!existsSync(join(dst,entry))) await symlink(join(src,entry),join(dst,entry));
    }
  }
}
function service(j,exe,args,cwd,extra={}) {
  const fd=openSync(join(state,j.id+'.services.log'),'a',0o600);
  const p=spawn(exe,args,{cwd,env:{...env,...extra},stdio:['ignore',fd,fd]});closeSync(fd);
  const group=children.get(j.id)||[];group.push(p);children.set(j.id,group);
  p.on('error',e=>{p.problem=e.message;});
  p.on('exit',()=>{if(j.phase==='待确认'){step(j,'预览已停止','预览进程已退出；可在记录页重新启动。');stop(j);}});
  return p;
}
function stop(j) { for(const p of children.get(j.id)||[]) if(p.pid&&p.exitCode===null)p.kill('SIGTERM');children.delete(j.id); }
async function launch(j) {
  const mongo=await port(), logDir=join(state,j.id+'-db');
  await mkdir(logDir,{recursive:true});
  const db=service(j,'mongod',['--dbpath',logDir,'--port',String(mongo),'--bind_ip','127.0.0.1','--wiredTigerCacheSizeGB','0.25'],j.dir);
  const http=await port();j.preview='http://127.0.0.1:'+http;
  const web=service(j,process.execPath,['dist/main.js','--web'],join(j.dir,'backend'),{
    MONGODB_URI:'mongodb://127.0.0.1:'+mongo+'/candidate', PORT:String(http), HOST:'127.0.0.1',
    AUTH_MODE:'development', NODE_ENV:'development', WEB_CHAT_DEMO_MODE:'true', JWT_SECRET:randomUUID()+randomUUID(),CORS_ORIGIN:j.preview,
  });
  for(let i=0;i<100;i++) {
    if([db,web].some(p=>p.problem||p.exitCode!==null))throw Error('预览服务未启动，请检查本地 mongod 及任务日志。');
    const r=await fetch(j.preview+'/api/health',{signal:AbortSignal.timeout(1500)}).catch(()=>null);
    if(r?.ok && (await r.json()).database?.name==='candidate') return;
    await pause(300);
  }
  throw Error('候选服务健康检查超时。');
}
async function verifyXlsx(j) {
  const url=j.preview+'/api/results', headers={'Content-Type':'application/json','x-user-id':'web-demo-user','x-tenant-id':'workmate'};
  const res=await fetch(url,{method:'POST',headers,body:JSON.stringify({format:'xlsx',title:'工单汇总样例',content:'| 工单编号 | 状态 |\n| --- | --- |\n| 000123 | 已完成 |\n| 000124 | 待处理 |'})});
  if(res.status!==202) throw Error('真实导出接口未接受任务。');
  const {id}=await res.json();
  for(let i=0;i<60;i++){
    const r=await fetch(url+'/'+id+'/preview',{headers});
    if(r.ok){
      const {rows}=await r.json();
      const file=await fetch(url+'/'+id+'/file',{headers});
      const denied=await fetch(url+'/'+id+'/preview',{headers:{...headers,'x-user-id':'other'}});
      if(rows[1]?.[0]!=='000123'||!file.ok||!file.headers.get('content-type')?.includes('spreadsheetml')||Buffer.from(await file.arrayBuffer()).subarray(0,2).toString()!=='PK'||denied.status!==404)throw Error('工作簿预览、下载或权限检查失败。');
      return;
    }
    if(r.status!==409)throw Error('读取候选预览失败：'+r.status);
    await pause(300);
  }
  throw Error('导出任务超时。');
}
async function pipeline(j,spec,resume=false) {
  try {
    if(!resume){
      step(j,'修改中','创建独立 Git 分支及工作树');
      await git(root,'worktree','add','-b',j.branch,j.dir,j.base);
      if(spec.kind==='model'){
        const id=await generate(root,j,msg=>step(j,'修改中',msg));
        const prefix='web-app/src/features/generated/'+id;
        await git(j.dir,'add','--',prefix+'.json',prefix+'.qjs');
        const changed=(await git(j.dir,'diff','--cached','--name-only')).split('\n');
        if(changed.some(f=>f!==prefix+'.json'&&f!==prefix+'.qjs')||await git(j.dir,'ls-files','--others','--exclude-standard'))throw Error('改动超出功能源码范围');
      }else{await implement(j.dir,spec);await git(j.dir,'add','--all');}
      await git(j.dir,'diff','--cached','--check');
      if(spec.kind==='model')await cmd(j.dir,process.execPath,[join(root,'scripts/check-public-release.mjs')]);
      await git(j.dir,'commit','-m','候选升级：'+spec.title);
      j.sha=await git(j.dir,'rev-parse','HEAD');
    }else if(await git(j.dir,'rev-parse','HEAD')!==j.sha||await git(j.dir,'status','--porcelain')) throw Error('候选源码已变化，不能恢复。');
    step(j,'验证中','在候选工作树运行类型检查、构建和回归测试');
    await deps(j.dir);
    for(const pkg of ['backend','web-app','admin-web']){
      const dir=join(j.dir,pkg),bin=(n)=>join(dir,'node_modules','.bin',n);
      await cmd(dir,bin('tsc'),['--noEmit']);
      await cmd(dir,bin(pkg==='backend'?'nest':'vite'),['build']);
    }
    const output=await cmd(j.dir,join(j.dir,'node_modules/.bin/vitest'),['run','--no-color']);
    step(j,'启动中',output.split('\n').find(l=>/^\s*Tests\s+\d+ passed/.test(l))?.trim()||'单元测试通过');
    await launch(j);
    if(spec.kind==='xlsx') {await verifyXlsx(j);step(j,'启动中','真实队列生成工作簿，预览、下载、跨用户拒绝均通过');}
    const browser=await cmd(join(j.dir,'web-app'),join(j.dir,'node_modules/.bin/playwright'),['test','--workers=2','--reporter=list'],{WORKMATE_PREVIEW_URL:j.preview});
    step(j,'验证中',browser.split('\n').find(l=>/^\s*\d+ passed/.test(l))?.trim()||'候选页面端到端回归通过');
    step(j,'待确认','独立预览已就绪；未合并。');
  }catch(e){
    const detail=String(e.stdout||e.stderr||e.message).replace(/\x1B\[[0-9;]*m/g,'').slice(-3500);
    step(j,'失败',detail);stop(j);
  }
}
const args=process.argv.slice(2);
if(args[0]==='accept'){
  const [,id,sha]=args,j=jobs.get(id);
  if(!validId(id)||!j||j.sha!==sha||!['待确认','预览已停止'].includes(j.phase)||!j.steps.includes('独立预览已就绪；未合并。'))throw Error('需要已验收候选的完整编号和提交哈希。');
  if(await git(root,'branch','--show-current')!==j.target||await git(root,'rev-parse','HEAD')!==j.base||await git(root,'status','--porcelain')||await git(j.dir,'rev-parse','HEAD')!==sha||await git(j.dir,'status','--porcelain'))throw Error('分支或工作树已变化，拒绝合并，请重新验证。');
  await git(root,'merge','--ff-only',sha);step(j,'已合并','维护者已明确确认并快进合并。');
}else {
  const host='127.0.0.1:18794',origin='http://'+host;
  const origins=new Set([origin,'http://127.0.0.1:18790','http://127.0.0.1:5180']);
  let reserving=false;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try{
      if(req.headers.host!==host)return send(403,{message:'只允许本机地址'});
      if(req.url==='/jobs'&&origins.has(req.headers.origin)&&['POST','OPTIONS'].includes(req.method)){
        res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');
        if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Local-Upgrade');res.writeHead(204);return res.end();}
      }
      if(req.method==='GET' && req.url==='/'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});return res.end(readFileSync(new URL('./index.html',import.meta.url)));
      }
      if(req.method==='GET' && req.url==='/lab.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(readFileSync(new URL('./ui.mjs',import.meta.url)));}
      if(req.method==='GET'&&req.url==='/jobs')return send(200,[...jobs.values()].reverse().map(card));
      const diff=req.url?.match(/^\/diff\/([a-f0-9]{12})$/);
      if(req.method==='GET'&&diff){
        const j=jobs.get(diff[1]);if(!j?.sha)return send(404,{message:'尚无变更'});
        res.setHeader('Content-Type','text/plain; charset=utf-8');return res.end(await git(root,'diff',j.base,j.sha));
      }
      if(req.method!=='POST'||req.url!=='/jobs')return send(404,{message:'没有此操作'});
      if(!origins.has(req.headers.origin)||req.headers['x-local-upgrade']!=='1'||req.headers['content-type']!=='application/json')return send(403,{message:'仅接受本地升级对话的提交'});
      const parts=[];let bytes=0;for await(const part of req){bytes+=part.length;if(bytes>4096)return send(413,{message:'需求过长'});parts.push(part);}
      const {request,resume}=JSON.parse(Buffer.concat(parts).toString());
      if(typeof request!=='string' && !validId(resume))return send(400,{message:'需要升级需求'});
      const old=jobs.get(resume);
      if(resume&&(!old?.sha||!['预览已停止','失败'].includes(old.phase)))return send(409,{message:'当前任务不可恢复'});
      const spec=old?(old.engine==='model'?modelRequest(old.title):plan(old.title)):modelRequest(request);
      const existing=[...jobs.values()].find(j=>j.title===spec.title&&['修改中','验证中','启动中','待确认'].includes(j.phase));
      if(existing)return send(200,card(existing));
      if([...jobs.values()].some(j=>['修改中','验证中','启动中'].includes(j.phase))||children.size>=3)return send(409,{message:'本地执行槽已满，请稍后再试或重启升级服务以释放预览'});
      if(old){void pipeline(old,spec,true);return send(202,card(old));}
      if(reserving)return send(409,{message:'正在分配工作树，请稍后再试'});
      reserving=true;
      try {
      const id=randomUUID().replaceAll('-','').slice(0,12);
      const base=await git(root,'rev-parse','HEAD'),target=await git(root,'branch','--show-current');
      if(!target||await git(root,'status','--porcelain'))return send(409,{message:'基线有未提交改动或处于游离状态，请先整理，再生成候选。'});
      const j={id,title:spec.title,engine:spec.kind,base,target,branch:'codex/upgrade-'+id,dir:join(state,id,'source'),phase:'排队',steps:[]};
      jobs.set(id,j);void pipeline(j,spec);return send(202,card(j));
      }finally{reserving=false;}
    }catch(e){return send(400,{message:e.message});}
  });
  server.listen(18794,'127.0.0.1',()=>{
    for(const j of jobs.values())if(!['已合并','失败','预览已停止'].includes(j.phase))step(j,j.phase==='待确认'?'预览已停止':'失败','升级服务已重启，之前的预览不再作数。');
    console.log('本地升级对话：'+origin);
  });
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
    for(const j of jobs.values())stop(j);server.close();setTimeout(()=>process.exit(0),500).unref();
  });
}

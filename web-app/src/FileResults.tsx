import { useCallback, useEffect, useRef, useState } from 'react';
import { getIdentityHeaders } from './auth-session';
import { apiBase, native, storeFile } from './platform';
import MarkdownAnswer from './MarkdownAnswer';

const kinds = { md:'Markdown 文档', csv:'CSV 表格', png:'PNG 摘要卡', mp4:'MP4 简报' };
type Kind = keyof typeof kinds;
type Result = {id:string;filename:string;format:Kind;status:'queued'|'running'|'ready'|'failed';size:number;error?:string};
const states = { queued:'排队中',running:'生成中',ready:'已就绪',failed:'生成失败' };
async function api(path:string,init?:RequestInit) {
  const res=await fetch(apiBase+'/results'+path,{...init,credentials:'include',headers:{...getIdentityHeaders(),...(init?.body?{'Content-Type':'application/json'}:{})}});
  if(!res.ok){const e=await res.json().catch(()=>({})); throw new Error(e.message || '无法读取文件结果');} return res;
}
function csvRows(text:string) {
  const rows:string[][]=[]; let row:string[]=[], cell='', quoted=false;
  const s=text.replace(/^\uFEFF/,'');
  for(let i=0;i<s.length;i++) {
    const c=s[i];
    if(c==='"'){ if(quoted && s[i+1]==='"'){cell+='"';i++;} else quoted=!quoted; }
    else if(!quoted && c===','){row.push(cell);cell='';}
    else if(!quoted && c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  row.push(cell); rows.push(row);return rows;
}
export default function FileResults({source,close}:{source:string;close:()=>void}) {
  const dlg=useRef<HTMLDialogElement>(null);
  const [text,setText]=useState(source), [title,setTitle]=useState(source?'回答摘要':'工作简报');
  const [kind,setKind]=useState<Kind>('md'),[items,setItems]=useState<Result[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [folder,setFolder]=useState(''),[shortcut,setShortcut]=useState(''),[notice,setNotice]=useState('');
  const [active,setActive]=useState<Result|null>(null),[preview,setPreview]=useState<{id:string;url:string;text:string}|null>(null);
  const [revision,bump]=useState(0);
  const previewSection=useRef<HTMLElement>(null);
  useEffect(()=>{ if(preview)previewSection.current?.scrollIntoView({block:'nearest'}); },[preview]);
  const handleError=(e:unknown)=>setError(e instanceof Error?e.message:String(e));
  useEffect(()=>{const d=dlg.current!;d.showModal();return()=>d.close();},[]);
  useEffect(()=>{if(native)void native.invoke<[string|null,string]>('desktop_info').then(([dir,key])=>{setFolder(dir||'');setShortcut(key);}).catch(handleError);},[]);
  useEffect(()=>{
    const ac=new AbortController(); let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try {
      const list=await(await api('',{signal:ac.signal})).json() as Result[];
      if(ac.signal.aborted)return;setItems(list);
      if(list.some(x=>x.status==='queued'||x.status==='running')) timer=setTimeout(poll,750);
    }catch(e){if(!ac.signal.aborted){handleError(e);timer=setTimeout(poll,4000);}}};
    void poll();return()=>{ac.abort();clearTimeout(timer);};
  },[revision]);
  useEffect(()=>{
    const ac=new AbortController();let url='';setPreview(null);
    if(active)void (async()=>{try{
      const b=await(await api('/'+active.id+'/file',{signal:ac.signal})).blob();
      const body=active.format==='csv'||active.format==='md'?await b.text():'';
      if(!ac.signal.aborted){url=URL.createObjectURL(b);setPreview({id:active.id,url,text:body});}
    }catch(e){if(!ac.signal.aborted){handleError(e);setActive(null);}}})();
    return()=>{ac.abort();if(url)URL.revokeObjectURL(url);};
  },[active]);
  const choose=useCallback(async()=>{
    const dir=await native?.invoke<string|null>('choose_folder');if(dir)setFolder(dir);return dir;
  },[]);
  const generate=async()=>{
    setBusy(true);setError('');setNotice('');
    try{const result:Result=await(await api('',{method:'POST',body:JSON.stringify({title:title.trim(),content:text.trim(),format:kind})})).json();
      setItems(list=>[result,...list.filter(x=>x.id!==result.id)]);bump(n=>n+1);setNotice('任务已提交，关闭窗口不会中断生成。');}
    catch(e){handleError(e);}finally{setBusy(false);}
  };
  const save=async(r:Result)=>{
    setError('');setNotice('');
    try{if(native&&!folder&&!await choose())return;
      const path=await storeFile(await(await api('/'+r.id+'/file')).blob(),r.filename);
      setNotice(path?'已保存到 '+path:'已开始下载 '+r.filename);
    }catch(e){handleError(e);}
  };
  return <dialog ref={dlg} className="files-dialog" aria-labelledby="files-title" onCancel={e=>{e.preventDefault();close();}}>
    <header><div><small>WORKSPACE / FILES</small><h2 id="files-title">文件结果</h2></div><button type="button" onClick={close}>关闭</button></header>
    <div className="files-scroll"><div className="files-columns"><form onSubmit={e=>{e.preventDefault();void generate();}}>
      <h3>生成文件</h3><label>文件名称<input required maxLength={72} value={title} onChange={e=>setTitle(e.target.value)} /></label>
      <label>格式<select value={kind} onChange={e=>setKind(e.target.value as Kind)}>{Object.entries(kinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>正文<textarea required maxLength={12000} rows={6} value={text} onChange={e=>setText(e.target.value)} placeholder="输入正文，或从一条对话回答创建文件" /></label>
      <small>{kind==='png'?'取正文前 6 行生成摘要卡。':kind==='mp4'?'将正文排成最多 4 张字幕卡，每张播放 3 秒，无音轨。':kind==='csv'?'优先导出第一张 Markdown 表，无表格时按段落分行。':'保留 Markdown 原文和表格。'}</small>
      <button className="file-submit" disabled={busy||!text.trim()||!title.trim()}>{busy?'提交中…':'生成文件'}</button></form>
      <section><h3>我的结果 <small>保留 7 天</small></h3>
      {native&&<div className="desktop-prefs"><span>唤起：{shortcut}</span><button onClick={()=>void choose().catch(handleError)}>{folder?'更换保存目录':'选择保存目录'}</button>{folder&&<small>{folder}</small>}</div>}
      {items.length===0&&<p>暂无结果。生成一份文件后，可在这里预览或下载。</p>}
      <ul>{items.map(r=><li key={r.id}><div><strong>{r.filename}</strong><small role="status">{states[r.status]}{r.status==='ready'?' · '+Math.max(1,Math.ceil(r.size/1024))+' KB':''}{r.error?' · '+r.error:''}</small></div>
        {r.status==='ready'&&<><button onClick={()=>{setError('');setActive(r);}}>预览</button><button onClick={()=>void save(r)}>{native?'保存':'下载'}</button></>}</li>)}</ul></section></div>
      {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {active&&<section ref={previewSection} className="file-preview" aria-label="文件预览"><h3>{active.filename}</h3>{preview?.id!==active.id?'正在加载预览…':
        active.format==='png'?<img src={preview.url} alt={active.filename}/>:active.format==='mp4'?<video controls playsInline src={preview.url} aria-label={active.filename}/>:
        active.format==='md'?<MarkdownAnswer>{preview.text}</MarkdownAnswer>:<table><tbody>{csvRows(preview.text).map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table>}</section>}
    </div></dialog>;
}

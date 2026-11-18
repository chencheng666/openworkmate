import {useEffect,useRef,useState} from 'react';
import {features} from './catalog';

export default function FeaturePanel({close}:{close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),worker=useRef<Worker|null>(null),timer=useRef<number|undefined>(undefined);
  const [id,setId]=useState(features[0]?.id),[values,setValues]=useState<Record<string,string>>({}),[result,setResult]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const item=features.find(f=>f.id===id);
  const stop=()=>{worker.current?.terminate();worker.current=null;window.clearTimeout(timer.current);};
  useEffect(()=>{const d=dialog.current!;d.showModal();return()=>{stop();d.close();};},[]);
  function execute(action:string){
    if(!item)return;stop();setError('');setResult(null);setBusy(true);
    try{
      const w=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});worker.current=w;
      const done=(text:string|null,err:string)=>{stop();setBusy(false);setResult(text);setError(err);};
      timer.current=window.setTimeout(()=>done(null,'执行超时，已终止。'),8000);
      w.onmessage=e=>done(e.data.text??null,e.data.error||'');w.onerror=()=>done(null,'无法启动隔离运行时');
      w.postMessage({source:item.source,values:Object.fromEntries(item.spec.fields.map(f=>[f.id,values[f.id]||''])),action});
    }catch{stop();setBusy(false);setError('无法启动功能');}
  }
  return <dialog ref={dialog} className="files-dialog" aria-labelledby="features-title" onCancel={e=>{e.preventDefault();close();}}>
    <header><div><small>WORKSPACE / TOOLS</small><h2 id="features-title">工作台工具</h2></div><button onClick={close}>关闭</button></header>
    <div className="files-scroll"><label>选择工具 <select value={id} onChange={e=>{stop();setBusy(false);setId(e.target.value);setValues({});setResult(null);setError('');}}>{features.map(f=><option key={f.id} value={f.id}>{f.spec.title}</option>)}</select></label>
    {item&&<section><h3>{item.spec.title}</h3><p>{item.spec.description}</p>{item.spec.fields.map(f=><label style={{display:'block',margin:'12px 0'}} key={f.id}>{f.label}<textarea rows={3} style={{display:'block',width:'100%'}} maxLength={12000} placeholder={f.hint} value={values[f.id]||''} onChange={e=>setValues({...values,[f.id]:e.target.value})}/></label>)}
    {item.spec.actions.map(a=><button className="file-submit" key={a.id} disabled={busy} onClick={()=>execute(a.id)}>{a.label}</button>)}
    {busy&&<p role="status">计算中…</p>}{error&&<p role="alert">{error}</p>}{result!==null&&<pre data-testid="feature-result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{result}</pre>}</section>}</div>
  </dialog>;
}

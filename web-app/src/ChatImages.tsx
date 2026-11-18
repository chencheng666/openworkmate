import { useEffect, useRef, useState } from 'react';
import { commonsUrl, type ChatImage } from '../../backend/src/modules/web-chat/media/contract';
import { getIdentityHeaders } from './auth-session';
import { apiBase, storeFile } from './platform';
import './chat-images.css';

function ImageCard({image}:{image:ChatImage}) {
  const [src,setSrc] = useState(''), [error,setError] = useState(''), [revision,retry] = useState(0);
  const [ready,setReady] = useState(false), [notice,setNotice] = useState('');
  const dlg = useRef<HTMLDialogElement>(null), file = useRef<Blob | undefined>(undefined);
  useEffect(()=>{
    const abort = new AbortController();
    let local = '';
    setSrc(''); setError(''); setReady(false); setNotice(''); file.current = undefined;
    async function load() {
      if (image.kind === 'commons') {
        const url = commonsUrl(image.thumbnail);
        if (!url) throw Error('图库地址无效。');
        setSrc(url); return;
      }
      if (!/^[a-f0-9]{24}$/i.test(image.resultId)) throw Error('文件编号无效。');
      const r = await fetch(apiBase+'/results/'+image.resultId+'/file',{headers:getIdentityHeaders(),credentials:'include',signal:abort.signal});
      if (!r.ok) throw Error(r.status === 404 ? '文件已过期或当前账号无权查看。' : '无法读取图片文件。');
      const blob = await r.blob();
      if (abort.signal.aborted) return;
      if (blob.type !== 'image/png') throw Error('文件不是 PNG 图片。');
      file.current = blob; local = URL.createObjectURL(blob); setSrc(local);
    }
    load().catch(e=>{ if (!abort.signal.aborted) setError(e.message || '图片加载失败。'); });
    return ()=>{abort.abort(); if(local) URL.revokeObjectURL(local);};
  },[image,revision]);
  const source = image.kind === 'commons' && commonsUrl(image.source,true);
  return <figure className="chat-image-card">
    <div className="chat-image-stage" aria-busy={!ready && !error}>
      {src && !error && <button type="button" aria-label={'放大图片：'+image.title} disabled={!ready} onClick={()=>dlg.current?.showModal()}>
        <img src={src} alt={image.title} referrerPolicy="no-referrer" onLoad={()=>setReady(true)} onError={()=>setError('预览未能加载。')}/>
      </button>}
      {!ready && !error && <span role="status">正在加载图片…</span>}
      {error && <span role="status">{error} <button onClick={()=>retry(n=>n+1)}>重新加载</button></span>}
    </div>
    <figcaption><strong>{image.title}</strong>
      {image.kind === 'illustration' ? <><small>AI 矢量插画 · PNG</small><button disabled={!ready || !!error} onClick={async()=>{
        if (!file.current) return;
        try { await storeFile(file.current,image.title+'.png'); setNotice('已发起保存'); } catch { setNotice('保存未完成，请重试'); }
      }}>保存 PNG</button>{notice && <small role="status">{notice}</small>}</> :
      <><small>Wikimedia Commons · {image.license || '许可见来源页'}</small>
        {image.artist && (image.artist.length > 65 ? <details><summary>查看作者署名</summary>{image.artist}</details> : <small>作者：{image.artist}</small>)}
        {source && <a href={source} target="_blank" rel="noopener noreferrer">来源与许可 ↗</a>}</>}
    </figcaption>
    <dialog ref={dlg} className="chat-image-dialog" aria-label={image.title} onClick={e=>{if(e.target===dlg.current) dlg.current?.close();}}>
      <button type="button" onClick={()=>dlg.current?.close()}>关闭大图</button>
      {ready && !error && <img alt={image.title} src={src} referrerPolicy="no-referrer"/>}
    </dialog>
  </figure>;
}

export function ChatImages({images}:{images:ChatImage[]}) {
  return <div className="chat-image-gallery">{images.slice(0,3).map(item=><ImageCard key={item.kind==='commons'?item.source:item.resultId} image={item}/>)}</div>;
}

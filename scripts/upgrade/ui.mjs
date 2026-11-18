const $=s=>document.querySelector(s), input=$('#request'), list=$('#jobs'), error=$('#error');
const edit=new URLSearchParams(location.hash.slice(1)).get('request');if(edit)input.value=edit.slice(0,600);
const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
const link=(name,url)=>Object.assign(el('a',name),{href:url,target:'_blank',rel:'noopener noreferrer'});
let last='';
async function refresh(){
  try{
    const res=await fetch('/jobs');if(!res.ok)throw Error('升级服务暂不可用');
    const jobs=await res.json(),key=JSON.stringify(jobs);if(last===key)return;last=key;
    list.replaceChildren();
    if(!jobs.length)list.append(el('p','暂无候选版本。'));
    for(const j of jobs){
      const a=el('article','');a.id='job-'+j.id;
      a.append(el('small',j.phase),el('h3',j.title),el('code',j.branch));
      const ol=el('ol','');for(const s of j.steps)ol.append(el('li',s));a.append(ol);
      if(j.sha)a.append(link('查看代码差异','/diff/'+j.id));
      if(j.preview)a.append(link('打开候选工作台',j.preview));
      if(['预览已停止','失败'].includes(j.phase)&&j.sha){const b=el('button','重新验证并启动');b.onclick=()=>submit({resume:j.id});a.append(b);}
      if(j.phase==='待确认'){const d=el('details','');d.append(el('summary','确认后如何合并？'),el('p','试用满意后，由维护者在项目根目录运行以下命令。网页没有合并权限。'),el('pre','pnpm upgrade:accept '+j.id+' '+j.sha));a.append(d);}
      list.append(a);
    }
    if(/^#job-[0-9a-f]{12}$/.test(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'nearest'});
  }catch(e){error.textContent=e.message;}
}
async function submit(payload){
  error.textContent='';try{const r=await fetch('/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Upgrade':'1'},body:JSON.stringify(payload)});const result=await r.json();if(!r.ok)throw Error(result.message);input.value='';await refresh();}
  catch(e){error.textContent=e.message;}
}
$('form').onsubmit=e=>{e.preventDefault();if(input.value.trim())void submit({request:input.value.trim()});};
$('#sample').onclick=()=>{input.value='新增工时汇总工具：每行输入类别和分钟数，用逗号分隔，忽略空行，按类别合计输出。';input.focus();};
await refresh();setInterval(refresh,1400);

import { BadGatewayException } from '@nestjs/common';

type Item = { type: string; name?: string; arguments?: string; call_id?: string; content?: {type:string;text?:string;refusal?:string}[] };
type Tool = { name:string; description:string; parameters:object };
export class ResponsesPermissionError extends Error {}

// 只回放本次对话的输出项，不存储服务端对话。工具执行仍由调用方按租户和角色授权。
export async function answerWithTools(args:{
  apiKey:string;model:string;messages:object[];tools:Tool[];signal:AbortSignal;
  execute:(name:string,input:Record<string,unknown>)=>Promise<unknown>;
}) {
  const input:object[]=[...args.messages];
  const ids=new Set<string>();
  for(let round=0; round<3; round++){
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:args.signal,
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+args.apiKey},
      body:JSON.stringify({model:args.model,input,store:false,max_output_tokens:2400,
        tools:args.tools.map(t=>({...t,type:'function',strict:false})),parallel_tool_calls:false,tool_choice:round<2?'auto':'none'})});
    const data=await r.json().catch(()=>null) as {model?:string;status?:string;output?:Item[];error?:{message?:string}}|null;
    if(!r.ok){
      if(round===0 && [401,403].includes(r.status) && data?.error?.message?.includes('api.responses.write'))throw new ResponsesPermissionError();
      throw new BadGatewayException('业务工具模型请求失败（HTTP '+r.status+'）。');
    }
    if(data?.status!=='completed'||!Array.isArray(data.output))throw new BadGatewayException('业务工具模型未生成完整结果。');
    const calls=data.output.filter(x=>x.type==='function_call');
    if(!calls.length){
      const answer=data.output.filter(x=>x.type==='message').flatMap(x=>x.content||[]).map(x=>x.text||x.refusal||'').join('\n').trim();
      if(!answer)throw new BadGatewayException('业务工具模型未返回有效回答。');
      return {answer,providerModel:data.model};
    }
    if(round===2||calls.length!==1)throw new BadGatewayException('工具调用次数超限，已停止。');
    input.push(...data.output);
    const call=calls[0];
    if(!call.call_id||ids.has(call.call_id))throw new BadGatewayException('重复或无效的工具调用编号。');
    ids.add(call.call_id);
    let result:unknown={status:'blocked',reason:'未授权或参数无效'};
    if(call.name && args.tools.some(t=>t.name===call.name)){
      let parsed:unknown;
      try{parsed=JSON.parse(call.arguments||'');}catch{/* 参数无效时不执行。 */}
      if(parsed && typeof parsed==='object'&&!Array.isArray(parsed))result=await args.execute(call.name,parsed as Record<string,unknown>);
    }
    input.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)});
  }
  throw new BadGatewayException('工具调用未完成。');
}

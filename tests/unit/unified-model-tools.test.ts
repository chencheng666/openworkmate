import {afterEach,it,expect,vi} from 'vitest';
import {WebChatService} from '../../backend/src/modules/web-chat/web-chat.service';
const ctx={tenantId:'demo',userId:'demo',roleIds:[],parkIds:[]};
function setup(){
  const execute=vi.fn().mockResolvedValue({rows:[{code:'EXAMPLE01'}]});
  const chat=new WebChatService({get:(k:string)=>({CHAT_PROVIDER:'openai',OPENAI_CHAT_MODEL:'gpt-6.2-sol',OPENAI_API_KEY:'test'}[k])} as never,
    {executeTool:vi.fn().mockResolvedValue({result:{citations:[]}})} as never,
    {listRuntimeTools:vi.fn().mockResolvedValue([{name:'sample_ticket',skillName:'ticket',description:'示例工单',inputSchema:{type:'object'}}]),execute} as never);
  return {execute,chat};
}
afterEach(()=>vi.unstubAllGlobals());
it('Responses 按业务身份执行授权工具，回传调用编号并取得回答',async()=>{
  const {chat,execute}=setup(),f=vi.fn().mockResolvedValueOnce(Response.json({status:'completed',output:[{type:'function_call',call_id:'c1',name:'sample_ticket',arguments:'{"id":"EXAMPLE01"}'}]}))
    .mockResolvedValueOnce(Response.json({status:'completed',model:'gpt-6.2-sol',output:[{type:'message',content:[{type:'output_text',text:'已读取示例工单'}]}]}));
  vi.stubGlobal('fetch',f);
  const r=await chat.chat(ctx,{message:'请查示例工单'});expect(r.answer).toBe('已读取示例工单');
  expect(execute).toHaveBeenCalledWith(ctx,expect.objectContaining({skillName:'ticket',input:{id:'EXAMPLE01'}}));
  expect(f.mock.calls.every(([url])=>url.endsWith('/responses'))).toBe(true);
  expect(JSON.parse(f.mock.calls[1][1].body).input.at(-1)).toMatchObject({type:'function_call_output',call_id:'c1'});
});
it('首轮权限不足只做同模型知识问答，不执行或虚构业务操作',async()=>{
  const {chat,execute}=setup(),f=vi.fn().mockResolvedValueOnce(Response.json({error:{message:'Missing scopes: api.responses.write'}},{status:401}))
    .mockResolvedValueOnce(Response.json({model:'gpt-6.2-sol',choices:[{message:{content:'请参考示例制度。'}}]}));
  vi.stubGlobal('fetch',f);const r=await chat.chat(ctx,{message:'查询制度'});
  expect(r.answer).toMatch(/^业务工具暂不可用/);expect(execute).not.toHaveBeenCalled();
  const plain=JSON.parse(f.mock.calls[1][1].body);expect(plain.model).toBe('gpt-6.2-sol');expect(plain.tools).toBeUndefined();
});

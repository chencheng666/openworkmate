import {afterEach,expect,it,vi} from 'vitest';
import {WebChatService} from '../../backend/src/modules/web-chat/web-chat.service';
const ctx={tenantId:'demo',userId:'demo',roleIds:[],parkIds:[]};
function setup(demo=false){
  const knowledge={executeTool:vi.fn()}, skills={listRuntimeTools:vi.fn(),execute:vi.fn()};
  const config={get:(k:string)=>({WEB_CHAT_DEMO_MODE:String(demo),CHAT_PROVIDER:'openai',OPENAI_API_KEY:'test'}[k])};
  return {chat:new WebChatService(config as never,knowledge as never,skills as never),knowledge,skills};
}
afterEach(()=>vi.unstubAllGlobals());
it('通用问答直达模型，只带本对话上下文，不检索、不注册工具、不返回企业引用',async()=>{
  const {chat,knowledge,skills}=setup();
  const fetchMock=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:'因为光的散射。'}}]}));vi.stubGlobal('fetch',fetchMock);
  const r=await chat.chat(ctx,{message:'天空为什么是蓝色？',mode:'general',history:[{role:'user',content:'我想了解光'}]});
  const body=JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.tools).toBeUndefined();expect(body.messages.slice(1)).toEqual([{role:'user',content:'我想了解光'},{role:'user',content:'天空为什么是蓝色？'}]);
  expect(knowledge.executeTool).not.toHaveBeenCalled();expect(skills.listRuntimeTools).not.toHaveBeenCalled();expect(skills.execute).not.toHaveBeenCalled();
  expect(r).toMatchObject({mode:'general',citations:[],answer:'因为光的散射。'});
});
it('演示模式不伪造通用回答，不外发请求',async()=>{
  const {chat,knowledge}=setup(true);const f=vi.fn();vi.stubGlobal('fetch',f);
  await expect(chat.chat(ctx,{message:'你好',mode:'general'})).rejects.toThrow('演示模式');
  expect(f).not.toHaveBeenCalled();expect(knowledge.executeTool).not.toHaveBeenCalled();
});
it('企业与通用问答使用同一配置，并区分请求型号与服务端回报型号',async()=>{
  const config={get:(k:string)=>({CHAT_PROVIDER:'openai',OPENAI_API_KEY:'test',OPENAI_CHAT_MODEL:'gpt-6.2-sol'}[k])};
  const chat=new WebChatService(config as never,{executeTool:vi.fn().mockResolvedValue({result:{citations:[]}})} as never,{listRuntimeTools:vi.fn().mockResolvedValue([])} as never);
  const fetchMock=vi.fn(async(_url:string, init:RequestInit)=>Response.json({model:JSON.parse(String(init.body)).model+'-snapshot',choices:[{message:{content:'测试回复'}}]}));
  vi.stubGlobal('fetch',fetchMock);
  for(const [mode,model] of [['general','gpt-6.2-sol'],['enterprise','gpt-6.2-sol']] as const){
    const r=await chat.chat(ctx,{mode,message:'测试'});
    expect(r).toMatchObject({model,providerModel:model+'-snapshot'});
  }
});

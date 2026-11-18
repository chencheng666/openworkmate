import {expect,test} from 'vitest';
import {contract,modelRequest} from '../../scripts/upgrade/model.mjs';
import {evaluateFeature} from '../../web-app/src/features/runtime.mjs';
test('自由需求不是配方，但空需求和疑似密钥不可外发',()=>{
  expect(modelRequest('按街区统计工时').kind).toBe('model');
  expect(()=>modelRequest(' ')).toThrow();expect(()=>modelRequest('password=demo')).toThrow();
  expect(()=>contract({unsupported:'需要访问内部服务'})).toThrow('需要访问内部服务');
});
test('验收样例必须绑定到真实控件，且不能重复',()=>{
  const one={action:'go',values:{raw:'1'},expect:'1'};
  const spec={title:'测试',description:'说明',fields:[{id:'raw',label:'输入'}],actions:[{id:'go',label:'执行'}],cases:[one,{...one,values:{raw:'2'},expect:'2'}]};
  expect(contract(spec).cases.length).toBe(2);
  expect(()=>contract({...spec,cases:[one,one]})).toThrow();
  expect(()=>contract({...spec,fields:[{id:'constructor',label:'输入'}]})).toThrow();
});
test('模型源码不持有宿主对象，死循环被中断且不污染下一次运行',async()=>{
  expect(await evaluateFeature('function run(){return [typeof process,typeof require,typeof fetch,typeof document].join(",")}',{},'')).toBe('undefined,undefined,undefined,undefined');
  await expect(evaluateFeature('function run(){while(true){}}',{},'')).rejects.toThrow();
  expect(await evaluateFeature('function run(v){return v.x.toUpperCase()}',{x:'hello'},'')).toBe('HELLO');
});

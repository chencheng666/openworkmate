import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import release from '@jitl/quickjs-singlefile-cjs-release-sync';

// 模型的源码只作为文本进入 WASM，不导入宿主模块，不提供任何宿主回调。
let engine;
export async function evaluateFeature(source, values, action) {
  if (typeof source !== 'string' || source.length>20000) throw Error('功能源码过长');
  const args=JSON.stringify([values,action]);
  if(args.length>50000) throw Error('输入过长');
  const variant=release.default || release;
  const wasm=await (engine ??= newQuickJSWASMModuleFromVariant(variant));
  const rt=wasm.newRuntime();
  rt.setMemoryLimit(8*1024*1024);rt.setMaxStackSize(256*1024);
  const until=Date.now()+350;rt.setInterruptHandler(()=>Date.now()>until);
  const vm=rt.newContext();
  try {
    const result=vm.evalCode('"use strict";\n'+source+'\n;run(...'+args+');','feature.js',{type:'global'});
    if(result.error){result.error.dispose();throw Error('功能执行失败或超时');}
    try{
      if(vm.typeof(result.value)!=='string') throw Error('功能必须返回文本');
      const out=vm.getString(result.value);
      if(out.length>32000)throw Error('结果过长');
      return out;
    }finally{result.value.dispose();}
  }finally{vm.dispose();rt.dispose();}
}

import {readFile} from 'node:fs/promises';
import {evaluateFeature} from '../../web-app/src/features/runtime.mjs';
const prefix=process.argv[2];
try{
  const spec=JSON.parse(await readFile(prefix+'.json','utf8')),src=await readFile(prefix+'.qjs','utf8');
  for(const [index,c] of spec.cases.entries()){
    const actual=await evaluateFeature(src,c.values,c.action);
    if(actual!==c.expect)throw Error(JSON.stringify({case:index+1,expect:c.expect.slice(0,260),actual:actual.slice(0,260)}));
  }
}catch(e){console.log(e.message);process.exitCode=1;}

import { evaluateFeature } from './runtime.mjs';
self.onmessage=async ({data})=>{
  try{self.postMessage({text:await evaluateFeature(data.source,data.values,data.action)});}
  catch(e){self.postMessage({error:e.message});}
};

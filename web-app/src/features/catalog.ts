export type Feature = {title:string;description:string;fields:{id:string;label:string;hint:string}[];actions:{id:string;label:string}[];cases:{values:Record<string,string>;action:string;expect:string}[]};
const manifests=import.meta.glob<Feature>('./generated/*.json',{import:'default',eager:true});
const sources=import.meta.glob<string>('./generated/*.qjs',{query:'?raw',import:'default',eager:true});
export const features=Object.entries(manifests).map(([path,spec])=>({spec,source:sources[path.replace(/\.json$/,'.qjs')],id:path.split('/').pop()!.split('.')[0]}));

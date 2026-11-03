import {build} from 'esbuild';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.env.RD_ROOT,rows=[];
for(const variant of ['base','notifier-reuse']){
 const src=`${root}/${variant}/src`, paths={react:src+'/react/index.ts','react-dom/server':src+'/server/index.ts'};
 const b=await build({entryPoints:[root+'/staggered-workload.ts'],bundle:true,write:false,platform:'node',format:'esm',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'renderer',setup(b){b.onResolve({filter:/^(react|react-dom\/server)$/},a=>({path:paths[a.path]}))}}]});
 const file=`${root}/reactions-${variant}.mjs`;fs.writeFileSync(file,b.outputFiles[0].text);const mod=await import(pathToFileURL(file));
 for(const width of [8,32,128,512]){
  let calls=0;const original=Promise.prototype.then;
  Promise.prototype.then=function(...args){calls++;return Reflect.apply(original,this,args)};
  let result;try{result=await mod.run(`staggered-${width}`,1)}finally{Promise.prototype.then=original}
  rows.push({variant,width,thenCalls:calls,completed:result.completed,bytes:result.totalBytes,chunks:result.totalChunks});
 }
}
fs.writeFileSync(root+'/reaction-counts.json',JSON.stringify(rows,null,2));console.log(rows);

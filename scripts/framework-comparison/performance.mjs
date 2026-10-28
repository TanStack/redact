import {readFileSync,writeFileSync,cpSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import os from 'node:os';
const base=resolve(process.env.MATRIX_ROOT||'/tmp/redact-framework-matrix');
const load=p=>import(pathToFileURL(resolve(base,'node_modules',p)));
const {build}=await load('vite/dist/node/index.js');
const {chromium}=await load('playwright/index.mjs');
const {default:preact}=await load('@preact/preset-vite/dist/esm/index.mjs');
const {redact}=await load('@tanstack/redact/dist/vite/index.js');
const runtimes=['react','redact','preact'], workloads=['mount','props','state','reorder','insert-remove'];
const bundles={},sizes={};
cpSync(new URL('./performance-entry.js',import.meta.url),resolve(base,'performance-entry.js'));
for(const runtime of runtimes){
 const output=await build({root:base,configFile:false,logLevel:'silent',plugins:runtime==='preact'?[preact()]:runtime==='redact'?[redact({resolveFrom:base})]:[],define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:resolve(base,'performance-entry.js'),formats:['iife'],name:'Performance'}}});
 bundles[runtime]=[output].flat().flatMap(b=>b.output).find(f=>f.type==='chunk').code;
 sizes[runtime]=gzipSync(bundles[runtime]).length;
}
const result={versions:{react:'19.3.1',redact:'0.2.1',preact:'11.1.0'},machine:os.cpus()[0].model,node:process.version,date:new Date().toISOString(),sizes,iterations:200,blocks:7,samples:[]};
const out=resolve(process.env.PERFORMANCE_OUT||'benchmarks/results/framework-comparison/performance.json');
for(let block=0;block<7;block++){
 const browser=await chromium.launch({headless:true});result.browser=browser.version();
 try{for(let j=0;j<3;j++){
 const runtime=runtimes[(block+j)%3],page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<!doctype html><html><body></body></html>');await page.addScriptTag({content:bundles[runtime]});
 for(const workload of workloads){const ms=await page.evaluate(({workload})=>globalThis.measure(workload,200),{workload});result.samples.push({block,runtime,workload,ms});}
 if(errors.length)throw Error(errors.join('\n'));await page.close();
 }}finally{await browser.close()}
 writeFileSync(out,JSON.stringify(result,null,2));console.log(`Finished block ${block+1}/7`);
}
const median=a=>a.toSorted((a,b)=>a-b)[Math.floor(a.length/2)];
result.medians=Object.fromEntries(workloads.map(w=>[w,Object.fromEntries(runtimes.map(r=>[r,median(result.samples.filter(s=>s.workload===w&&s.runtime===r).map(s=>s.ms))]))]));
result.scores=Object.fromEntries(runtimes.map(r=>[r,100*Math.exp(workloads.reduce((sum,w)=>sum+Math.log(result.medians[w].react/result.medians[w][r]),0)/workloads.length)]));
writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({sizes,medians:result.medians,scores:result.scores},null,2));

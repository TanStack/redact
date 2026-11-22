import {createElement as h,createContext,useContext,Suspense} from 'react'
import {renderToString,renderToReadableStream} from 'react-dom/server'
const contexts=Array.from({length:12},(_,i)=>createContext('default'+i)),pending=new Promise(()=>{}),encoder=new TextEncoder()
function Leaf(){return h('span',null,contexts.map(c=>useContext(c)).join(':'))}
function providers(child:any,i:number){for(let k=0;k<12;k++)child=h(Suspense,{fallback:"nested wait"},child);for(let d=contexts.length-1;d>=0;d--)child=h(contexts[d].Provider,{value:i+':'+d},child);return child}
function Wait(){throw pending}
const ready=h('main',null,Array.from({length:32},(_,i)=>providers(h(Suspense,{fallback:'wait'},h(Leaf)),i)))
const fallback=h('main',null,Array.from({length:32},(_,i)=>providers(h(Suspense,{fallback:h(Leaf)},h(Wait)),i)))
async function consume(stream:any){const reader=stream.getReader(),decoder=new TextDecoder();let html='',chunks=0,bytes=0;for(;;){const r=await reader.read();if(r.done)break;chunks++;bytes+=r.value.length;html+=decoder.decode(r.value,{stream:true})}html+=decoder.decode();await stream.allReady;return {html,chunks,bytes}}
export async function run(name:string,iterations:number){let totalBytes=0,totalChunks=0,html='',completed=0;const start=performance.now();for(let n=0;n<iterations;n++){
 if(name==='string-ready'||name==='string-fallback'){html=renderToString(name==='string-ready'?ready:fallback);totalBytes+=encoder.encode(html).length}
 else if(name==='stream-ready'){const r=await consume(await renderToReadableStream(ready));html=r.html;totalBytes+=r.bytes;totalChunks+=r.chunks}
 else if(name==='stream-delayed'){let done=false,release!:()=>void;const p=new Promise<void>(r=>release=()=>{done=true;r()});function Child(){if(!done)throw p;return h(Leaf)}const tree=h('main',null,Array.from({length:32},(_,i)=>providers(h(Suspense,{fallback:'wait'},h(Child)),i)));const stream=await renderToReadableStream(tree);const all=consume(stream);release();const r=await all;html=r.html;totalBytes+=r.bytes;totalChunks+=r.chunks}
 else if(name==='root-retry'){let done=false;const p=Promise.resolve().then(()=>{done=true});function Root(){if(!done)throw p;return ready}const r=await consume(await renderToReadableStream(h(Root)));html=r.html;totalBytes+=r.bytes;totalChunks+=r.chunks}
 else throw Error(name);completed++;
 }return {ms:performance.now()-start,completed,totalBytes,totalChunks,html}}
(globalThis as any).runRope=run

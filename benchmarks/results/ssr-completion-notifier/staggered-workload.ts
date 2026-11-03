import {createElement as h,Suspense} from 'react'
import {renderToReadableStream} from 'react-dom/server'
export async function run(name:string,iterations:number){const width=Number(name.split('-')[1]);let totalBytes=0,totalChunks=0,html='',completed=0;const start=performance.now();for(let n=0;n<iterations;n++){
 const ready=Array(width).fill(false),release:Array<()=>void>=[]
 const promises=Array.from({length:width},(_,i)=>new Promise<void>(resolve=>{release[i]=()=>{ready[i]=true;resolve()}}))
 function Child({i}:{i:number}){if(!ready[i])throw promises[i];return h('b',null,'child'+i)}
 const stream=await renderToReadableStream(h('main',null,Array.from({length:width},(_,i)=>h(Suspense,{fallback:'wait'},h(Child,{i})))))
 const reader=stream.getReader(),decoder=new TextDecoder();html=''
 async function read(){const part=await reader.read();if(part.done)return false;totalChunks++;totalBytes+=part.value.length;html+=decoder.decode(part.value,{stream:true});return true}
 await read()
 for(let i=0;i<width;i++){release[i]!();while(!html.includes('id="S:'+i+'"'))if(!await read())throw Error('early end')}
 while(await read()){}html+=decoder.decode();await stream.allReady;completed++
 }return{ms:performance.now()-start,completed,totalBytes,totalChunks,html}}

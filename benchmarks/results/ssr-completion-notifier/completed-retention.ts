import {createElement as h,Suspense} from 'react'
import {renderToReadableStream} from 'react-dom/server'
export async function create(){
 const payload={data:Array.from({length:10000},(_,i)=>i)},weak=new WeakRef(payload)
 let ready=false,release!:()=>void
 const promise=new Promise<void>(resolve=>{release=()=>{ready=true;resolve()}})
 function Child(){if(!ready)throw promise;return h('b',null,payload.data[1])}
 const stream=await renderToReadableStream(h(Suspense,{fallback:'wait'},h(Child)))
 const text=new Response(stream).text();release();await text;await stream.allReady
 return {stream,weak}
}

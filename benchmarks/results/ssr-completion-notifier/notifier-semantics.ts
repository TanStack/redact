import {createElement as h, Suspense} from 'react'
import {renderToReadableStream,renderToString,renderToPipeableStream} from 'react-dom/server'
export async function check(mode:string){
 const events:string[]=[],controller=new AbortController(),ready=[false,false],failed=[false,false],release:Array<()=>void>=[]
 const promises=[0,1].map(i=>new Promise<void>(resolve=>{release[i]=()=>{ready[i]=true;resolve()}}))
 function Child({i}:{i:number}){if(!ready[i])throw promises[i];if(failed[i])throw Error('failure'+i);return h('b',null,'child'+i)}
 const stream=await renderToReadableStream(h('main',null,...[0,1].map(i=>h(Suspense,{fallback:'wait'+i},h(Child,{i})))),{signal:controller.signal,onError(error:any){events.push('error:'+error.message);events.push('nested:'+renderToString(h('i',null,'nested')))}})
 const reader=stream.getReader(),decoder=new TextDecoder();let html='';const read=async()=>{const part=await reader.read();if(part.done)return false;html+=decoder.decode(part.value,{stream:true});return true}
 await read();events.push('shell')
 const draining=(async()=>{try{while(await read()){}events.push('end')}catch(e:any){events.push('reader:'+e.message)}})()
 const settled=stream.allReady.then(()=>events.push('ready'),(e:any)=>events.push('ready-error:'+e.message))
 if(mode==='abort'){controller.abort(Error('stop'));await settled;release[0]!();release[1]!()}
 else if(mode==='reject'){failed[0]=true;release[0]!();while(!events.some(e=>e==='error:failure0'))await Promise.resolve();events.push('release-sibling');release[1]!()}
 else if(mode==='both-errors'){failed.fill(true);release[0]!();release[1]!()}
 else {release[1]!();while(!html.includes('child1'))await Promise.resolve();events.push('release-first');release[0]!()}
 await draining;await settled;return {mode,events,html}
}

export async function checkPipe(){
 const {renderToPipeableStream}=await import('react-dom/server')
 const events:string[]=[],ready=[false,false],release:Array<()=>void>=[]
 const promises=[0,1].map(i=>new Promise<void>(resolve=>{release[i]=()=>{ready[i]=true;resolve()}}))
 function Child({i}:{i:number}){if(!ready[i])throw promises[i];return h('b',null,'child'+i)}
 await new Promise<void>((resolve,reject)=>{
  const handle=renderToPipeableStream(h('main',null,...[0,1].map(i=>h(Suspense,{fallback:'wait'},h(Child,{i})))),{
   onError(error:any){events.push('error:'+error.message)},
   onShellError:reject,
   onAllReady(){events.push('allReady')},
   onShellReady(){events.push('shell');handle.pipe({
    write(chunk){const text=String(chunk);events.push(text.includes('<div hidden')?'reveal':'write');if(text.includes('<div hidden'))throw Error('sink failed')},
    end(){events.push('end');resolve()},
    destroy(error:any){events.push('destroy:'+error.message);resolve()},
   });release[0]!();release[1]!()},
  })
 })
 await Promise.resolve();return events
}

export async function run(gap:number){
 const events:string[]=[],ready=[false,false];let release:Array<()=>void>=[];
 const ps=[0,1].map(i=>new Promise<void>(r=>{release[i]=()=>{ready[i]=true;r()}}));
 function Child({i}:{i:number}){if(!ready[i])throw ps[i];return h('b',null,'child'+i)}
 await new Promise<void>((resolve,reject)=>{
 const handle=renderToPipeableStream(h('main',null,...[0,1].map(i=>h(Suspense,{fallback:'wait'},h(Child,{i})))),{
 onError(e:any){events.push('error:'+e.message)},onShellError:reject,onAllReady(){events.push('ready')},
 onShellReady(){handle.pipe({write(chunk){const text=String(chunk);if(text.includes('<div hidden')){events.push(text.includes('child1')?'second':'first');if(text.includes('child1'))throw Error('second sink failed')}},end(){events.push('end');resolve()},destroy(e:any){events.push('destroy:'+e.message);resolve()}});release[0]!();let p=Promise.resolve();for(let i=0;i<gap;i++)p=p.then(()=>{});p.then(()=>release[1]!())}
 })});await Promise.resolve();return events;
}

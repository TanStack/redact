import {createElement as h,Suspense} from 'react'
import {renderToPipeableStream} from 'react-dom/server'
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

import {createElement as h,Suspense} from 'react'
import {renderToPipeableStream} from 'react-dom/server'
export async function create(gap:number){
 const events:string[]=[],ready=[false,false],weak:WeakRef<Error>[]=[],release:Array<()=>void>=[];
 const ps=[0,1].map(i=>new Promise<void>(r=>{release[i]=()=>{ready[i]=true;r()}}));
 function Child({i}:{i:number}){if(!ready[i])throw ps[i];return h('b',null,'child'+i)}
 let handle:ReturnType<typeof renderToPipeableStream>;
 await new Promise<void>((resolve,reject)=>{handle=renderToPipeableStream(h('main',null,...[0,1].map(i=>h(Suspense,{fallback:'wait'},h(Child,{i})))),{
  onError(error:any){events.push('error:'+error.message)},onShellError:reject,
  onShellReady(){handle.pipe({write(chunk){if(String(chunk).includes('<div hidden')){const error=Object.assign(Error('sink'+weak.length),{[Symbol.for('react.recoverable')]:true,payload:Array.from({length:10000},(_,i)=>i)});weak.push(new WeakRef(error));throw error}},end(){events.push('end');resolve()},destroy(error:any){events.push('destroy:'+error.message);resolve()}});release[0]!();let p=Promise.resolve();for(let i=0;i<gap;i++)p=p.then(()=>{});p.then(()=>release[1]!())}
 })});return {handle:handle!,weak,events}
}

import {expect,it} from 'vitest'
import * as React from 'react'
import {createRoot,hydrateRoot} from 'react-dom/client'
import {renderToString} from 'react-dom/server'
import {flushSync} from 'react-dom'
import {CompilerCounter} from './fixtures/react-compiler/generated.jsx'
const tick=()=>new Promise(resolve=>setTimeout(resolve,20))
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve,ready:false}}
function Gate({gate}:{gate:ReturnType<typeof deferred>}){if(!gate.ready)throw gate.promise;return null}
const view=(label:string,gate?:ReturnType<typeof deferred>)=><React.Suspense fallback={<i>waiting</i>}><CompilerCounter label={label}/>{gate&&<Gate gate={gate}/>}</React.Suspense>
it('retries a suspended root transition without losing an intervening urgent state update',async()=>{
 const host=document.createElement('div'),root=createRoot(host),gate=deferred()
 try{flushSync(()=>root.render(view('old')));React.startTransition(()=>root.render(view('new',gate)));await tick();expect(host.textContent).toBe('OLD0');flushSync(()=>host.querySelector('button')!.click());expect(host.textContent).toBe('OLD1');gate.ready=true;gate.resolve();await tick();expect(host.textContent).toBe('NEW1');flushSync(()=>host.querySelector('button')!.click());expect(host.textContent).toBe('NEW2')}finally{flushSync(()=>root.unmount());gate.resolve()}
})
it('keeps a newer root transition when an older promise resolves later',async()=>{
 const host=document.createElement('div'),root=createRoot(host),a=deferred(),b=deferred()
 try{flushSync(()=>root.render(view('old')));React.startTransition(()=>root.render(view('a',a)));await tick();React.startTransition(()=>root.render(view('b',b)));await tick();b.ready=true;b.resolve();await tick();expect(host.textContent).toBe('B0');a.ready=true;a.resolve();await tick();expect(host.textContent).toBe('B0')}finally{flushSync(()=>root.unmount());a.resolve();b.resolve()}
})
it('does not resurrect an unmounted root when its transition resolves',async()=>{
 const host=document.createElement('div'),root=createRoot(host),gate=deferred()
 flushSync(()=>root.render(view('old')));React.startTransition(()=>root.render(view('new',gate)));await tick();flushSync(()=>root.unmount());gate.ready=true;gate.resolve();await tick();expect(host.innerHTML).toBe('')
})
it('does not keep an unrelated root useTransition pending',async()=>{
 const owner=document.createElement('div'),host=document.createElement('div'),a=createRoot(owner),b=createRoot(host),gate=deferred();let start!:(fn:()=>void)=>void
 function Owner(){const [pending,run]=React.useTransition();start=run;return <b>{String(pending)}</b>}
 try{flushSync(()=>{a.render(<Owner/>);b.render(view('old'))});start(()=>b.render(view('new',gate)));await tick();expect(owner.textContent).toBe('false');expect(host.textContent).toBe('OLD0');gate.ready=true;gate.resolve();await tick();expect(host.textContent).toBe('NEW0');expect(owner.textContent).toBe('false')}finally{flushSync(()=>{a.unmount();b.unmount()});gate.resolve()}
})
it('keeps useTransition pending for a suspended render of its own root',async()=>{
 const host=document.createElement('div'),root=createRoot(host),gate=deferred();let start!:(fn:()=>void)=>void
 function Owner(){const [pending,run]=React.useTransition();start=run;return <b>{String(pending)}</b>}
 const tree=(label:string,g?:ReturnType<typeof deferred>)=><><Owner/>{view(label,g)}</>
 try{flushSync(()=>root.render(tree('old')));start(()=>root.render(tree('new',gate)));await tick();expect(host.textContent).toBe('trueOLD0');gate.ready=true;gate.resolve();await tick();expect(host.textContent).toBe('falseNEW0')}finally{flushSync(()=>root.unmount());gate.ready=true;gate.resolve()}
})
it('inherits useTransition ownership through a nested startTransition',async()=>{
 const host=document.createElement('div'),root=createRoot(host),gate=deferred();let start!:(fn:()=>void)=>void
 function Owner(){const [pending,run]=React.useTransition();start=run;return <b>{String(pending)}</b>}
 const tree=(label:string,g?:ReturnType<typeof deferred>)=><><Owner/>{view(label,g)}</>
 try{flushSync(()=>root.render(tree('old')));start(()=>React.startTransition(()=>root.render(tree('new',gate))));await tick();expect(host.textContent).toBe('trueOLD0');gate.ready=true;gate.resolve();await tick();expect(host.textContent).toBe('falseNEW0')}finally{flushSync(()=>root.unmount());gate.ready=true;gate.resolve()}
})

it('cancels suspended renders when a hydrated root unmounts',async()=>{
 const host=document.createElement('div'),gate=deferred();host.innerHTML=renderToString(view('old'));const original=host.querySelector('button');const root=hydrateRoot(host,view('old'));await tick();expect(host.querySelector('button')).toBe(original);React.startTransition(()=>root.render(view('new',gate)));await tick();expect(host.textContent).toBe('OLD0');expect(host.querySelector('button')).toBe(original);flushSync(()=>root.unmount());const afterUnmount=host.innerHTML;expect(host.textContent).toBe('');expect(host.querySelector('button')).toBeNull();gate.ready=true;gate.resolve();await tick();expect(host.innerHTML).toBe(afterUnmount)
})

it('commits an urgent root render before a later suspended transition in the same flush',async()=>{
 const host=document.createElement('div'),root=createRoot(host),gate=deferred();try{flushSync(()=>root.render(view('old')));flushSync(()=>{root.render(view('intermediate'));React.startTransition(()=>root.render(view('new',gate)))});await tick();expect(host.textContent).toBe('INTERMEDIATE0');gate.ready=true;gate.resolve();await tick();expect(host.textContent).toBe('NEW0')}finally{flushSync(()=>root.unmount());gate.ready=true;gate.resolve()}
})

for(const stateFirst of [true,false]) it(`keeps pending urgent when state and root updates share a scope (${stateFirst})`,async()=>{
 const host=document.createElement('div'),root=createRoot(host),gate=deferred();let start!:(fn:()=>void)=>void,set!:React.Dispatch<React.SetStateAction<number>>
 function Owner(){const[pending,run]=React.useTransition();const[n,s]=React.useState(0);start=run;set=s;return <b>{String(pending)}:{n}</b>}
 const tree=(label:string,g?:ReturnType<typeof deferred>)=><><Owner/>{view(label,g)}</>
 try{flushSync(()=>root.render(tree('old')));start(()=>{if(stateFirst)set(n=>n+1);root.render(tree('new',gate));if(!stateFirst)set(n=>n+1)});await tick();expect(host.textContent).toBe('true:0OLD0');gate.ready=true;gate.resolve();await tick();expect(host.textContent).toBe('false:1NEW0')}finally{flushSync(()=>root.unmount());gate.ready=true;gate.resolve()}
})

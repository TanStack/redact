import {afterEach, expect, it} from 'vitest'
import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
const cleanup: Array<() => void> = []
afterEach(() => {for(const fn of cleanup.splice(0))fn()})
function setup() {const container=document.body.appendChild(document.createElement('div'));const errors:unknown[]=[];const root=createRoot(container,{onUncaughtError:e=>errors.push(e)});cleanup.push(()=>{flushSync(()=>root.unmount());container.remove()});return{container,errors,render:(node:React.ReactNode)=>flushSync(()=>root.render(node))}}
function store<T>(initial:T){let value=initial;const listeners=new Set<()=>void>();return{get:()=>value,set:(next:T)=>{value=next},emit:()=>{listeners.forEach(l=>l())},subscribe:(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l)}}}}
const settle=()=>new Promise(resolve=>setTimeout(resolve,500))
it('130 retries a suspended external store subscriber behind an unchanged memo',async()=>{
 const s=store<string|null>(null);let resolve!:(value:string)=>void;const pending=new Promise<string>(r=>{resolve=r});const{container,errors,render}=setup()
 function Account(){const value=React.useSyncExternalStore(s.subscribe,s.get);return <p>{value?`${value}: ${React.use(pending)}`:'logged out'}</p>}
 const Wrapper=React.memo(()=> <Account/>);render(<React.Suspense fallback="loading"><Wrapper/></React.Suspense>);expect(container.textContent).toBe('logged out')
 flushSync(()=>{s.set('alice');s.emit()});resolve('orders');await settle();expect(errors).toEqual([]);expect(container.textContent).toBe('alice: orders')
})
for(const nested of [false,true])for(const transition of [false,true])for(const order of ['parent-first','child-first'])it(`129 avoids stale props during suspended store batch ${order}, nested=${nested}, transition=${transition}`,async()=>{
 const page=store('a');const items:{[key:string]:ReturnType<typeof store<{label:string}|undefined>>}={a:store<{label:string}|undefined>({label:'A'}),b:store<{label:string}|undefined>({label:'B'})}
 let resolve!:(value:string)=>void;const pending=new Promise<string>(r=>{resolve=r});const{container,errors,render}=setup()
 function Item({id}:{id:string}){const item=React.useSyncExternalStore(items[id]!.subscribe,items[id]!.get);return <p>{item!.label} {id==='b'?React.use(pending):null}</p>}
 function Page(){const id=React.useSyncExternalStore(page.subscribe,page.get);return <Item id={id}/>}
 const view=<React.Suspense fallback="loading"><Page/></React.Suspense>;render(nested?<React.Suspense fallback="outer">{view}</React.Suspense>:view);expect(container.textContent?.trim()).toBe('A')
 const notify=()=>{page.set('b');items.a!.set(undefined);if(order==='parent-first'){page.emit();items.a!.emit()}else{items.a!.emit();page.emit()}};flushSync(()=>{if(transition)React.startTransition(notify);else notify()})
 resolve('loaded');await settle();expect(errors).toEqual([]);expect(container.textContent).toBe('B loaded')
})

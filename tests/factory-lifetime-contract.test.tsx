import {it,expect,vi} from 'vitest'
import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'

it('drops captured sibling work after the queued parent enters an error fallback',()=>{
 const container=document.body.appendChild(document.createElement('div')),log:string[]=[],errors:string[]=[]
 const root=createRoot(container,{onCaughtError:error=>errors.push(error instanceof Error?error.message:String(error))})
 let a!:()=>void,b!:()=>void,fail!:()=>void,retry!:()=>void
 class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false}
  static getDerivedStateFromError(){return{failed:true}}
  render(){return this.state.failed?<Fallback/>:this.props.children}
 }
 function Fallback(){React.useLayoutEffect(()=>{log.push('fallback')});return <i>caught</i>}
 function Child({name}:{name:string}){const[value,setValue]=React.useState(0);if(name==='a')a=()=>setValue(n=>n+1);else b=()=>setValue(n=>n+1);React.useLayoutEffect(()=>{log.push(name+value)});return <span>{name}{value}</span>}
 function Bomb({bad}:{bad:boolean}){if(bad)throw new Error('queued failure');return null}
 function Parent(){const[bad,setBad]=React.useState(false),[epoch,setEpoch]=React.useState(0);fail=()=>setBad(true);retry=()=>{setBad(false);setEpoch(n=>n+1)};const first=React.useMemo(()=><Child name="a"/>,[]),second=React.useMemo(()=><Child name="b"/>,[]);React.useLayoutEffect(()=>{log.push('parent'+(bad?1:epoch?2:0))});return <Boundary key={epoch}>{first}<Bomb bad={bad}/>{second}</Boundary>}
 try{
  flushSync(()=>root.render(<Parent/>));expect(container.textContent).toBe('a0b0');log.length=0
  const oldA=a,oldB=b
  flushSync(()=>{b();a();fail()})
  expect(container.textContent).toBe('caught');expect(errors).toEqual(['queued failure']);expect(log).toEqual(['fallback','parent1'])
  log.length=0;flushSync(()=>{oldA();oldB()});expect(container.textContent).toBe('caught');expect(log).toEqual([])
  flushSync(retry);expect(container.textContent).toBe('a0b0');expect(log).toEqual(['a0','b0','parent2'])
 }finally{flushSync(()=>root.unmount());container.remove()}
})

it('retains captured primary updates across a suspended parent batch and later retry',async()=>{
 const container=document.body.appendChild(document.createElement('div')),log:string[]=[],errors:unknown[]=[]
 const root=createRoot(container,{onUncaughtError:error=>errors.push(error)})
 let a!:()=>void,b!:()=>void,parent!:()=>void,ready=false,release!:()=>void
 const pending=new Promise<void>(resolve=>{release=()=>{ready=true;resolve()}})
 function A(){const[value,setValue]=React.useState(0);a=()=>setValue(n=>n+1);if(value===1&&!ready)throw pending;React.useLayoutEffect(()=>{log.push('a'+value)});return <span data-a="">a{value}</span>}
 function B(){const[value,setValue]=React.useState(0);b=()=>setValue(n=>n+1);React.useLayoutEffect(()=>{log.push('b'+value)});return <span data-b="">b{value}</span>}
 function Fallback(){React.useLayoutEffect(()=>{log.push('fallback')});return <i data-fallback="">loading</i>}
 function Wrapper(){return <React.Suspense fallback={<Fallback/>}><section data-primary=""><A/><B/></section></React.Suspense>}
 function Parent(){const[tick,setTick]=React.useState(0);parent=()=>setTick(n=>n+1);const child=React.useMemo(()=><Wrapper/>,[]);React.useLayoutEffect(()=>{log.push('parent'+tick)});return child}
 try{
  flushSync(()=>root.render(<Parent/>));const primary=container.querySelector<HTMLElement>('[data-primary]')!,oldA=container.querySelector('[data-a]'),oldB=container.querySelector('[data-b]');log.length=0
  flushSync(()=>{b();a();parent()})
  if(!container.querySelector('[data-fallback]'))throw new Error('Missing fallback '+JSON.stringify({html:container.innerHTML,log,errors:errors.map(String)}));
  expect(container.querySelector('[data-fallback]')?.textContent).toBe('loading');expect(primary.style.display).toBe('none');expect(log).toEqual(['fallback','parent1'])
  release();await vi.waitFor(()=>expect(container.querySelector('[data-fallback]')).toBeNull())
  expect(container.querySelector('[data-primary]')).toBe(primary);expect(primary.style.display).toBe('');expect(container.querySelector('[data-a]')).toBe(oldA);expect(container.querySelector('[data-b]')).toBe(oldB);expect(primary.textContent).toBe('a1b1');expect(errors).toEqual([])
 }finally{release();flushSync(()=>root.unmount());container.remove()}
})

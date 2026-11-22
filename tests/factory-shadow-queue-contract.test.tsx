import {it,expect} from 'vitest'
import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'

it('visits captured sibling work in tree order even when queued in reverse order',()=>{
 const container=document.body.appendChild(document.createElement('div')),root=createRoot(container),log:string[]=[]
 let parent!:()=>void,a!:()=>void,b!:()=>void
 function Child({name}:{name:string}){
  const[value,setValue]=React.useState(0)
  if(name==='a')a=()=>setValue(n=>n+1);else b=()=>setValue(n=>n+1)
  React.useLayoutEffect(()=>{log.push(name+value)})
  return <span>{name}{value}</span>
 }
 function Wrapper(){return <><Child name="a"/><Child name="b"/></>}
 function Parent(){const[tick,setTick]=React.useState(0);parent=()=>setTick(n=>n+1);const child=React.useMemo(()=><Wrapper/>,[]);React.useLayoutEffect(()=>{log.push('parent'+tick)});return child}
 try{
  flushSync(()=>root.render(<Parent/>));log.length=0
  flushSync(()=>{b();a();parent()})
  expect(container.textContent).toBe('a1b1');expect(log).toEqual(['a1','b1','parent1'])
 }finally{flushSync(()=>root.unmount());container.remove()}
})

it('does not visit captured descendant work removed by its queued parent',()=>{
 const container=document.body.appendChild(document.createElement('div')),root=createRoot(container)
 let hide!:()=>void,update!:()=>void,renders=0
 function Child(){renders++;const[value,setValue]=React.useState(0);update=()=>setValue(n=>n+1);return <p>{value}</p>}
 function Wrapper(){return <Child/>}
 function Parent(){const[visible,setVisible]=React.useState(true);hide=()=>setVisible(false);const child=React.useMemo(()=><Wrapper/>,[]);return visible?child:null}
 try{
  flushSync(()=>root.render(<Parent/>))
  flushSync(()=>{update();hide()})
  expect(container.textContent).toBe('');expect(renders).toBe(1)
 }finally{flushSync(()=>root.unmount());container.remove()}
})

it('runs pending visible fallback layout before a cached ancestor layout',()=>{
 const container=document.body.appendChild(document.createElement('div')),root=createRoot(container),log:string[]=[]
 const pending=new Promise<void>(()=>{})
 let parent!:()=>void,update!:()=>void
 function Pending(){throw pending}
 function Fallback(){const[value,setValue]=React.useState(0);update=()=>setValue(n=>n+1);React.useLayoutEffect(()=>{log.push('fallback'+value)});return <i>{value}</i>}
 function Wrapper(){return <React.Suspense fallback={<Fallback/>}><Pending/></React.Suspense>}
 function Parent(){const[tick,setTick]=React.useState(0);parent=()=>setTick(n=>n+1);const child=React.useMemo(()=><Wrapper/>,[]);React.useLayoutEffect(()=>{log.push('parent'+tick)});return child}
 try{
  flushSync(()=>root.render(<Parent/>));log.length=0
  flushSync(()=>{update();parent()})
  expect(container.textContent).toBe('1');expect(log).toEqual(['fallback1','parent1'])
 }finally{flushSync(()=>root.unmount());container.remove()}
})

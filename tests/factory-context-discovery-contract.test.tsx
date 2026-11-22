import {it,expect} from 'vitest'
import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'

for(const shared of [false,true])it(`preserves simultaneous nested provider changes, shared context=${shared}`,()=>{
 const A=React.createContext('a-default'),B=shared?A:React.createContext('b-default')
 const container=document.body.appendChild(document.createElement('div')),root=createRoot(container)
 let update!:()=>void,wrappers=0,aReads=0,bReads=0
 function Reader({context,name}:{context:React.Context<string>,name:string}){if(name==='a')aReads++;else bReads++;return <span>{React.useContext(context)}</span>}
 function Wrapper(){wrappers++;return <Reader context={B} name="b"/>}
 function Parent(){const[tick,setTick]=React.useState(0);update=()=>setTick(n=>n+1);const outer=React.useMemo(()=><Reader context={A} name="a"/>,[]),inner=React.useMemo(()=><Wrapper/>,[]);return <A.Provider value={'a'+tick}>{outer}<B.Provider value={'b'+tick}>{inner}</B.Provider></A.Provider>}
 try{flushSync(()=>root.render(<Parent/>));expect(container.textContent).toBe('a0b0');flushSync(update);expect(container.textContent).toBe('a1b1');expect([wrappers,aReads,bReads]).toEqual([1,2,2])}
 finally{flushSync(()=>root.unmount());container.remove()}
})

it('restores provider scope after a caught render error and a later retry',()=>{
 const Context=React.createContext('default'),errors:string[]=[]
 const container=document.body.appendChild(document.createElement('div')),root=createRoot(container,{onCaughtError:error=>errors.push(error instanceof Error?error.message:String(error))})
 let change!:(value:string)=>void,retry!:()=>void
 class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false}
  static getDerivedStateFromError(){return{failed:true}}
  render(){return this.state.failed?<i>caught</i>:this.props.children}
 }
 function Reader(){const value=React.useContext(Context);if(value==='bad')throw new Error('provider failed');return <p>{value}</p>}
 function Wrapper(){return <Reader/>}
 function App(){const[value,setValue]=React.useState('first'),[epoch,setEpoch]=React.useState(0);change=setValue;retry=()=>setEpoch(n=>n+1);const child=React.useMemo(()=><Wrapper/>,[]);return <Boundary key={epoch}><Context.Provider value={value}>{child}</Context.Provider></Boundary>}
 try{flushSync(()=>root.render(<App/>));flushSync(()=>change('bad'));expect(container.textContent).toBe('caught');expect(errors).toEqual(['provider failed']);flushSync(()=>{change('second');retry()});expect(container.textContent).toBe('second');flushSync(()=>change('third'));expect(container.textContent).toBe('third')}
 finally{flushSync(()=>root.unmount());container.remove()}
})

import {afterEach, expect, it} from 'vitest'
import {createElement as h} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
const cleanups:Array<()=>void>=[]
afterEach(()=>{for(const cleanup of cleanups.splice(0))cleanup()})
it.each([false,null])('preserves an unkeyed sibling after an empty position: %s',empty=>{
 const container=document.createElement('div'),root=createRoot(container)
 cleanups.push(()=>flushSync(()=>root.unmount()))
 const render=(show:boolean)=>flushSync(()=>root.render(h('main',null,show?h('div',null,'inserted'):empty,h('div',null,h('input',{'aria-label':'Field'})))))
 render(false);const field=container.querySelector('input')!;field.value='typed'
 render(true);expect(container.querySelector('input')).toBe(field);expect(field.value).toBe('typed')
 render(false);expect(container.querySelector('input')).toBe(field);expect(field.value).toBe('typed')
})
it('keeps the existing explicitly keyed control stable',()=>{
 const container=document.createElement('div'),root=createRoot(container)
 cleanups.push(()=>flushSync(()=>root.unmount()))
 const render=(show:boolean)=>flushSync(()=>root.render(h('main',null,show&&h('div',{key:'inserted'},'inserted'),h('div',null,h('input')))))
 render(false);const field=container.querySelector('input')!;field.value='typed';render(true);expect(container.querySelector('input')).toBe(field);render(false);expect(container.querySelector('input')).toBe(field);expect(field.value).toBe('typed')
})

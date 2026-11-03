import {afterEach,expect,it} from 'vitest'
import {createElement as h} from '@tanstack/redact'
import {createRoot} from '@tanstack/redact/dom-client'
import {act} from '@tanstack/redact/dom-test-utils'
let root: ReturnType<typeof createRoot> | undefined
afterEach(async()=>{await act(()=>root?.unmount());document.body.innerHTML=''})
it('keeps propagation/default state and a stable target after native dispatch',async()=>{
 const container=document.createElement('div');document.body.append(container);root=createRoot(container)
 let held:any;let before:any;let after:any;let parents=0
 await act(()=>root!.render(h('div',{onClick:()=>parents++},h('button',{onClick:(event:any)=>{
  held=event;before=[event.isPropagationStopped(),event.isDefaultPrevented()]
  event.stopPropagation();event.preventDefault();after=[event.isPropagationStopped(),event.isDefaultPrevented()]
 }},'click'))))
 const button=container.querySelector('button')!;const native=new MouseEvent('click',{bubbles:true,cancelable:true})
 await act(()=>button.dispatchEvent(native))
 expect(before).toEqual([false,false]);expect(after).toEqual([true,true]);expect(parents).toBe(0)
 expect(held.nativeEvent).toBe(native);expect(held.target).toBe(button);expect(held.currentTarget).toBeNull()
 expect(held.isPropagationStopped()).toBe(true);expect(held.isDefaultPrevented()).toBe(true)
})
it('creates independent synthetic state when the same native event is dispatched again',async()=>{
 const container=document.createElement('div');document.body.append(container);root=createRoot(container);const events:any[]=[]
 await act(()=>root!.render(h('button',{onClick:(event:any)=>{events.push(event);if(events.length===1)event.stopPropagation()}},'click')))
 const native=new MouseEvent('click',{bubbles:true});const button=container.querySelector('button')!
 await act(()=>button.dispatchEvent(native));await act(()=>button.dispatchEvent(native))
 expect(events[0]).not.toBe(events[1]);expect(events[0].isPropagationStopped()).toBe(true);expect(events[1].isPropagationStopped()).toBe(false)
})

it('retains the original target when a native event is reused on another element',async()=>{
 const container=document.createElement('div');document.body.append(container);root=createRoot(container);const events:any[]=[]
 await act(()=>root!.render(h('div',null,...['first','second'].map(label=>h('button',{onClick:(event:any)=>events.push(event)},label)))))
 const buttons=container.querySelectorAll('button');const native=new MouseEvent('click',{bubbles:true})
 await act(()=>buttons[0]!.dispatchEvent(native));await act(()=>buttons[1]!.dispatchEvent(native))
 expect(events.map(event=>event.target)).toEqual([...buttons]);expect(events.every(event=>event.currentTarget===null)).toBe(true)
})
it('binds native keyboard methods and carries capture prevention into bubbling',async()=>{
 const container=document.createElement('div');document.body.append(container);root=createRoot(container);let held:any;let during:any
 await act(()=>root!.render(h('div',{onKeyDownCapture:(event:any)=>event.preventDefault()},h('input',{onKeyDown:(event:any)=>{held=event;during=event.currentTarget}}))))
 const input=container.querySelector('input')!;const native=new KeyboardEvent('keydown',{key:'A',ctrlKey:true,bubbles:true,cancelable:true})
 await act(()=>input.dispatchEvent(native))
 expect(held.key).toBe('A');expect(held.getModifierState('Control')).toBe(true);expect(held.isDefaultPrevented()).toBe(true)
 expect(during).toBe(input);expect(held.currentTarget).toBeNull();expect(held.nativeEvent).toBe(native)
})
it('keeps input deduplication when an unrelated listener is removed',async()=>{
 const container=document.createElement('div');document.body.append(container);root=createRoot(container);let changes=0
 const onChange=()=>changes++;const render=(click:boolean)=>root!.render(h('input',{onChange,...(click?{onClick:()=>{}}:{})}))
 await act(()=>render(true));const input=container.querySelector('input')!;input.value='changed'
 await act(()=>input.dispatchEvent(new Event('input',{bubbles:true})))
 expect(changes).toBe(1);await act(()=>render(false));await act(()=>input.dispatchEvent(new Event('change',{bubbles:true})))
 expect(changes).toBe(1)
})

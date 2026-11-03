import { afterEach, expect, it, vi } from 'vitest'
import { createElement, useLayoutEffect, Suspense, use, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync, createPortal } from 'react-dom'
const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks() })
function setup() {
 const container = document.createElement('div'); document.body.append(container)
 const root = createRoot(container)
 cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
 return { container, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}
for (const tag of ['input', 'textarea', 'select', 'button']) it(`focuses a late ${tag} after insertion and before refs and parent layout`, () => {
 const {container,render}=setup(); render(<button>edit</button>); (container.firstChild as HTMLElement).focus()
 const seen: string[]=[]
 function Parent() { useLayoutEffect(() => { seen.push(document.activeElement?.tagName || '') }, []); return createElement(tag, {autoFocus:true, ref:(node:HTMLElement|null) => {if(node) seen.push(document.activeElement === node ? 'focused-ref':'unfocused-ref')}}) }
 render(<Parent />)
 expect(document.activeElement).toBe(container.firstChild)
 expect(seen).toEqual(['focused-ref',tag.toUpperCase()])
})
it('does not refocus on updates or when autoFocus becomes true on an existing host', () => {
 const {container,render}=setup(); const focus=vi.spyOn(HTMLElement.prototype,'focus')
 render(<input autoFocus />); expect(focus).toHaveBeenCalledTimes(1)
 const elsewhere=document.createElement('button');document.body.append(elsewhere);cleanups.push(()=>elsewhere.remove());elsewhere.focus()
 render(<input autoFocus value="updated" readOnly />); expect(document.activeElement).toBe(elsewhere)
 render(<input autoFocus={false} />); render(<input autoFocus />);expect(document.activeElement).toBe(elsewhere);expect(focus).toHaveBeenCalledTimes(2)
})
it('does not focus adopted hydration content or steal focus from a user', async () => {
 const container=document.createElement('div');container.innerHTML='<input autofocus="">';document.body.append(container)
 const elsewhere=document.createElement('button');document.body.append(elsewhere);elsewhere.focus()
 const focus=vi.spyOn(HTMLElement.prototype,'focus');const root=hydrateRoot(container,<input autoFocus />)
 cleanups.push(()=>{flushSync(()=>root.unmount());container.remove();elsewhere.remove()})
 await new Promise(resolve=>setTimeout(resolve,0));expect(document.activeElement).toBe(elsewhere);expect(focus).not.toHaveBeenCalled()
})
it('does not call focus on unsupported tags', () => {
 const {render}=setup();const focus=vi.spyOn(HTMLElement.prototype,'focus');render(<div autoFocus tabIndex={0} />);expect(focus).not.toHaveBeenCalled()
})

it('focuses a portal control after it enters its own document', () => {
 const {render}=setup();const portal=document.body.appendChild(document.createElement('section'));cleanups.push(()=>portal.remove())
 render(createPortal(<input autoFocus />,portal));expect(document.activeElement).toBe(portal.firstChild)
})
it('does not focus an abandoned suspended host before its successful commit', async () => {
 const {container,render}=setup();let resolve!:(value:string)=>void;const pending=new Promise<string>(r=>{resolve=r});const focus=vi.spyOn(HTMLElement.prototype,'focus')
 function Gate(){return <span>{use(pending)}</span>}
 render(<Suspense fallback={<b>loading</b>}><input autoFocus/><Gate/></Suspense>);expect(focus).not.toHaveBeenCalled()
 resolve('ready');await expect.poll(()=>container.textContent,{timeout:2000}).toBe('ready');expect(document.activeElement).toBe(container.querySelector('input'));expect(focus).toHaveBeenCalledTimes(1)
})
it('focuses the last mounted control in subtree commit order', () => {
 const {container,render}=setup();render(<section><input autoFocus/><textarea autoFocus/></section>);expect(document.activeElement).toBe(container.querySelector('textarea'))
})

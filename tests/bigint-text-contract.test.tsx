import {expect,it,vi} from 'vitest'
import {Children, type ReactNode} from 'react'
import {createRoot,hydrateRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {renderToString,renderToStaticMarkup} from 'react-dom/server'

it.each([0n,-42n,123456789012345678901234567890n])('renders and updates bigint %s as text without losing precision',value=>{
 const node: ReactNode=value,container=document.createElement('div'),root=createRoot(container)
 try{flushSync(()=>root.render(<p>{node}</p>));const text=container.querySelector('p')!.firstChild;expect(text?.textContent).toBe(String(value));flushSync(()=>root.render(<p>{value+1n}</p>));expect(container.querySelector('p')!.firstChild).toBe(text);expect(text?.textContent).toBe(String(value+1n))}finally{flushSync(()=>root.unmount())}
})
it('keeps adjacent bigint, number and string text in server order',()=>{
 expect(renderToString(<p>{[0n,'/',-42n,7,'/',123456789012345678901234567890n]}</p>)).toBe('<p>0<!-- -->/<!-- -->-42<!-- -->7<!-- -->/<!-- -->123456789012345678901234567890</p>')
 expect(renderToStaticMarkup(<p>{0n}</p>)).toBe('<p>0</p>')
})
it('hydrates bigint server text and preserves its text node on update',()=>{
 const container=document.createElement('div'),error=vi.fn();container.innerHTML='<p>9007199254740993</p>';const paragraph=container.firstChild,text=paragraph!.firstChild
 let root:ReturnType<typeof hydrateRoot>
 flushSync(()=>{root=hydrateRoot(container,<p>{9007199254740993n}</p>,{onRecoverableError:error})})
 try{expect(error).not.toHaveBeenCalled();expect(container.firstChild).toBe(paragraph);flushSync(()=>root.render(<p>{9007199254740994n}</p>));expect(container.firstChild?.firstChild).toBe(text);expect(text?.textContent).toBe('9007199254740994')}finally{flushSync(()=>root!.unmount())}
})
it('uses bigint option text for server default selection',()=>{
 expect(renderToString(<select defaultValue="42"><option>{0n}</option><option>{42n}</option></select>)).toBe('<select><option>0</option><option selected="">42</option></select>')
})
it('ignores an unsupported bigint script child',()=>{expect(renderToString(<script>{42n}</script>)).toBe('<script></script>')})
it('preserves bigint values in Children utilities',()=>{const values=[0n,-42n];expect(Children.toArray(values)).toEqual(values);expect(Children.count(values)).toBe(2)})

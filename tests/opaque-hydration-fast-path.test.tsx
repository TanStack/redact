import {afterEach,expect,it,vi} from 'vitest'
import {createElement as h} from 'react'
import {hydrateRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
const roots: ReturnType<typeof hydrateRoot>[]=[]
afterEach(()=>{for(const root of roots.splice(0))flushSync(()=>root.unmount());vi.restoreAllMocks();document.body.innerHTML=''})
it('adopts exact opaque markup without parsing or constructing custom elements again',()=>{
 let constructions=0;const tag='opaque-exact-'+Math.random().toString(36).slice(2)
 customElements.define(tag,class extends HTMLElement{constructor(){super();constructions++}})
 const html=`<${tag}></${tag}>`,container=document.createElement('div');container.innerHTML=`<section>${html}</section>`;document.body.append(container)
 const original=container.firstChild;expect(constructions).toBe(1)
 const setter=vi.spyOn(Element.prototype,'innerHTML','set');const errors:unknown[]=[]
 roots.push(hydrateRoot(container,h('section',{dangerouslySetInnerHTML:{__html:html}}),{onRecoverableError:e=>errors.push(e)}))
 expect(container.firstChild).toBe(original);expect(constructions).toBe(1);expect(setter).not.toHaveBeenCalled();expect(errors).toEqual([])
})
it('keeps native noscript parsing when matching markup needs normalization',()=>{
 const html='<p class=x>visible</p><noscript><IMG SRC="/inactive.jpg"></noscript>'
 const container=document.createElement('div');container.innerHTML=`<section>${html}</section>`;document.body.append(container)
 const original=container.firstChild,errors:unknown[]=[]
 roots.push(hydrateRoot(container,h('section',{dangerouslySetInnerHTML:{__html:html}}),{onRecoverableError:e=>errors.push(e)}))
 expect(container.firstChild).toBe(original);expect(errors).toEqual([])
})

import {afterEach,expect,it,vi} from 'vitest'
import {createElement as h,Fragment,Suspense,use,useLayoutEffect} from 'react'
import{createRoot}from'react-dom/client'
import{flushSync}from'react-dom'
import{renderToString,renderToReadableStream}from'react-dom/server'
const roots:ReturnType<typeof createRoot>[]=[]
afterEach(()=>{for(const root of roots.splice(0))flushSync(()=>root.unmount());vi.restoreAllMocks();document.body.innerHTML=''})
it('keeps lowercase SVG focus and CORS attributes canonical',()=>{const c=document.createElement('div'),r=createRoot(c);roots.push(r);flushSync(()=>r.render(h('svg',null,h('circle',{tabIndex:0}),h('image',{crossOrigin:'anonymous'}))));expect(c.querySelector('circle')!.getAttribute('tabindex')).toBe('0');expect(c.querySelector('image')!.getAttribute('crossorigin')).toBe('anonymous');expect(renderToString(h('svg',null,h('circle',{tabIndex:0})))).toContain('tabindex="0"')})
it('cleans removed head component effects',()=>{const r=createRoot(document),cleanup=vi.fn();roots.push(r);function Meta(){useLayoutEffect(()=>cleanup,[]);return h('meta',{name:'release-test',content:'value'})}const page=(show:boolean)=>h('html',null,h('head',null,show?h(Meta):null),h('body',null));flushSync(()=>r.render(page(true)));flushSync(()=>r.render(page(false)));expect(cleanup).toHaveBeenCalledTimes(1);expect(document.head.querySelector('meta[name="release-test"]')).toBeNull()})
it('only reports the retained streaming shell attempt error',async()=>{let resolve!:(v:string)=>void;const promise=new Promise<string>(r=>resolve=r),failure=new Error('shell boundary'),errors:unknown[]=[];function Fail(){throw failure}function Pending(){return h('p',null,use(promise))}const result=renderToReadableStream(h(Fragment,null,h(Suspense,{fallback:'fallback'},h(Fail)),h(Pending)),{onError:e=>{errors.push(e)}});resolve('ready');const html=await new Response(await result).text();expect(html).toContain('ready');expect(errors).toEqual([failure])})

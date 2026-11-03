import {expect,it} from 'vitest'
import {createElement as h} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {renderToString} from 'react-dom/server'
it('keeps scale, aspect ratio and prefixed unitless styles as numbers on client and server',()=>{
 const style={scale:0.25,aspectRatio:1.5,WebkitLineClamp:2,WebkitFlex:1,msGridRow:2,width:12}
 const container=document.createElement('div'),root=createRoot(container)
 flushSync(()=>root.render(h('div',{style})))
 const el=container.firstElementChild as HTMLElement
 expect(el.style.scale).toBe('0.25');expect(el.style.aspectRatio).toBe('1.5');expect(el.style.width).toBe('12px')
 const html=renderToString(h('div',{style}));expect(html).toContain('-ms-grid-row:2;');expect(html).toContain('scale:0.25');expect(html).toContain('aspect-ratio:1.5');expect(html).toContain('-webkit-line-clamp:2');expect(html).not.toContain('0.25px');expect(html).not.toContain('1.5px');expect(html).not.toContain('line-clamp:2px')
 flushSync(()=>root.unmount())
})

import { expect, it } from 'vitest'
import { createElement as h } from 'react'
import { preload } from 'react-dom'
import { renderToReadableStream, renderToString } from 'react-dom/server'
it('discards a partial document on root retry and inserts hints after a Unicode head prefix', async()=>{
 let ready=false,attempts=0;const pending=Promise.resolve().then(()=>{ready=true});
 function Wait(){attempts++;preload('/image-🌍.png',{as:'image'});if(!ready)throw pending;return h('p',null,'ready 🌍')}
 const tree=h('html',{lang:'🌍'},h('head',null,h('title',null,'🌍 title')),h('body',null,h('img',{src:'/image-🌍.png'}),h(Wait)));
 const stream=await renderToReadableStream(tree),reader=stream.getReader(),decoder=new TextDecoder();let html='',chunks=0;
 for(;;){const r=await reader.read();if(r.done)break;html+=decoder.decode(r.value,{stream:true});chunks++}html+=decoder.decode();await stream.allReady;
 expect(attempts).toBe(2);expect(html).toBe(renderToString(tree));expect(chunks).toBe(1);expect(html.match(/<!DOCTYPE html>/g)).toHaveLength(1);expect(html.indexOf('rel="preload"')).toBeGreaterThan(html.indexOf('<head>'));expect(html.indexOf('rel="preload"')).toBeLessThan(html.indexOf('</head>'));
})

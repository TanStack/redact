import {createElement as h, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
const host=document.createElement('div'); document.body.append(host);
const rows=(n,reverse=false,value=0)=>h('ul',null,Array.from({length:n},(_,i)=>{const k=reverse?n-i-1:i;return h('li',{key:k,'data-key':k},`${k}:${value}`)}));
let setter;
function State(){const [value,set]=useState(0);setter=set;return rows(500,false,value)}
function check(ok){if(!ok)throw Error('Incorrect completed DOM')}
globalThis.measure=(name,iterations)=>{
 let root=createRoot(host),value=0;
 flushSync(()=>root.render(name==='state'?h(State):rows(500)));
 const operation=()=>{value++;flushSync(()=>{
 if(name==='state')setter(value);
 else if(name==='mount'){root.unmount();root=createRoot(host);root.render(rows(500));}
 else root.render(rows(name==='insert-remove'?(value%2?750:500):500,name==='reorder'&&value%2===1,name==='props'?value:0));
 });};
 const original=host.querySelector('[data-key="0"]');
 for(let i=0;i<20;i++){
 operation();
 const expectedCount=name==='insert-remove'&&value%2?750:500;
 check(host.querySelectorAll('li').length===expectedCount);
 const expectedFirst=name==='reorder'&&value%2?499:0;
 check(host.querySelector('li').textContent===`${expectedFirst}:${name==='state'||name==='props'?value:0}`);
 if(name!=='mount')check(host.querySelector('[data-key="0"]')===original);
 }
 const start=performance.now();for(let i=0;i<iterations;i++)operation();const elapsed=performance.now()-start;
 const count=name==='insert-remove'&&value%2?750:500;
 check(host.querySelectorAll('li').length===count);
 const first=name==='reorder'&&value%2?499:0;
 check(host.querySelector('li').textContent===`${first}:${name==='state'||name==='props'?value:0}`);
 flushSync(()=>root.unmount());check(host.childNodes.length===0);
 return elapsed/iterations;
};

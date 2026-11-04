/**
 * Inline client runtime injected into the streamed HTML. Two jobs:
 *
 *  1. Reveal suspense boundaries as their resolved chunks arrive ($RC).
 *  2. Capture interaction events from the moment the shell is visible so the
 *     main bundle can replay them against un-hydrated subtrees ($RE_q buffer).
 *
 * Wire format:
 *   Fallback:  <!--$?ID--><template id="B:ID"></template>fallback<!--/$-->
 *   Resolved:  a context-specific hidden segment followed by $RC(ID).
 *              Reveal removes the entire fallback range, moves the segment's
 *              children inline, and rewrites the opening comment to <!--$ID-->.
 *
 * Client hydration calls $RH(ID, cb) to register a callback invoked once the
 * boundary has been revealed (or immediately, if it was already revealed).
 *
 * Early-event buffering: before the main bundle is parsed, we attach capture
 * listeners for a small set of interactive events and push them into a buffer.
 * The bundle drains and replays them via the replay code in @tanstack/redact/dom.
 */
import { escapeAttr } from './escape'

export const BOUNDARY_REVEAL_RUNTIME =
  `(function(){` +
    `var c={},r=new Map;` +
    `function place(n,v){` +
      `var a=document.head.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'),t=a.length?a[a.length-1]:null,p=t;` +
      `for(var k=0;k<a.length;k++){if(a[k].getAttribute("data-precedence")===v)p=a[k];else if(p!==t)break}` +
      `document.head.insertBefore(n,p?p.nextSibling:document.head.firstChild);` +
    `}` +
    `function load(n,e){return new Promise(function(y,x){n.onload=function(){e.p=null;y()};n.onerror=function(){e.p=null;x()}})}` +
    `window.$RH=function(i,f){` +
      `if(!document.getElementById("B:"+i))f();` +
      `else c[i]=f;` +
    `};` +
    `window.$RC=function(i){` +
      `var s=document.getElementById("S:"+i),b=document.getElementById("B:"+i);` +
      `if(!s||!b)return;` +
      `var a=document.querySelectorAll('body link[rel="stylesheet"][data-precedence],body style[data-precedence]');` +
      `for(var j=0;j<a.length;j++){` +
        `var n=a[j];if(n.getAttribute("media")==="not all")n.removeAttribute("media");place(n,n.getAttribute("data-precedence"));` +
      `}` +
      `var p=b.parentNode,m=b.previousSibling;` +
      `var n=b.nextSibling,d=0;while(n){var t=n.nextSibling;if(n.nodeType===8){if(n.data==="/$"){if(d===0)break;d--}else if(/^\\$(?:[?!E~])?\\d*$/.test(n.data))d++}p.removeChild(n);n=t}` +
      `while(s.firstChild)p.insertBefore(s.firstChild,b);` +
      `var w=/^(TBODY|TR|COLGROUP|mtext)$/.test(s.nodeName)?s.closest("table,math"):s;w.parentNode.removeChild(w);` +
      `p.removeChild(b);` +
      `if(m&&m.nodeType===8)m.data="$"+i;` +
      `if(c[i]){var f=c[i];delete c[i];f()}` +
    `};` +
    `window.$RL=function(i,d){` +
      `var w=[];for(var j=0;j<d.length;j++){` +
        `var a=d[j],e=r.get(a[0]);if(!e){` +
          `var n=null,l=document.querySelectorAll('link[rel="stylesheet"]');for(var k=0;k<l.length;k++)if(l[k].getAttribute("href")===a[0]){n=l[k];break}` +
          `e={n:n,p:null};r.set(a[0],e);if(!n){` +
            `n=e.n=document.createElement("link");n.rel="stylesheet";n.href=a[0];n.setAttribute("data-precedence",a[1]);` +
            `for(var k=2;k<a.length;k+=2)n.setAttribute(a[k],a[k+1]);` +
            `e.p=load(n,e);place(n,a[1]);` +
          `}` +
        `}` +
        `var m=e.n.getAttribute("media");if(e.p&&(!m||matchMedia(m).matches))w.push(e.p);` +
      `}` +
      `Promise.all(w).then(function(){$RC(i)},function(){$RB(i,1)});` +
    `};` +
    `window.$RB=function(i,e){` +
      `var b=document.getElementById("B:"+i);if(!b)return;` +
      `var m=b.previousSibling;if(m&&m.nodeType===8)m.data=(e?"$E":"$!")+i;` +
      `b.removeAttribute("id");if(c[i]){var f=c[i];delete c[i];f()}` +
    `};` +
    `var q=[];window.$RE_q=q;` +
    `var evs=["click","submit","input","change","keydown"];` +
    `function h(e){q.push([e.type,e.target,e.timeStamp])}` +
    `for(var j=0;j<evs.length;j++)document.addEventListener(evs[j],h,true);` +
    `window.$RE_stop=function(){for(var j=0;j<evs.length;j++)document.removeEventListener(evs[j],h,true)};` +
  `})();`

export function injectBootstrapScript(nonce?: string): string {
  const n = nonce ? ` nonce="${escapeAttr(nonce)}"` : ''
  return `<script${n}>${BOUNDARY_REVEAL_RUNTIME}</script>`
}

export function revealScript(id: number, nonce?: string, styles?: string[][]): string {
  const n = nonce ? ` nonce="${escapeAttr(nonce)}"` : ''
  return `<script${n}>${styles?.length ? `$RL(${id},${JSON.stringify(styles).replace(/</g, '\\u003c')})` : `$RC(${id})`}</script>`
}

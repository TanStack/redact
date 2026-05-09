/**
 * Inline client runtime injected into the streamed HTML. Two jobs:
 *
 *  1. Reveal suspense boundaries as their resolved chunks arrive ($RC).
 *  2. Capture interaction events from the moment the shell is visible so the
 *     main bundle can replay them against un-hydrated subtrees ($RE_q buffer).
 *
 * Wire format:
 *   Fallback:  <!--$?ID--><div id="B:ID">fallback</div><!--/$-->
 *   Resolved:  emits <div hidden id="S:ID">real</div><script>$RC(ID)</script>
 *              which splices real into place and rewrites the comment to <!--$ID-->.
 *              The fallback div is visible (it's the user-visible loading
 *              state); only the resolved-content staging div is `hidden`
 *              before $RC moves its children inline.
 *
 * Client hydration calls $RH(ID, cb) to register a callback invoked once the
 * boundary has been revealed (or immediately, if it was already revealed).
 *
 * Early-event buffering: before the main bundle is parsed, we attach capture
 * listeners for a small set of interactive events and push them into a buffer.
 * The bundle drains and replays them via the replay code in @tanstack/redact/dom.
 */
export const BOUNDARY_REVEAL_RUNTIME =
  `(function(){` +
    `var c={};` +
    `window.$RH=function(i,f){` +
      `if(!document.getElementById("B:"+i))f();` +
      `else c[i]=f;` +
    `};` +
    `window.$RC=function(i){` +
      `var s=document.getElementById("S:"+i),b=document.getElementById("B:"+i);` +
      `if(!s||!b)return;` +
      `var p=b.parentNode,m=b.previousSibling;` +
      `while(s.firstChild)p.insertBefore(s.firstChild,b);` +
      `s.parentNode.removeChild(s);` +
      `p.removeChild(b);` +
      `if(m&&m.nodeType===8)m.data="$"+i;` +
      `if(c[i]){var f=c[i];delete c[i];f()}` +
    `};` +
    `var q=[];window.$RE_q=q;` +
    `var evs=["click","submit","input","change","keydown"];` +
    `function h(e){q.push([e.type,e.target,e.timeStamp])}` +
    `for(var j=0;j<evs.length;j++)document.addEventListener(evs[j],h,true);` +
    `window.$RE_stop=function(){for(var j=0;j<evs.length;j++)document.removeEventListener(evs[j],h,true)};` +
  `})();`

export function injectBootstrapScript(nonce?: string): string {
  const n = nonce ? ` nonce="${nonce}"` : ''
  return `<script${n}>${BOUNDARY_REVEAL_RUNTIME}</script>`
}

export function revealScript(id: number, nonce?: string): string {
  const n = nonce ? ` nonce="${nonce}"` : ''
  return `<script${n}>$RC(${id})</script>`
}

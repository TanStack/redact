import { createSyntheticEvent } from './synthetic-event';
import { UNITLESS_STYLE } from '../core/unitless-style';
import { devToolsMetadata } from '../core/devtools';
import { formActions } from './form-actions';
import { queueRestore, scheduleControlledRestore } from './form-controls';
import { attributeName, attributeValue } from '../core/attributes';
import { isString } from "../core/functions";
const SVG_NS = 'http://www.w3.org/2000/svg';
const IDL_ATTRS = /^(value|checked|selected|disabled|multiple|muted|readonly)$/;
export const isSvgElement = (el: Element): boolean => (el.namespaceURI === SVG_NS);
export function setProp(el: Element, name: string, next: any, prev: any, isSvg: boolean): void {
    if (isReservedProp(name))
        return;
    // These names need no alias or boolean-attribute normalization.
    if (/^(aria|data)-./.test(name)) {
        if (next == null)
            el.removeAttribute(name);
        else
            el.setAttribute(name, '' + next);
        return;
    }
    if (name === 'action' || name === 'formAction') {
        if (isFunction(next)) {
            formActions.set(el, next);
            el.removeAttribute(name.toLowerCase());
            return;
        }
        formActions.delete(el);
    }
    // defaultValue / defaultChecked are IDL-property-only — they seed the
    // initial value/checked of a form control on first mount and must NOT be
    // emitted as HTML attributes (which would leak as `defaultValue="..."`).
    // Setting `el.defaultValue` on a fresh control also sets the initial
    // `el.value`, which is what consumers expect. Skip on hydrated DOM so we
    // don't clobber a live user-typed value.
    if (name === 'defaultValue' || name === 'defaultChecked') {
        if (prev === undefined && next != null) {
            try {
                ;
                (el as any)[name] = next;
            }
            catch { }
        }
        return;
    }
    if (name === 'className' && !isSvg) {
        ;
        (el as HTMLElement).className = next == null ? '' : '' + next;
        return;
    }
    if (name === 'style') {
        setStyle(el as HTMLElement, next, prev);
        return;
    }
    if (name === 'dangerouslySetInnerHTML') {
        const nextHtml = next?.__html ?? '';
        const prevHtml = prev?.__html ?? '';
        if (nextHtml !== prevHtml)
            (el as HTMLElement).innerHTML = nextHtml;
        return;
    }
    if (name[0] === 'o' && name[1] === 'n') {
        setEventHandler(el, name, next);
        return;
    }
    const attr = attributeName(name, isSvg);
    if (!isSvg && IDL_ATTRS.test(name) && name in el) {
        try {
            (el as any)[name] = next == null ? '' : next;
            return;
        } catch {}
    }
    const value = attributeValue(name, next, attr);
    if (value === null) el.removeAttribute(attr);
    else el.setAttribute(attr, value);
}
function setStyleProperty(style: CSSStyleDeclaration, key: string, value: any): void {
    if (key[0] === '-') {
        style.setProperty(key, value == null ? '' : '' + value);
    }
    else {
        ;
        (style as any)[key] = value == null || value === '' ? ''
            : value + (typeof value === 'number' && !UNITLESS_STYLE.test(key) ? 'px' : '');
    }
}
function setStyle(el: HTMLElement, next: any, prev: any): void {
    const style = el.style;
    if (isString(next)) {
        style.cssText = next;
        return;
    }
    if (isString(prev))
        style.cssText = '';
    if (prev && isObject(prev)) {
        for (const k in prev) {
            if (!next || !(k in next))
                setStyleProperty(style, k, '');
        }
    }
    if (next && isObject(next)) {
        for (const k in next) {
            if (!prev || prev[k] !== next[k])
                setStyleProperty(style, k, next[k]);
        }
    }
}
function setEventHandler(el: Element, name: string, next: any): void {
    // Only function handlers are accepted. Reject strings/objects/etc — the
    // legacy `onclick="..."` HTML attribute (string handler) is a known XSS
    // vector if a parent spreads untrusted props onto a host element. React
    // also ignores non-function handlers.
    const enabled = isFunction(next);
    const capture = name.endsWith('Capture') && !name.endsWith('PointerCapture');
    const lower = name.slice(2, capture ? -7 : undefined).toLowerCase();
    const type = (el as HTMLInputElement).type;
    // Browsers fire no `change` for a checkbox or radio clicked outside a
    // document; React listens for `click` there, so onChange still runs.
    const events = lower !== 'change' ? [lower === 'focus' ? 'focusin' : lower === 'blur' ? 'focusout' : lower === 'doubleclick' ? 'dblclick' : lower]
        : /^(checkbox|radio)$/.test(type) ? ['click', 'change']
        : el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' && type !== 'file' ? ['input', 'change']
        : ['change'];
    // Key by the React prop name (not DOM event name) so `onChange` and
    // `onInput` on the same text input — which both dispatch from the native
    // `input` event — can coexist without clobbering each other's handlers.
    const handlers = ((el as any).__h ||= Object.create(null));
    let existing = handlers[name];
    // Replace the listener when a control's type changes its native event.
    if (existing && (!enabled || existing.e[0] !== events[0])) {
        for (const event of existing.e)
            el.removeEventListener(event, existing, capture);
        if (enabled) delete (el as any).__v;
        existing = handlers[name] = null;
    }
    if (!enabled)
        return;
    if (!existing) {
        const entry = ((e: Event) => {
            const click = e.type === 'click' && events[1];
            if (click) {
                // Only a click that checked a detached radio or toggled a
                // detached checkbox; attached ones get their `change` event.
                const props = (el as any).__p || {};
                if (el.isConnected || (el as HTMLInputElement).type === 'radio' && (props.checked ?? (el as any).__k ?? props.defaultChecked))
                    return;
            }
            else if (events[0] === 'input') {
                const value = (el as HTMLInputElement).value;
                if (e.type === 'change' && (el as any).__v === value)
                    return;
                (el as any).__v = e.type === 'input' ? value : undefined;
            }
            const event = createSyntheticEvent(e);
            try {
                if (process.env.NODE_ENV !== 'production') {
                    const previous = devToolsMetadata.current;
                    devToolsMetadata.current = devToolsMetadata.hosts.get(el) || null;
                    try { entry.c(event); } finally { devToolsMetadata.current = previous; }
                } else entry.c(event);
            } finally {
                event.currentTarget = null;
                // A detached click has no container to reach, so it restores here.
                if (click)
                    scheduleControlledRestore(el as HTMLInputElement);
                else
                    queueRestore(e, el);
            }
        }) as ((e: Event) => void) & {
            c: Function;
            e: string[];
        };
        entry.e = events;
        existing = handlers[name] = entry;
        for (const event of events)
            el.addEventListener(event, entry, capture);
    }
    existing.c = next;
}

export interface SyntheticEvent extends Event {
    nativeEvent: Event;
    isDefaultPrevented(): boolean;
    isPropagationStopped(): boolean;
    persist(): void;
    currentTarget: EventTarget & Element;
}
export function createHostNode(type: string, isSvg: boolean, owner: Document = document): Element {
    if (isSvg || type === 'svg') {
        return owner.createElementNS(SVG_NS, type);
    }
    return owner.createElement(type);
}
import { isObject } from '../core/functions';
import { isFunction, isReservedProp } from '../core/functions';

// Renderer writes have already been observed by the app. Native change events
// should only report a value that differs from that renderer-owned value.
export function trackInputValue(el: HTMLInputElement | HTMLTextAreaElement): void {
    (el as any).__v = el.value;
}

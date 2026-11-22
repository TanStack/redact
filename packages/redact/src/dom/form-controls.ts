import { trackInputValue } from './dom';
import { ReactSharedInternals } from '../react';
// Record the latest props for controlled restores. Like React, a controlled
// control restores even without an input or change handler, so it listens
// like a handler once it is controlled.
export function recordProps(el: any, props: any): void {
    el.__p = props;
    if ((/^(checkbox|radio)$/.test(el.type) ? props.checked : props.value) != null) {
        el.addEventListener('input', queueRestore);
        el.addEventListener('change', queueRestore);
    }
}
export function syncTextareaValue(el: HTMLTextAreaElement, props: any, mounting?: boolean): void {
    recordProps(el, props);
    if (mounting) {
        const children = props.children;
        const initial = props.value ?? props.defaultValue ?? (Array.isArray(children) ? children[0] : children) ?? '';
        el.defaultValue = initial;
        // The strict check also preserves React's clean numeric-default state.
        if (initial !== '' && el.textContent === initial) {
            el.value = initial;
            trackInputValue(el);
        }
        return;
    }
    const value = props.value;
    if (value != null)
        writeInputValue(el, value);
    const fallback = props.defaultValue ?? value ?? '';
    if (el.defaultValue !== '' + fallback)
        el.defaultValue = '' + fallback;
}
export function syncInputValue(el: HTMLInputElement, props: any, prev?: any): void {
    recordProps(el, props);
    if (!prev) {
        el.checked = el.defaultChecked = !!(props.checked ?? props.defaultChecked);
    }
    else if (props.checked != null) {
        el.checked = !!props.checked;
    }
    else if (props.defaultChecked != null) {
        el.defaultChecked = !!props.defaultChecked;
    }
    const value = props.value;
    const fallback = props.defaultValue;
    const button = el.type === 'submit' || el.type === 'reset';
    if (!prev && value == null && button)
        return;
    const next = value ?? fallback;
    if (next == null) {
        if (prev && (prev.defaultValue != null || button))
            el.removeAttribute('value');
        return;
    }
    // Number inputs keep equivalent user spelling, including trailing zeroes.
    const number = prev && value != null && el.type === 'number';
    let nextDefault = number ? undefined : '' + next;
    if (!prev || value != null) {
        if (number ? (value === 0 && el.value === '') || el.value != value : el.value !== nextDefault) {
            el.value = nextDefault ?? '' + value;
            trackInputValue(el);
        }
    }
    nextDefault ??= el.value == value ? el.value : '' + value;
    if (!prev || el.defaultValue !== nextDefault)
        el.defaultValue = nextDefault;
}
function writeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: any): void {
    // Number inputs keep equivalent user spelling, including trailing zeroes.
    if (el.type === 'number' ? (value === 0 && el.value === '') || el.value != value : el.value !== '' + value) {
        el.value = '' + value;
        trackInputValue(el);
    }
}
// Like React, restore from the root and portal containers, after every listener
// on the control and its ancestors has read the edit. A checkbox, radio or
// select fires input before change, so with a change listener on the control
// or an ancestor it restores after change.
export function queueRestore(e: any): void {
    const el = e.target;
    if (el.__p && (e.type === 'change' || e.type === 'input' && !(/^(checkbox|radio|select|file)/.test(el.type) && e.composedPath().some((node: any) => Object.values(node.__h || {}).some((other: any) => other?.e.includes('change'))))))
        e.__r = el;
    // A stopped or non-bubbling event never reaches the container, so restore
    // after the task, once the remaining listeners on this node read the edit.
    if (e.cancelBubble || !e.bubbles)
        restorePending(e, true);
}
export function listenForRestores(container: Node): void {
    container.addEventListener('input', restorePending);
    container.addEventListener('change', restorePending);
}
function restorePending(e: any, late?: boolean): void {
    if (e.__r)
        scheduleControlledRestore(e.__r, late);
    e.__r = null;
}
// Like React, write the rendered value and checked state back after onChange,
// so an edit or click the app did not accept never stays in the DOM. Updates
// from the handler flush in a microtask (or act's queue) queued before this
// one, so the restore reads the props they render.
function scheduleControlledRestore(el: HTMLInputElement, late?: boolean): void {
    if (!(el as any).__p)
        return;
    const restore = () => {
        // Clicking a radio unchecks the rest of its group.
        for (const input of el.type === 'radio' && el.name ? (el.getRootNode() as ParentNode).querySelectorAll<HTMLInputElement>('input[type=radio]') : [el]) {
            const props = (input as any).__p;
            if (!props || input.name !== el.name)
                continue;
            if (input.tagName === 'SELECT')
                syncSelectValue(input as any, props, props);
            else {
                if (props.value != null)
                    writeInputValue(input, props.value);
                if (props.checked != null)
                    input.checked = !!props.checked;
            }
        }
    };
    if (process.env.NODE_ENV !== 'production' && ReactSharedInternals.A)
        ReactSharedInternals.A.push(restore);
    else if (late)
        setTimeout(restore);
    else
        queueMicrotask(restore);
}
export function syncSelectValue(select: HTMLSelectElement, props: any, prev?: any): void {
    recordProps(select, props);
    const multiple = select.multiple;
    const value = props.value ?? ((!prev || !!prev.multiple !== multiple) ? props.defaultValue ?? (prev && []) : null);
    if (value == null)
        return;
    const defaults = props.value == null && props.defaultValue != null;
    const selected = new Set(multiple ? value.map(String) : ['' + value]);
    let fallback: HTMLOptionElement | undefined;
    for (const option of select.options) {
        const match = selected.has(option.value);
        if (defaults && match)
            option.defaultSelected = true;
        if (multiple)
            option.selected = match;
        else {
            if (match) {
                fallback = option;
                break;
            }
            if (!fallback && !option.disabled)
                fallback = option;
        }
    }
    if (fallback)
        fallback.selected = true;
}

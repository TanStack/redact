import { trackInputValue } from './dom';
export function syncTextareaValue(el: HTMLTextAreaElement, props: any, mounting?: boolean): void {
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
    if (value != null && el.value !== '' + value) {
        el.value = '' + value;
        trackInputValue(el);
    }
    const fallback = props.defaultValue ?? value ?? '';
    if (el.defaultValue !== '' + fallback)
        el.defaultValue = '' + fallback;
}
export function syncInputValue(el: HTMLInputElement, props: any, prev?: any): void {
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
export function syncSelectValue(select: HTMLSelectElement, props: any, prev?: any): void {
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

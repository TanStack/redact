import { acquireResource } from './resources';
import { isString } from "../core/functions";
import { isObject } from '../core/functions';
const requestOptions = 'integrity fetchPriority';
function options(input: any, fields: string, as?: string): ResourceHintOptions {
    const result: ResourceHintOptions = {};
    if (fields) {
        for (const name of fields.split(' ')) {
            const value = input?.[name];
            if (isString(value))
                result[name] = value;
        }
    }
    const crossOrigin = input?.crossOrigin;
    const font = as === 'font';
    if (font || isString(crossOrigin))
        result.crossOrigin = !font && crossOrigin === 'use-credentials' ? crossOrigin : '';
    return result;
}
const scriptDestination = (as: string): boolean => (/^(script|audioworklet|paintworklet|serviceworker|sharedworker|worker)$/.test(as));
export function preinit(href: string, input?: any): void {
    if (isString(href) && input) {
        if (input.as === 'style') {
            const props = options(input, 'precedence ' + requestOptions);
            props.precedence ||= 'default';
            emit('stylesheet', href, props);
        }
        else if (input.as === 'script') {
            emit('script', href, options(input, 'nonce ' + requestOptions));
        }
    }
}
export function prefetchDNS(href: string): void {
    if (isString(href))
        emit('dns-prefetch', href, {});
}
export function preconnect(href: string, input?: any): void {
    if (isString(href))
        emit('preconnect', href, options(input, ''));
}
export function preinitModule(href: string, input?: any): void {
    if (isString(href) && (input == null || isObject(input) && (input.as == null || input.as === 'script'))) {
        emit('module-script', href, options(input, 'nonce ' + requestOptions));
    }
}
export function preloadModule(href: string, input?: any): void {
    if (isString(href)) {
        const props = options(input, 'as nonce ' + requestOptions, input?.as);
        if (props.as === 'script')
            delete props.as;
        emit('modulepreload', href, props);
    }
}
function emit(kind: ResourceHintKind, href: string, props: ResourceHintOptions): void {
    if (!href || resourceHintDispatcher.emit?.(kind, href, props) || typeof document === 'undefined')
        return;
    const script = kind === 'script' || kind === 'module-script';
    if (kind === 'stylesheet' || script) {
        acquireResource(script ? 'script' : 'link', script
            ? { src: href, async: true, ...(kind === 'module-script' ? { type: 'module' } : {}), ...props }
            : { rel: 'stylesheet', href, ...props }, document);
        return;
    }
    const resources = getResources(document);
    const preload = kind === 'preload' || kind === 'modulepreload';
    const as = props.as || 'script';
    const image = kind === 'preload' && as === 'image' && props.imageSrcSet;
    let selector = `link[rel="${kind}"]`;
    if (preload) selector += resourceAttribute('as', as);
    if (image) {
        selector += resourceAttribute('imagesrcset', image);
        if (isString(props.imageSizes))
            selector += resourceAttribute('imagesizes', props.imageSizes);
    } else {
        selector += resourceAttribute('href', href);
    }
    if (!preload && props.crossOrigin != null)
        selector += resourceAttribute('crossorigin', props.crossOrigin);
    const resource = (kind === 'preload' ? as === 'script' || as === 'style'
        : kind === 'modulepreload' && scriptDestination(as)) ? resourceSelector(href, as) : '';
    const key = resource || selector;
    if (resources.p.has(key))
        return;
    resources.p.set(key, props);
    if (document.querySelector(selector) || resource && document.querySelector(resource))
        return;
    const node = document.createElement('link');
    node.setAttribute('rel', kind);
    if (!image)
        node.setAttribute('href', resourceURL(href));
    for (const name in props)
        node.setAttribute(name.toLowerCase(), props[name]!);
    insertResource(node);
}
export function preload(href: string, input?: any): void {
    if (isString(href) && input && isObject(input) && isString(input.as) && input.as) {
        emit('preload', href, options(input, 'as nonce type referrerPolicy imageSrcSet imageSizes media ' + requestOptions, input.as));
    }
}
import { resourceHintDispatcher, resourceURL, type ResourceHintKind, type ResourceHintOptions } from '../core/resource-hints';
import { getResources, insertResource, resourceAttribute, resourceSelector } from './resource-store';

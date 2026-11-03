import { requestFormReset } from './form-actions';
export { createPortal } from './portal';
import { createPortal } from './portal';
import { browser } from '../core/browser';
export type { BrowserToken } from '../core/browser';
import { preconnect, prefetchDNS, preload, preinit, preloadModule, preinitModule } from './resource-hints';
import { useFormStatus, useActionState as useFormState } from '../react/hooks';
export { flushSync, batchedUpdates as unstable_batchedUpdates } from './root';
import { flushSync, batchedUpdates } from './root';
export { browser } from '../core/browser';
import { findDOMNode } from './features/class';
// Root entry points register renderers. These DOM utilities can also run alone,
// so importing them must not eagerly install every optional renderer.
export { preconnect, prefetchDNS, preload, preinit, preloadModule, preinitModule };
export const __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = {
    d: {
        f() { },
        r: requestFormReset,
        D: prefetchDNS,
        C(href: string, crossOrigin?: string) { preconnect(href, { crossOrigin }); },
        L(href: string, as: string, options?: any) { preload(href, { ...options, as }); },
        m: preloadModule,
        X(href: string, options?: any) { preinit(href, { ...options, as: 'script' }); },
        S(href: string, precedence?: string, options?: any) { preinit(href, { ...options, as: 'style', precedence }); },
        M: preinitModule,
    },
    p: 0,
    findDOMNode,
};
export const version = '19.2.3';
// Required by React's default export consumers
export default {
    useFormStatus,
    useFormState,
    requestFormReset,
    flushSync,
    unstable_batchedUpdates: batchedUpdates,
    createPortal,
    browser,
    preconnect,
    prefetchDNS,
    preload,
    preinit,
    preloadModule,
    preinitModule,
    __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
    version: '19.2.3',
};
export { useFormStatus, useFormState, requestFormReset };

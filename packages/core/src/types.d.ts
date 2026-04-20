export declare const REACT_ELEMENT_TYPE: unique symbol;
export declare const REACT_LEGACY_ELEMENT_TYPE: unique symbol;
export declare const REACT_FRAGMENT_TYPE: unique symbol;
export declare const REACT_PORTAL_TYPE: unique symbol;
export declare const REACT_PROVIDER_TYPE: unique symbol;
export declare const REACT_CONTEXT_TYPE: unique symbol;
export declare const REACT_CONSUMER_TYPE: unique symbol;
export declare const REACT_FORWARD_REF_TYPE: unique symbol;
export declare const REACT_SUSPENSE_TYPE: unique symbol;
export declare const REACT_MEMO_TYPE: unique symbol;
export declare const REACT_LAZY_TYPE: unique symbol;
export declare const REACT_STRICT_MODE_TYPE: unique symbol;
export declare const REACT_PROFILER_TYPE: unique symbol;
export type Key = string | number | null | undefined;
export interface ReactElement<P = any, T = any> {
    $$typeof: typeof REACT_ELEMENT_TYPE;
    type: T;
    key: string | null;
    ref: any;
    props: P;
}
export type ReactNode = ReactElement | string | number | boolean | null | undefined | Iterable<ReactNode>;
export type RefObject<T> = {
    current: T | null;
};
export type RefCallback<T> = (instance: T | null) => void | (() => void);
export type Ref<T> = RefObject<T> | RefCallback<T> | null;
export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((prev: S) => S);
export type EffectCallback = () => void | (() => void);
export type DependencyList = ReadonlyArray<unknown>;
export interface Context<T> {
    $$typeof: typeof REACT_CONTEXT_TYPE;
    _currentValue: T;
    Provider: ProviderExoticComponent<{
        value: T;
        children?: ReactNode;
    }>;
    Consumer: ConsumerExoticComponent<T>;
    displayName?: string;
}
export interface ProviderExoticComponent<P> {
    $$typeof: typeof REACT_PROVIDER_TYPE;
    _context: Context<any>;
    (props: P): ReactElement;
}
export interface ConsumerExoticComponent<T> {
    $$typeof: typeof REACT_CONSUMER_TYPE;
    _context: Context<T>;
    (props: {
        children: (value: T) => ReactNode;
    }): ReactElement;
}

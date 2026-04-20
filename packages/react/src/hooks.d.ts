import type { Dispatch, SetStateAction, EffectCallback, DependencyList, Context } from '@tanstack/dom-core';
export declare function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
export declare function useReducer<S, A>(reducer: (s: S, a: A) => S, initial: any, init?: (a: any) => S): [S, Dispatch<A>];
export declare function useEffect(create: EffectCallback, deps?: DependencyList): void;
export declare function useLayoutEffect(create: EffectCallback, deps?: DependencyList): void;
export declare function useInsertionEffect(create: EffectCallback, deps?: DependencyList): void;
export declare function useRef<T>(initial: T): {
    current: T;
};
export declare function useRef<T>(initial: T | null): {
    current: T | null;
};
export declare function useRef<T = undefined>(): {
    current: T | undefined;
};
export declare function useMemo<T>(factory: () => T, deps?: DependencyList): T;
export declare function useCallback<T extends Function>(fn: T, deps?: DependencyList): T;
export declare function useContext<T>(ctx: Context<T>): T;
export declare function useImperativeHandle<T>(ref: any, factory: () => T, deps?: DependencyList): void;
export declare function useDebugValue<T>(value: T, formatter?: (v: T) => any): void;
export declare function useId(): string;
export declare function useTransition(): [boolean, (fn: () => void) => void];
export declare function useDeferredValue<T>(v: T): T;
export declare function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;
export declare function use<T>(resource: any): T;
export declare function startTransition(fn: () => void): void;
export declare function useActionState<S, P>(_action: (state: Awaited<S>, payload: P) => S | Promise<S>, initial: Awaited<S>): [Awaited<S>, (payload: P) => void, boolean];
export declare function useFormStatus(): {
    pending: boolean;
    data: any;
    method: any;
    action: any;
};
export declare function useOptimistic<S, A = S>(state: S, _updateFn?: (s: S, a: A) => S): [S, (action: A) => void];

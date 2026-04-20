export declare function memo<P>(type: (props: P) => any, areEqual?: (prev: Readonly<P>, next: Readonly<P>) => boolean): {
    $$typeof: symbol;
    type: (props: P) => any;
    compare: (prev: Readonly<P>, next: Readonly<P>) => boolean;
};
export declare function forwardRef<R, P = {}>(render: (props: P, ref: {
    current: R | null;
} | ((r: R | null) => void) | null) => any): {
    $$typeof: symbol;
    render: (props: P, ref: {
        current: R | null;
    } | ((r: R | null) => void) | null) => any;
};
export declare function lazy<T extends {
    default: any;
}>(ctor: () => Promise<T>): {
    $$typeof: symbol;
    _payload: {
        status: -1 | 0 | 1 | 2;
        result: any;
    };
    _init: (p: {
        status: -1 | 0 | 1 | 2;
        result: any;
    }) => any;
};

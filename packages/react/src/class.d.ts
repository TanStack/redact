import type { ReactNode } from '@tanstack/dom-core';
type SetStateCallback<S, P> = Partial<S> | ((prev: S, props: P) => Partial<S> | null) | null;
export declare class Component<P = {}, S = {}> {
    static contextType?: any;
    static getDerivedStateFromProps?(props: any, state: any): any;
    static getDerivedStateFromError?(error: any): any;
    static defaultProps?: any;
    static displayName?: string;
    props: P;
    state: S;
    context: any;
    refs: Record<string, any>;
    _fiber: any;
    _enqueueUpdate: ((updater: SetStateCallback<S, P>, cb?: () => void) => void) | null;
    _forceUpdate: ((cb?: () => void) => void) | null;
    constructor(props: P, context?: any);
    setState(updater: SetStateCallback<S, P>, callback?: () => void): void;
    forceUpdate(callback?: () => void): void;
    render(): ReactNode;
    componentDidMount?(): void;
    componentDidUpdate?(prevProps: P, prevState: S, snapshot?: any): void;
    componentWillUnmount?(): void;
    shouldComponentUpdate?(nextProps: P, nextState: S, nextCtx: any): boolean;
    getSnapshotBeforeUpdate?(prevProps: P, prevState: S): any;
    componentDidCatch?(error: any, info: {
        componentStack: string;
    }): void;
}
export declare class PureComponent<P = {}, S = {}> extends Component<P, S> {
}
export {};

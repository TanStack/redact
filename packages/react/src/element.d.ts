import { type ReactElement, type ReactNode } from '@tanstack/dom-core';
export declare const Fragment: (props: {
    children?: ReactNode;
}) => ReactElement;
export declare function createElement(type: any, config: Record<string, any> | null, ...children: ReactNode[]): ReactElement;
export declare function cloneElement(element: ReactElement, config: Record<string, any> | null, ...children: ReactNode[]): ReactElement;
export declare function isValidElement(obj: any): obj is ReactElement;
export declare function createRef<T = any>(): {
    current: T | null;
};

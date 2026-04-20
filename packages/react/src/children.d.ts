import type { ReactNode, ReactElement } from '@tanstack/dom-core';
export declare const Children: {
    map(children: ReactNode, fn: (child: ReactNode, index: number) => any): any[] | null;
    forEach(children: ReactNode, fn: (child: ReactNode, index: number) => void): void;
    count(children: ReactNode): number;
    toArray(children: ReactNode): any[];
    only(children: ReactNode): ReactElement;
};

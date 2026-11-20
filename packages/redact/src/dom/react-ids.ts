import type { Fiber, FiberRoot } from '../core';
// React SSR encodes the original child slots, including empty slots, into IDs.
// Redact SSR uses the same tree slots so suspended render order cannot change IDs.
let clientId = 0;
export const leadingBit = (tree: bigint): bigint => 1n << BigInt(tree.toString(2).length - 1);
export function forkId(base: bigint, count: number, index: number): bigint {
    const bit = leadingBit(base);
    return (bit << BigInt(32 - Math.clz32(count))) | (BigInt(index + 1) * bit) | (base ^ bit);
}
export function assignReactIds(parent: Fiber, children: object): void {
    const paths = (children as {
        ip?: bigint[];
    }).ip;
    if (!paths)
        return;
    let base = parent.it ?? 1n;
    if (parent.im)
        base = forkId(base, 1, 0);
    const bit = leadingBit(base);
    let index = 0;
    for (let child = parent.c; child; child = child.s) {
        const path = paths[child.ix ?? index++] ?? 1n;
        child.it = (path * bit) | (base ^ bit);
    }
}
export function reactId(fiber: Fiber, root: FiberRoot): string {
    if (!root.h)
        return clientReactId(root);
    fiber.im = true;
    const local = fiber.il ?? 0;
    fiber.il = local + 1;
    const tree = fiber.it ?? 1n;
    const id = (tree ^ leadingBit(tree)).toString(32);
    return '_' + (root.i ?? '') + 'R_' + id + (local ? 'H' + local.toString(32) : '') + '_';
}
export const clientReactId = (root: FiberRoot): string => ('_' + (root.i ?? '') + 'r_' + (clientId++).toString(32) + '_');

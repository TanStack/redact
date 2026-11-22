import { FiberTag, type Fiber, type FiberRoot } from '../core';
export function getAnchor(fiber: Fiber, domParent: Node): Node | null {
    let p: Fiber | null = fiber;
    while (p) {
        let sibling = p.s;
        while (sibling) {
            const d = firstDomNode(sibling, domParent);
            if (d)
                return d;
            sibling = sibling.s;
        }
        p = p.p;
        if (p?.t === FiberTag.Host || p?.t === FiberTag.Root || p?.t === FiberTag.Portal)
            break;
    }
    return null;
}
export function getHostParent(fiber: Fiber): Node {
    let p = fiber.p;
    while (p) {
        if (p.t === FiberTag.Host)
            return p.n!;
        if (p.t === FiberTag.Root || p.t === FiberTag.Portal) {
            return (p.t === FiberTag.Portal && (p.v ?? p.m)?.container) || p.i || p.n || p.r?.c;
        }
        p = p.p;
    }
    if (process.env.NODE_ENV !== 'production') {
        throw new Error('No host parent found.');
    }
    throw new Error();
}
export function findRoot(fiber: Fiber): FiberRoot | null {
    let f: Fiber | null = fiber;
    while (f) {
        if (f.r)
            return fiber.r = f.r;
        f = f.p;
    }
    return null;
}
export function firstDomNode(fiber: Fiber, domParent: Node): Node | null {
    if (fiber.t === FiberTag.Suspense && fiber.b?.w && fiber.b.b.parentNode === domParent)
        return fiber.b.b;
    if (fiber.t <= FiberTag.Text) {
        return fiber.n?.parentNode === domParent ? fiber.n : null;
    }
    return visitChildren(fiber, firstDomNode, domParent) ?? null;
}
export function visitChildren<State, Result>(
    parent: Fiber,
    visit: (fiber: Fiber, state: State) => Result,
    state?: State,
    skipFallback?: boolean,
): Result | undefined {
    for (let child = parent.c; child; child = child.s) {
        const result = visit(child, state!);
        if (result) return result;
    }
    if (!skipFallback && parent.t === FiberTag.Suspense && parent.b?.f)
        return visit(parent.b.f, state!);
}

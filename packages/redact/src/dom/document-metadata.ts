import { FiberTag, type Fiber } from '../core';
export function documentSingleton(fiber: Fiber): HTMLElement | null {
    const doc = fiber.r?.c as Document | undefined;
    return doc?.nodeType === 9 && DOCUMENT_SHELL_TAGS.test(fiber.type) ? doc[fiber.type === 'html' ? 'documentElement' : fiber.type as 'head' | 'body'] : null;
}
export const DOCUMENT_HEAD_TAGS = /^(base|link|meta|script|style|title)$/;
export const DOCUMENT_SHELL_TAGS = /^(html|head|body)$/;
export function clearAttributes(node: Element): void {
    for (let attribute; attribute = node.attributes[0];)
        node.removeAttribute(attribute.name);
}
// React's document server renderer hoists metadata even when a component
// returns it inside a body wrapper or a Suspense boundary.
export function documentMetadataParent(fiber: Fiber): HTMLHeadElement | null {
    const container = fiber.r?.c;
    const doc = container?.nodeType === 9 ? container as unknown as Document : container?.ownerDocument;
    if (!doc?.head || fiber.v?.itemProp != null ||
        !['title', 'meta', 'base', 'link'].includes(fiber.type) ||
        fiber.type === 'link' && fiber.v?.rel === 'stylesheet')
        return null;
    for (let parent = fiber.p; parent; parent = parent.p) {
        if (parent.t === FiberTag.Portal || parent.type === 'svg')
            return null;
        if (parent.type === 'foreignObject')
            break;
    }
    return doc.head;
}
export function clearHostContainer(container: Node): void {
    if (container.nodeType !== 9 && !DOCUMENT_SHELL_TAGS.test((container as Element).localName)) {
        container.textContent = '';
        return;
    }
    for (let index = container.childNodes.length; index--;) {
        const node = container.childNodes[index]!, tag = (node as Element).localName;
        if (DOCUMENT_SHELL_TAGS.test(tag))
            clearHostContainer(node);
        else if (node.nodeType !== 10 && !/^(script|style)$/.test(tag) && !(tag === 'link' && /^stylesheet$/i.test((node as HTMLLinkElement).rel)))
            node.remove();
    }
}

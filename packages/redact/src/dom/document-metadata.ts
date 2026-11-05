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
// Document roots hoist metadata; element roots only hoist titles.
export function documentMetadataParent(fiber: Fiber): HTMLHeadElement | null {
    const container = fiber.r?.c;
    if (!container || fiber.v?.itemProp != null ||
        (container.nodeType === 9 ? !['title', 'meta', 'base', 'link'].includes(fiber.type) :
            container.nodeType !== 1 || fiber.type !== 'title'))
        return null;
    let inForeignObject = false;
    for (let parent = fiber.p; parent; parent = parent.p) {
        if (parent.t === FiberTag.Portal)
            return null;
        if (parent.type === 'foreignObject')
            inForeignObject = true;
        if (parent.type === 'svg' && !inForeignObject)
            return null;
    }
    if (!inForeignObject && (container as Element).namespaceURI === 'http://www.w3.org/2000/svg' &&
        (container as Element).localName !== 'foreignObject')
        return null;
    return (container.nodeType === 9 ? container as unknown as Document : container.ownerDocument)?.head ?? null;
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

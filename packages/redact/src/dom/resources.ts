import { setProp } from './dom';
import { resourceURL } from '../core/resource-hints';
import { adoptResourceProps, createdStylesheets, getResources, insertResource, resourceAttribute, resourceSelector, type ResourceRoot } from './resource-store';
// Called only during commit. Resource nodes are shared by href and are not
// owned by a component's placement or unmount operations.
// The renderer has already checked this host's resource eligibility.
export function acquireResource(type: string, props: any, container: Node): Element {
    const script = type === 'script';
    const style = type === 'style';
    const ownerDocument = (container.ownerDocument || container) as Document;
    const tree = script ? ownerDocument : container.getRootNode();
    const root = (tree.nodeType === 9 || tree.nodeType === 11 ? tree : ownerDocument) as ResourceRoot;
    const href = script ? props.src : props.href;
    const resources = getResources(root);
    const key = resourceSelector(href, script ? 'script' : 'style');
    let node = resources.i.get(key);
    if (node)
        return node;
    const existing = !style && !script && root !== ownerDocument ? ownerDocument.querySelector(key) : null;
    node = existing && !createdStylesheets.has(existing) && !(existing as any)._p ? existing
        : root.querySelector(style ? 'style' + resourceAttribute('data-href~', href) : key) || undefined;
    if (node) {
        resources.i.set(key, node);
        return node;
    }
    const next = { ...props };
    if (!script) {
        next['data-precedence'] = props.precedence;
        delete next.precedence;
        if (style) {
            next['data-href'] = props.href;
            delete next.href;
        }
    }
    if (!style)
        adoptResourceProps(next, getResources(ownerDocument).p.get(key), script);
    node = ownerDocument.createElement(type);
    for (const name in next) {
        setProp(node, name, name === 'href' || name === 'src' ? resourceURL(next[name]) : next[name], undefined, false);
    }
    if (style && next.dangerouslySetInnerHTML == null && isTextContent(next.children))
        node.textContent = '' + next.children;
    resources.i.set(key, node);
    insertResource(node, script ? undefined : props.precedence, root);
    return node;
}
import { isTextContent } from '../core/functions';

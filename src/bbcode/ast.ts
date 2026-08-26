/** The document model produced by the parser. */

import { ResolvedTag } from './resolver';

export interface NodeBase {
    readonly start: number;
    readonly end: number;
}

export interface TextNode extends NodeBase {
    readonly type: 'text';
    readonly value: string;
    /** True when the text came from a `raw` tag body such as `[code]`. */
    readonly raw: boolean;
}

/** A tag-shaped run of source that no dialect or custom tag claims. */
export interface UnknownNode extends NodeBase {
    readonly type: 'unknown';
    readonly name: string;
    readonly closing: boolean;
    /** The literal source, so it can be shown verbatim. */
    readonly source: string;
}

export interface TagNode extends NodeBase {
    readonly type: 'tag';
    readonly name: string;
    readonly rawName: string;
    readonly tag: ResolvedTag;
    readonly value?: string;
    readonly params: Readonly<Record<string, string>>;
    children: Node[];
    /** Offset of the first character after the opening tag. */
    readonly contentStart: number;
    /** Offset of the first character of the closing tag, or of `end`. */
    contentEnd: number;
    /** True when an explicit closing tag was found. */
    closed: boolean;
    /** True when another tag or the end of the document closed this one. */
    implicitlyClosed: boolean;
}

export interface RootNode extends NodeBase {
    readonly type: 'root';
    children: Node[];
}

export type Node = TextNode | UnknownNode | TagNode;
export type AnyNode = Node | RootNode;

export function isTag(node: AnyNode): node is TagNode {
    return node.type === 'tag';
}

export function isText(node: AnyNode): node is TextNode {
    return node.type === 'text';
}

/** Depth-first walk over the tree. Return `false` from `visit` to skip children. */
export function walk(node: AnyNode, visit: (node: AnyNode, parents: AnyNode[]) => boolean | void): void {
    const parents: AnyNode[] = [];
    const step = (current: AnyNode): void => {
        if (visit(current, parents) === false) {
            return;
        }
        if (current.type === 'tag' || current.type === 'root') {
            parents.push(current);
            for (const child of current.children) {
                step(child);
            }
            parents.pop();
        }
    };
    step(node);
}

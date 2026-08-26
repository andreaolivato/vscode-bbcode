/**
 * Builds a document tree from a BBCode token stream.
 *
 * The parser never throws and never rejects input. Anything it cannot make
 * sense of is preserved verbatim and reported as a {@link Problem}, which is
 * what the diagnostics provider surfaces in the editor.
 */

import { Node, RootNode, TagNode } from './ast';
import { Token, tokenize } from './lexer';
import { TagResolver, createResolver } from './resolver';

export type ProblemCode =
    | 'unclosed-tag'
    | 'stray-close'
    | 'unknown-tag'
    | 'misplaced-tag';

export type ProblemSeverity = 'warning' | 'information' | 'hint';

export interface Problem {
    readonly code: ProblemCode;
    readonly severity: ProblemSeverity;
    readonly message: string;
    readonly start: number;
    readonly end: number;
    readonly tagName: string;
}

export interface ParseResult {
    readonly root: RootNode;
    readonly problems: readonly Problem[];
    readonly source: string;
}

export interface ParseOptions {
    readonly resolver?: TagResolver;
}

export function parse(source: string, options: ParseOptions = {}): ParseResult {
    const resolver = options.resolver ?? createResolver();
    const tokens = tokenize(source, { isRawTag: (name) => resolver.isRawTag(name) });
    return parseTokens(source, tokens, resolver);
}

function parseTokens(source: string, tokens: readonly Token[], resolver: TagResolver): ParseResult {
    const problems: Problem[] = [];
    const root: RootNode = { type: 'root', children: [], start: 0, end: source.length };
    /** Innermost node last. `root` always sits at the bottom. */
    const stack: (RootNode | TagNode)[] = [root];

    const top = (): RootNode | TagNode => stack[stack.length - 1];
    const append = (node: Node): void => {
        top().children.push(node);
    };

    /** Closes `count` tags from the top of the stack, reporting each as unclosed. */
    const closeImplicitly = (count: number, at: number): void => {
        for (let i = 0; i < count; i++) {
            const node = stack.pop() as TagNode;
            node.contentEnd = at;
            (node as { end: number }).end = at;
            node.implicitlyClosed = true;
            problems.push({
                code: 'unclosed-tag',
                severity: 'warning',
                message: `[${node.rawName}] is never closed. Add [/${node.name}].`,
                start: node.start,
                end: node.contentStart,
                tagName: node.name,
            });
        }
    };

    for (const token of tokens) {
        if (token.type === 'text') {
            append({
                type: 'text',
                value: token.value,
                raw: token.raw,
                start: token.start,
                end: token.end,
            });
            continue;
        }

        if (token.type === 'open') {
            const tag = resolver.resolve(token.name);
            if (!tag) {
                problems.push({
                    code: 'unknown-tag',
                    severity: 'hint',
                    message: `[${token.rawName}] is not a known tag in the "${resolver.dialect}" dialect.`,
                    start: token.start,
                    end: token.end,
                    tagName: token.name,
                });
                append({
                    type: 'unknown',
                    name: token.name,
                    closing: false,
                    source: source.slice(token.start, token.end),
                    start: token.start,
                    end: token.end,
                });
                continue;
            }

            // Tags such as [*] are closed by the next sibling item.
            for (;;) {
                const current = top();
                if (current.type !== 'tag' || !current.tag.closedBy?.includes(tag.name)) {
                    break;
                }
                stack.pop();
                current.contentEnd = token.start;
                (current as { end: number }).end = token.start;
                current.implicitlyClosed = true;
            }

            if (tag.parents && !hasAncestor(stack, tag.parents)) {
                problems.push({
                    code: 'misplaced-tag',
                    severity: 'information',
                    message: `[${token.rawName}] is normally used inside ${formatList(tag.parents)}.`,
                    start: token.start,
                    end: token.end,
                    tagName: token.name,
                });
            }

            const node: TagNode = {
                type: 'tag',
                name: tag.name,
                rawName: token.rawName,
                tag,
                value: token.value,
                params: token.params,
                children: [],
                start: token.start,
                end: token.end,
                contentStart: token.end,
                contentEnd: token.end,
                closed: tag.kind === 'void',
                implicitlyClosed: false,
            };
            append(node);

            if (tag.kind !== 'void') {
                stack.push(node);
            }
            continue;
        }

        // token.type === 'close'
        const tag = resolver.resolve(token.name);
        const matchIndex = tag ? findOpen(stack, tag.name) : -1;

        if (matchIndex === -1) {
            problems.push(
                tag
                    ? {
                          code: 'stray-close',
                          severity: 'warning',
                          message: `[/${token.rawName}] has no matching opening tag.`,
                          start: token.start,
                          end: token.end,
                          tagName: token.name,
                      }
                    : {
                          code: 'unknown-tag',
                          severity: 'hint',
                          message: `[/${token.rawName}] is not a known tag in the "${resolver.dialect}" dialect.`,
                          start: token.start,
                          end: token.end,
                          tagName: token.name,
                      },
            );
            append({
                type: 'unknown',
                name: token.name,
                closing: true,
                source: source.slice(token.start, token.end),
                start: token.start,
                end: token.end,
            });
            continue;
        }

        closeImplicitly(stack.length - 1 - matchIndex, token.start);

        const node = stack.pop() as TagNode;
        node.contentEnd = token.start;
        (node as { end: number }).end = token.end;
        node.closed = true;
    }

    closeImplicitly(stack.length - 1, source.length);
    return { root, problems, source };
}

function findOpen(stack: readonly (RootNode | TagNode)[], name: string): number {
    for (let i = stack.length - 1; i > 0; i--) {
        const node = stack[i];
        if (node.type === 'tag' && node.name === name) {
            return i;
        }
    }
    return -1;
}

function hasAncestor(stack: readonly (RootNode | TagNode)[], names: readonly string[]): boolean {
    for (let i = stack.length - 1; i > 0; i--) {
        const node = stack[i];
        if (node.type === 'tag' && names.includes(node.name)) {
            return true;
        }
    }
    return false;
}

function formatList(names: readonly string[]): string {
    const tags = names.map((name) => `[${name}]`);
    if (tags.length === 1) {
        return tags[0];
    }
    return `${tags.slice(0, -1).join(', ')} or ${tags[tags.length - 1]}`;
}

/**
 * Returns the chain of open tags at `offset`, outermost first.
 * Used by IntelliSense to suggest the right closing tag.
 */
export function openTagsAt(result: ParseResult, offset: number): TagNode[] {
    const chain: TagNode[] = [];
    const visit = (children: readonly Node[]): void => {
        for (const child of children) {
            if (child.type !== 'tag') {
                continue;
            }
            if (offset >= child.contentStart && offset <= child.contentEnd) {
                chain.push(child);
                visit(child.children);
                return;
            }
        }
    };
    visit(result.root.children);
    return chain;
}

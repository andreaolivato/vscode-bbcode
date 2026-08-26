/** Folding ranges and the document outline, both derived from the parse tree. */

import * as vscode from 'vscode';

import { AnyNode, TagNode, walk } from '../bbcode/ast';
import { DocumentModel } from '../documentModel';

export class BBCodeFoldingProvider implements vscode.FoldingRangeProvider {
    constructor(private readonly model: DocumentModel) {}

    provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
        const ranges: vscode.FoldingRange[] = [];

        walk(this.model.get(document).root, (node) => {
            if (node.type !== 'tag' || node.tag.kind === 'void') {
                return;
            }
            const start = document.positionAt(node.start).line;
            const end = document.positionAt(node.end).line;
            if (end > start) {
                ranges.push(new vscode.FoldingRange(start, end - 1, foldingKind(node)));
            }
        });

        return ranges;
    }
}

function foldingKind(node: TagNode): vscode.FoldingRangeKind | undefined {
    if (node.name === 'quote') {
        return vscode.FoldingRangeKind.Comment;
    }
    return undefined;
}

/** Tags that are worth showing in the outline and the breadcrumb bar. */
const OUTLINE_TAGS: Record<string, vscode.SymbolKind> = {
    h1: vscode.SymbolKind.String,
    h2: vscode.SymbolKind.String,
    h3: vscode.SymbolKind.String,
    h4: vscode.SymbolKind.String,
    h5: vscode.SymbolKind.String,
    h6: vscode.SymbolKind.String,
    quote: vscode.SymbolKind.Namespace,
    spoiler: vscode.SymbolKind.Enum,
    box: vscode.SymbolKind.Struct,
    code: vscode.SymbolKind.Module,
    php: vscode.SymbolKind.Module,
    list: vscode.SymbolKind.Array,
    ul: vscode.SymbolKind.Array,
    ol: vscode.SymbolKind.Array,
    table: vscode.SymbolKind.Object,
};

export class BBCodeSymbolProvider implements vscode.DocumentSymbolProvider {
    constructor(private readonly model: DocumentModel) {}

    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const root = this.model.get(document).root;
        const stack: vscode.DocumentSymbol[][] = [[]];
        const owners: AnyNode[] = [root];

        walk(root, (node, parents) => {
            // Unwind to the depth of this node's parent before adding it.
            while (owners.length > 1 && owners[owners.length - 1] !== parents[parents.length - 1]) {
                owners.pop();
                stack.pop();
            }

            if (node.type !== 'tag') {
                return;
            }
            const kind = OUTLINE_TAGS[node.name];
            if (kind === undefined) {
                return;
            }

            const range = new vscode.Range(document.positionAt(node.start), document.positionAt(node.end));
            const selection = new vscode.Range(
                document.positionAt(node.start),
                document.positionAt(node.contentStart),
            );
            const symbol = new vscode.DocumentSymbol(
                labelFor(node, document),
                detailFor(node),
                kind,
                range,
                selection,
            );
            stack[stack.length - 1].push(symbol);

            owners.push(node);
            stack.push(symbol.children);
        });

        return stack[0];
    }
}

function labelFor(node: TagNode, document: vscode.TextDocument): string {
    if (/^h[1-6]$/.test(node.name)) {
        const text = document.getText(
            new vscode.Range(document.positionAt(node.contentStart), document.positionAt(node.contentEnd)),
        );
        return collapse(text) || node.name.toUpperCase();
    }
    if (node.value) {
        return `${node.name}: ${collapse(node.value)}`;
    }
    return node.name;
}

function detailFor(node: TagNode): string {
    if (!node.closed) {
        return 'unclosed';
    }
    return '';
}

function collapse(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, 80);
}

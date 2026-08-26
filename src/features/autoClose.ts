/**
 * Inserts the matching closing tag after `]` is typed, the way the built-in
 * HTML support closes elements.
 */

import * as vscode from 'vscode';

import { DocumentModel } from '../documentModel';

/** Matches an opening tag that ends exactly at the caret. */
const OPENING_TAG = /\[([A-Za-z*][A-Za-z0-9*_.-]*)(?:=[^\]]*|\s[^\]]*)?\]$/;

export class AutoCloseTagController implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    /** Guards against reacting to the edit this controller just made. */
    private applying = false;

    constructor(private readonly model: DocumentModel) {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => void this.onChange(event)),
        );
    }

    private async onChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
        if (this.applying || event.document.languageId !== 'bbcode') {
            return;
        }
        // Undo and redo replay the closing tag on their own.
        if (event.reason !== undefined) {
            return;
        }
        if (!this.model.config(event.document).autoCloseTags) {
            return;
        }

        const change = event.contentChanges[0];
        if (event.contentChanges.length !== 1 || change.text !== ']' || change.rangeLength !== 0) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) {
            return;
        }

        const caret = event.document.positionAt(change.rangeOffset + 1);
        const before = event.document.getText(new vscode.Range(caret.with(undefined, 0), caret));
        const match = OPENING_TAG.exec(before);
        if (!match) {
            return;
        }

        const tag = this.model.resolver(event.document).resolve(match[1]);
        if (!tag || tag.kind === 'void' || tag.kind === 'listItem') {
            return;
        }

        const closing = `[/${tag.name}]`;
        const after = event.document.getText(
            new vscode.Range(caret, event.document.lineAt(caret.line).range.end),
        );
        if (after.trimStart().startsWith(closing)) {
            return;
        }

        this.applying = true;
        try {
            await editor.edit(
                (builder) => builder.insert(caret, closing),
                { undoStopBefore: false, undoStopAfter: true },
            );
            // Leave the caret between the two tags.
            editor.selection = new vscode.Selection(caret, caret);
        } finally {
            this.applying = false;
        }
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}

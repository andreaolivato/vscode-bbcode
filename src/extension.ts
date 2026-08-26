/** Extension entry point: wires the language features and the preview together. */

import * as vscode from 'vscode';

import { DocumentModel } from './documentModel';
import { AutoCloseTagController } from './features/autoClose';
import { BBCodeColorProvider } from './features/colors';
import { BBCodeCompletionProvider, COMPLETION_TRIGGERS } from './features/completion';
import { DiagnosticsController } from './features/diagnostics';
import { registerEditingCommands } from './features/editing';
import { BBCodeHoverProvider } from './features/hover';
import { BBCodeFoldingProvider, BBCodeSymbolProvider } from './features/structure';
import { registerExportCommands } from './preview/export';
import { PreviewManager } from './preview/previewManager';

export const LANGUAGE_ID = 'bbcode';
const SELECTOR: vscode.DocumentSelector = [
    { language: LANGUAGE_ID, scheme: 'file' },
    { language: LANGUAGE_ID, scheme: 'untitled' },
    { language: LANGUAGE_ID, scheme: 'vscode-vfs' },
];

export function activate(context: vscode.ExtensionContext): void {
    const model = new DocumentModel();
    const previews = new PreviewManager(context, model);

    context.subscriptions.push(
        model,
        previews,
        new DiagnosticsController(model),
        new AutoCloseTagController(model),

        vscode.languages.registerCompletionItemProvider(
            SELECTOR,
            new BBCodeCompletionProvider(model),
            ...COMPLETION_TRIGGERS,
        ),
        vscode.languages.registerHoverProvider(SELECTOR, new BBCodeHoverProvider(model)),
        vscode.languages.registerFoldingRangeProvider(SELECTOR, new BBCodeFoldingProvider(model)),
        vscode.languages.registerDocumentSymbolProvider(SELECTOR, new BBCodeSymbolProvider(model)),
        vscode.languages.registerColorProvider(SELECTOR, new BBCodeColorProvider()),

        ...registerEditingCommands(model),
        ...registerExportCommands(context, model),
        ...registerPreviewCommands(previews),
    );
}

export function deactivate(): void {
    // Everything is registered through `context.subscriptions`.
}

function registerPreviewCommands(previews: PreviewManager): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('bbcode.showPreview', (resource?: vscode.Uri) => {
            const target = resolveResource(resource);
            if (target) {
                previews.show(target.uri, vscode.ViewColumn.Active, target.line);
            }
        }),
        vscode.commands.registerCommand('bbcode.showPreviewToSide', (resource?: vscode.Uri) => {
            const target = resolveResource(resource);
            if (target) {
                previews.show(target.uri, vscode.ViewColumn.Beside, target.line);
            }
        }),
        vscode.commands.registerCommand('bbcode.showSource', () => {
            void previews.activePreview()?.showSource();
        }),
        vscode.commands.registerCommand('bbcode.refreshPreview', () => {
            previews.refreshActive();
        }),
    ];
}

/** The document a preview command should act on, plus the line to open at. */
function resolveResource(resource?: vscode.Uri): { uri: vscode.Uri; line: number } | undefined {
    if (resource) {
        const editor = vscode.window.visibleTextEditors.find(
            (candidate) => candidate.document.uri.toString() === resource.toString(),
        );
        return { uri: resource, line: editor?.selection.active.line ?? 0 };
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.window.showInformationMessage('Open a BBCode file to preview it.');
        return undefined;
    }
    return { uri: editor.document.uri, line: editor.selection.active.line };
}

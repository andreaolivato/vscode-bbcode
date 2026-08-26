/** Commands that turn a BBCode document into HTML outside the preview. */

import * as vscode from 'vscode';

import { render } from '../bbcode/renderer';
import { escapeHtml } from '../bbcode/sanitize';
import { getConfig } from '../config';
import { DocumentModel } from '../documentModel';

export function registerExportCommands(
    context: vscode.ExtensionContext,
    model: DocumentModel,
): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('bbcode.copyAsHtml', () => copyAsHtml(model)),
        vscode.commands.registerCommand('bbcode.exportHtml', () => exportHtml(context, model)),
    ];
}

/** The rendered fragment for a document, without any preview chrome. */
function renderFragment(document: vscode.TextDocument, model: DocumentModel): string {
    const config = getConfig(document.uri);
    return render(model.get(document), {
        dialect: config.dialect,
        newlineMode: config.preview.newlineMode,
        autoLink: config.preview.autoLink,
        emoticons: config.preview.emoticons,
        remoteImages: config.preview.remoteImages,
        embedVideos: config.preview.embedVideos,
        unknownTags: config.preview.unknownTags,
        sourceMap: false,
    });
}

async function copyAsHtml(model: DocumentModel): Promise<void> {
    const document = activeBBCodeDocument();
    if (!document) {
        return;
    }
    await vscode.env.clipboard.writeText(renderFragment(document, model));
    void vscode.window.setStatusBarMessage('BBCode: HTML copied to the clipboard.', 3000);
}

async function exportHtml(context: vscode.ExtensionContext, model: DocumentModel): Promise<void> {
    const document = activeBBCodeDocument();
    if (!document) {
        return;
    }

    const name = document.uri.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'document';
    const target = await vscode.window.showSaveDialog({
        title: 'Export as HTML',
        defaultUri: vscode.Uri.joinPath(vscode.Uri.joinPath(document.uri, '..'), `${name}.html`),
        filters: { HTML: ['html', 'htm'] },
    });
    if (!target) {
        return;
    }

    const css = await readStylesheet(context);
    const html = standaloneDocument(name, renderFragment(document, model), css);
    await vscode.workspace.fs.writeFile(target, Buffer.from(html, 'utf8'));

    const open = await vscode.window.showInformationMessage(
        `Exported to ${target.path.split('/').pop()}.`,
        'Open File',
    );
    if (open) {
        await vscode.commands.executeCommand('vscode.open', target);
    }
}

function activeBBCodeDocument(): vscode.TextDocument | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.window.showWarningMessage('Open a BBCode document first.');
        return undefined;
    }
    return editor.document;
}

async function readStylesheet(context: vscode.ExtensionContext): Promise<string> {
    try {
        const uri = vscode.Uri.joinPath(context.extensionUri, 'media', 'preview.css');
        return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    } catch {
        return '';
    }
}

/**
 * A self-contained page: the preview stylesheet inlined, plus the few lines of
 * script the copy buttons need.
 */
function standaloneDocument(title: string, body: string, css: string): string {
    return `<!DOCTYPE html>
<html lang="en" class="bb-theme-auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
</head>
<body class="bb-preview bb-standalone">
<main class="bb-content">
${body}
</main>
<script>
document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-bb-copy]');
    if (!button) { return; }
    var code = button.closest('.bb-code').querySelector('code');
    navigator.clipboard.writeText(code.textContent).then(function () {
        button.textContent = 'Copied';
        setTimeout(function () { button.textContent = 'Copy'; }, 1500);
    });
});
</script>
</body>
</html>
`;
}

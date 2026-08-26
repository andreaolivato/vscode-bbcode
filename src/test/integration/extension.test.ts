import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'andreaolivato.bbcode-preview';

async function openSample(name: string): Promise<vscode.TextDocument> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'the test workspace should be open');
    const document = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(folder.uri, name),
    );
    await vscode.window.showTextDocument(document);
    return document;
}

/** Polls until `check` returns a value, or gives up. */
async function waitFor<T>(check: () => T | undefined, timeoutMs = 8000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = check();
        if (value !== undefined) {
            return value;
        }
        if (Date.now() > deadline) {
            throw new Error('timed out waiting for a condition');
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

describe('activation', () => {
    it('the extension activates', async () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, `${EXTENSION_ID} should be installed`);
        await extension.activate();
        assert.equal(extension.isActive, true);
    });

    it('bbcode files get the bbcode language id', async () => {
        const document = await openSample('demo.bbcode');
        assert.equal(document.languageId, 'bbcode');
    });

    it('every contributed command is registered', async () => {
        const registered = new Set(await vscode.commands.getCommands(true));
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        const contributed: Array<{ command: string }> =
            extension?.packageJSON?.contributes?.commands ?? [];

        assert.ok(contributed.length > 0);
        for (const { command } of contributed) {
            assert.ok(registered.has(command), `${command} is not registered`);
        }
    });
});

describe('language features', () => {
    it('suggests tag names after an opening bracket', async () => {
        const document = await openSample('demo.bbcode');
        const editor = vscode.window.activeTextEditor!;
        const end = document.lineAt(document.lineCount - 1).range.end;

        await editor.edit((builder) => builder.insert(end, '\n[qu'));
        const position = new vscode.Position(document.lineCount - 1, 3);

        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            document.uri,
            position,
        );
        const labels = list.items.map((item) =>
            typeof item.label === 'string' ? item.label : item.label.label,
        );
        assert.ok(labels.includes('quote'), `expected "quote" in ${labels.slice(0, 10).join(', ')}`);
    });

    it('suggests the innermost open tag after a closing slash', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'bbcode',
            content: '[quote][b]text[/',
        });
        await vscode.window.showTextDocument(document);

        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            document.uri,
            new vscode.Position(0, 16),
        );
        const labels = list.items.map((item) =>
            typeof item.label === 'string' ? item.label : item.label.label,
        );
        assert.equal(labels[0], '/b', `expected "/b" first, got ${labels.join(', ')}`);
    });

    it('shows documentation on hover', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'bbcode',
            content: '[quote]hi[/quote]',
        });
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            document.uri,
            new vscode.Position(0, 3),
        );
        assert.ok(hovers.length > 0, 'expected a hover');
    });

    it('reports unclosed tags as diagnostics', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'bbcode',
            content: '[b]never closed',
        });
        await vscode.window.showTextDocument(document);

        const diagnostics = await waitFor(() => {
            const found = vscode.languages.getDiagnostics(document.uri);
            return found.length > 0 ? found : undefined;
        });
        assert.equal(diagnostics[0].code, 'unclosed-tag');
        assert.equal(diagnostics[0].severity, vscode.DiagnosticSeverity.Warning);
    });

    it('builds an outline from headings and quotes', async () => {
        const document = await openSample('demo.bbcode');
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri,
        );
        assert.ok(symbols.length > 0, 'expected outline entries');
        assert.ok(symbols.some((symbol) => symbol.name.includes('BBCode Preview')));
    });

    it('offers folding ranges for multi-line tags', async () => {
        const document = await openSample('demo.bbcode');
        const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
            'vscode.executeFoldingRangeProvider',
            document.uri,
        );
        assert.ok(ranges.length > 0, 'expected folding ranges');
    });

    it('exposes colour values to the colour picker', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'bbcode',
            content: '[color=#ff8800]x[/color]',
        });
        const colors = await vscode.commands.executeCommand<vscode.ColorInformation[]>(
            'vscode.executeDocumentColorProvider',
            document.uri,
        );
        assert.equal(colors.length, 1);
        assert.equal(Math.round(colors[0].color.red * 255), 255);
    });
});

describe('commands', () => {
    it('toggling bold wraps and unwraps the selection', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'bbcode',
            content: 'hello',
        });
        const editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 5);

        await vscode.commands.executeCommand('bbcode.toggleBold');
        await waitFor(() => (document.getText() === '[b]hello[/b]' ? true : undefined));

        editor.selection = new vscode.Selection(0, 0, 0, document.lineAt(0).text.length);
        await vscode.commands.executeCommand('bbcode.toggleBold');
        await waitFor(() => (document.getText() === 'hello' ? true : undefined));
    });

    it('copy as HTML puts rendered markup on the clipboard', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'bbcode',
            content: '[b]bold[/b]',
        });
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('bbcode.copyAsHtml');
        const clipboard = await vscode.env.clipboard.readText();
        assert.equal(clipboard, '<strong>bold</strong>');
    });

    it('opening the preview creates a webview tab', async () => {
        const document = await openSample('demo.bbcode');
        await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

        await vscode.commands.executeCommand('bbcode.showPreviewToSide');

        const tab = await waitFor(() =>
            vscode.window.tabGroups.all
                .flatMap((group) => group.tabs)
                .find((candidate) => candidate.label.startsWith('Preview ')),
        );
        assert.ok(tab.input instanceof vscode.TabInputWebview);

        // A second call must reuse the existing preview rather than stack one up.
        await vscode.commands.executeCommand('bbcode.showPreviewToSide');
        const previews = vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .filter((candidate) => candidate.label.startsWith('Preview '));
        assert.equal(previews.length, 1);

        await vscode.window.tabGroups.close(previews);
    });
});

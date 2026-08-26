/** Editing commands: toggling formatting, inserting links, wrapping selections. */

import * as vscode from 'vscode';

import { CATEGORY_LABELS, TAG_DEFINITIONS, TagDefinition, isInDialect } from '../bbcode/tags';
import { DocumentModel } from '../documentModel';

export function registerEditingCommands(model: DocumentModel): vscode.Disposable[] {
    return [
        vscode.commands.registerTextEditorCommand('bbcode.toggleBold', (editor) => toggle(editor, 'b')),
        vscode.commands.registerTextEditorCommand('bbcode.toggleItalic', (editor) => toggle(editor, 'i')),
        vscode.commands.registerTextEditorCommand('bbcode.toggleUnderline', (editor) => toggle(editor, 'u')),
        vscode.commands.registerTextEditorCommand('bbcode.toggleStrikethrough', (editor) => toggle(editor, 's')),
        vscode.commands.registerTextEditorCommand('bbcode.insertLink', (editor) => void insertLink(editor)),
        vscode.commands.registerTextEditorCommand('bbcode.insertImage', (editor) => void insertImage(editor)),
        vscode.commands.registerTextEditorCommand('bbcode.insertColor', (editor) => void insertColor(editor)),
        vscode.commands.registerTextEditorCommand('bbcode.wrapWithTag', (editor) =>
            void wrapWithTag(editor, model),
        ),
    ];
}

/**
 * Wraps each selection in `[tag]…[/tag]`, or unwraps it when it is already
 * wrapped. An empty selection inserts the pair and puts the caret inside.
 */
function toggle(editor: vscode.TextEditor, tag: string): void {
    const open = `[${tag}]`;
    const close = `[/${tag}]`;
    const selections: vscode.Selection[] = [];

    void editor
        .edit((builder) => {
            for (const selection of editor.selections) {
                const text = editor.document.getText(selection);

                if (text.toLowerCase().startsWith(open) && text.toLowerCase().endsWith(close)) {
                    builder.replace(selection, text.slice(open.length, text.length - close.length));
                    continue;
                }

                const surrounding = surroundingRange(editor.document, selection, open, close);
                if (surrounding) {
                    builder.replace(surrounding, text);
                    continue;
                }

                builder.replace(selection, `${open}${text}${close}`);
            }
        })
        .then(() => {
            if (selections.length) {
                editor.selections = selections;
            }
        });
}

/** The range covering `selection` plus an `[tag]`/`[/tag]` pair around it. */
function surroundingRange(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    open: string,
    close: string,
): vscode.Range | undefined {
    const start = document.offsetAt(selection.start);
    const end = document.offsetAt(selection.end);
    const before = document.getText(
        new vscode.Range(document.positionAt(Math.max(0, start - open.length)), selection.start),
    );
    const after = document.getText(
        new vscode.Range(selection.end, document.positionAt(end + close.length)),
    );

    if (before.toLowerCase() === open && after.toLowerCase() === close) {
        return new vscode.Range(
            document.positionAt(start - open.length),
            document.positionAt(end + close.length),
        );
    }
    return undefined;
}

async function insertLink(editor: vscode.TextEditor): Promise<void> {
    const selected = editor.document.getText(editor.selection);
    const url = await vscode.window.showInputBox({
        title: 'Insert link',
        prompt: 'Address to link to',
        value: /^\w+:\/\//.test(selected) ? selected : 'https://',
        validateInput: (value) => (value.trim() ? undefined : 'Enter a URL.'),
    });
    if (!url) {
        return;
    }

    const label = /^\w+:\/\//.test(selected) ? '' : selected;
    const snippet = label
        ? new vscode.SnippetString(`[url=${url}]${label}[/url]`)
        : new vscode.SnippetString(`[url=${url}]\${1:${url}}[/url]`);
    await editor.insertSnippet(snippet, editor.selection);
}

async function insertImage(editor: vscode.TextEditor): Promise<void> {
    const selected = editor.document.getText(editor.selection).trim();
    const url = await vscode.window.showInputBox({
        title: 'Insert image',
        prompt: 'Image address',
        value: selected || 'https://',
        validateInput: (value) => (value.trim() ? undefined : 'Enter an image URL.'),
    });
    if (!url) {
        return;
    }
    await editor.insertSnippet(new vscode.SnippetString(`[img]${url}[/img]$0`), editor.selection);
}

const COLOR_CHOICES = [
    { label: 'Red', value: '#e03131' },
    { label: 'Orange', value: '#f76707' },
    { label: 'Yellow', value: '#f59f00' },
    { label: 'Green', value: '#2f9e44' },
    { label: 'Teal', value: '#0c8599' },
    { label: 'Blue', value: '#1971c2' },
    { label: 'Purple', value: '#7048e8' },
    { label: 'Pink', value: '#c2255c' },
    { label: 'Grey', value: '#868e96' },
    { label: 'Black', value: '#000000' },
];

async function insertColor(editor: vscode.TextEditor): Promise<void> {
    const picked = await vscode.window.showQuickPick(
        [
            ...COLOR_CHOICES.map((choice) => ({ label: choice.label, description: choice.value })),
            { label: 'Custom…', description: 'Enter a hex value or colour name' },
        ],
        { title: 'Insert colour', placeHolder: 'Choose a colour' },
    );
    if (!picked) {
        return;
    }

    let value = picked.description ?? '';
    if (picked.label === 'Custom…') {
        const custom = await vscode.window.showInputBox({
            title: 'Colour',
            prompt: 'Hex value or CSS colour name',
            value: '#',
        });
        if (!custom) {
            return;
        }
        value = custom.trim();
    }

    const selected = editor.document.getText(editor.selection);
    await editor.insertSnippet(
        new vscode.SnippetString(`[color=${value}]${selected ? escapeSnippet(selected) : '${1:text}'}[/color]$0`),
        editor.selection,
    );
}

async function wrapWithTag(editor: vscode.TextEditor, model: DocumentModel): Promise<void> {
    const dialect = model.config(editor.document).dialect;
    const candidates = TAG_DEFINITIONS.filter(
        (def) => isInDialect(def, dialect) && def.kind !== 'void' && def.kind !== 'listItem',
    );

    const picked = await vscode.window.showQuickPick(
        candidates.map((def) => ({
            label: `[${def.name}]`,
            description: CATEGORY_LABELS[def.category],
            detail: def.description,
            def,
        })),
        { title: 'Wrap selection with tag', matchOnDetail: true, placeHolder: 'Choose a tag' },
    );
    if (!picked) {
        return;
    }

    const def: TagDefinition = picked.def;
    const selected = editor.document.getText(editor.selection);
    const opening = def.value ? `[${def.name}=\${1:${def.value.name}}]` : `[${def.name}]`;
    await editor.insertSnippet(
        new vscode.SnippetString(
            `${opening}${selected ? escapeSnippet(selected) : '${2:text}'}[/${def.name}]$0`,
        ),
        editor.selection,
    );
}

/** Escapes the characters that a snippet string treats specially. */
function escapeSnippet(text: string): string {
    return text.replace(/([$}\\])/g, '\\$1');
}

/** Tag, parameter and value suggestions. */

import * as vscode from 'vscode';

import { CompletionContext, analyzeCompletion } from '../bbcode/completionContext';
import { openTagsAt } from '../bbcode/parser';
import { CATEGORY_LABELS, TagDefinition, snippetFor, tagsForDialect } from '../bbcode/tags';
import { DocumentModel } from '../documentModel';

export const COMPLETION_TRIGGERS = ['[', '/', '=', ' '];

export class BBCodeCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly model: DocumentModel) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const config = this.model.config(document);
        if (!config.suggestEnabled) {
            return [];
        }

        const line = document.lineAt(position.line).text.slice(0, position.character);
        const context: CompletionContext = analyzeCompletion(line);
        if (context.kind === 'none') {
            return [];
        }

        const lineStart = document.offsetAt(position.with(undefined, 0));
        const replace = new vscode.Range(position.with(undefined, context.start), position);

        switch (context.kind) {
            case 'closingTag':
                return this.closingTags(document, lineStart + context.start, replace);
            case 'tagName':
                return this.tagNames(document, replace);
            case 'value':
                return this.values(document, context.tag, replace);
            case 'paramName':
                return this.paramNames(document, context.tag, replace);
            case 'paramValue':
                return this.paramValues(document, context.tag, context.param, replace);
        }
    }

    // ------------------------------------------------------------------ parts

    private tagNames(document: vscode.TextDocument, replace: vscode.Range): vscode.CompletionItem[] {
        const config = this.model.config(document);
        const items: vscode.CompletionItem[] = [];

        for (const def of tagsForDialect(config.dialect)) {
            items.push(this.tagItem(def, replace));
        }

        for (const custom of config.customTags) {
            const item = new vscode.CompletionItem(custom.name, vscode.CompletionItemKind.Snippet);
            item.detail = 'Custom tag';
            item.documentation = new vscode.MarkdownString(custom.description ?? 'Defined in `bbcode.customTags`.');
            item.insertText = new vscode.SnippetString(
                custom.selfClosing ? `${custom.name}]$0` : `${custom.name}]$0[/${custom.name}]`,
            );
            item.range = replace;
            item.sortText = `0_${custom.name}`;
            items.push(item);
        }

        return items;
    }

    private tagItem(def: TagDefinition, replace: vscode.Range): vscode.CompletionItem {
        const item = new vscode.CompletionItem(def.name, vscode.CompletionItemKind.Snippet);
        item.detail = CATEGORY_LABELS[def.category];
        item.documentation = documentationFor(def);
        item.insertText = new vscode.SnippetString(snippetFor(def));
        item.range = replace;
        item.filterText = def.name;
        item.sortText = `1_${def.category}_${def.name}`;
        if (def.aliases?.length) {
            item.commitCharacters = [']'];
        }
        return item;
    }

    private closingTags(
        document: vscode.TextDocument,
        offset: number,
        replace: vscode.Range,
    ): vscode.CompletionItem[] {
        const open = openTagsAt(this.model.get(document), offset);
        const items: vscode.CompletionItem[] = [];

        // Innermost first: that is nearly always the one being closed.
        for (let i = open.length - 1, rank = 0; i >= 0; i--, rank++) {
            const node = open[i];
            if (node.tag.kind === 'void') {
                continue;
            }
            const item = new vscode.CompletionItem(`/${node.name}`, vscode.CompletionItemKind.Snippet);
            item.detail = rank === 0 ? 'Closes the innermost open tag' : `Closes [${node.name}]`;
            item.insertText = `/${node.name}]`;
            item.range = replace;
            item.filterText = `/${node.name}`;
            item.sortText = `0_${String(rank).padStart(3, '0')}`;
            item.preselect = rank === 0;
            items.push(item);
        }

        if (items.length === 0) {
            const config = this.model.config(document);
            for (const def of tagsForDialect(config.dialect)) {
                if (def.kind === 'void') {
                    continue;
                }
                const item = new vscode.CompletionItem(`/${def.name}`, vscode.CompletionItemKind.Snippet);
                item.insertText = `/${def.name}]`;
                item.range = replace;
                item.sortText = `1_${def.name}`;
                items.push(item);
            }
        }

        return items;
    }

    private values(
        document: vscode.TextDocument,
        tagName: string,
        replace: vscode.Range,
    ): vscode.CompletionItem[] {
        const def = this.model.resolver(document).resolve(tagName)?.definition;
        const values = def?.value?.values ?? [];
        return values.map((value, index) => {
            const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Value);
            item.detail = def?.value?.name;
            item.range = replace;
            item.sortText = String(index).padStart(3, '0');
            return item;
        });
    }

    private paramNames(
        document: vscode.TextDocument,
        tagName: string,
        replace: vscode.Range,
    ): vscode.CompletionItem[] {
        const def = this.model.resolver(document).resolve(tagName)?.definition;
        return (def?.params ?? []).map((param) => {
            const item = new vscode.CompletionItem(param.name, vscode.CompletionItemKind.Property);
            item.documentation = new vscode.MarkdownString(param.description);
            item.insertText = new vscode.SnippetString(`${param.name}=$0`);
            item.range = replace;
            return item;
        });
    }

    private paramValues(
        document: vscode.TextDocument,
        tagName: string,
        paramName: string,
        replace: vscode.Range,
    ): vscode.CompletionItem[] {
        const def = this.model.resolver(document).resolve(tagName)?.definition;
        const param = def?.params?.find((candidate) => candidate.name === paramName);
        return (param?.values ?? []).map((value) => {
            const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Value);
            item.range = replace;
            return item;
        });
    }
}

/** Markdown documentation shown next to a completion item and on hover. */
export function documentationFor(def: TagDefinition): vscode.MarkdownString {
    const parts = [def.description];

    if (def.aliases?.length) {
        parts.push(`\nAlso written as ${def.aliases.map((alias) => `\`[${alias}]\``).join(', ')}.`);
    }
    if (def.value) {
        parts.push(`\n**Value** — ${def.value.description}`);
    }
    if (def.params?.length) {
        parts.push(
            `\n**Parameters**\n${def.params.map((param) => `- \`${param.name}\` — ${param.description}`).join('\n')}`,
        );
    }
    parts.push(`\n\`\`\`bbcode\n${def.example}\n\`\`\``);

    const markdown = new vscode.MarkdownString(parts.join('\n'));
    markdown.supportHtml = false;
    return markdown;
}

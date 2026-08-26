/** Documentation on hover for the tag under the cursor. */

import * as vscode from 'vscode';

import { DocumentModel } from '../documentModel';
import { documentationFor } from './completion';

const TAG_AT_CURSOR = /\[\/?([A-Za-z*][A-Za-z0-9*_.-]*)(?:[=\s][^\]]*)?\]/g;

export class BBCodeHoverProvider implements vscode.HoverProvider {
    constructor(private readonly model: DocumentModel) {}

    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
        const line = document.lineAt(position.line).text;
        TAG_AT_CURSOR.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = TAG_AT_CURSOR.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character < start || position.character > end) {
                continue;
            }

            const resolver = this.model.resolver(document);
            const tag = resolver.resolve(match[1]);
            const range = new vscode.Range(position.line, start, position.line, end);

            if (tag?.definition) {
                return new vscode.Hover(documentationFor(tag.definition), range);
            }
            if (tag?.custom) {
                const markdown = new vscode.MarkdownString(
                    `${tag.custom.description ?? 'Custom tag.'}\n\nDefined in \`bbcode.customTags\`.`,
                );
                return new vscode.Hover(markdown, range);
            }
            return new vscode.Hover(
                new vscode.MarkdownString(
                    `\`[${match[1]}]\` is not a known tag in the **${resolver.dialect}** dialect.\n\nAdd it to \`bbcode.customTags\` or change \`bbcode.dialect\`.`,
                ),
                range,
            );
        }

        return undefined;
    }
}

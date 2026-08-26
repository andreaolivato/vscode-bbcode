/**
 * Caches one parse per document version.
 *
 * Diagnostics, folding, the outline, IntelliSense and the preview all want the
 * same tree; re-parsing for each of them on every keystroke would be wasteful.
 */

import * as vscode from 'vscode';

import { ParseResult, parse } from './bbcode/parser';
import { TagResolver, createResolver } from './bbcode/resolver';
import { BBCodeConfig, getConfig } from './config';

interface CacheEntry {
    readonly version: number;
    readonly configKey: string;
    readonly result: ParseResult;
    readonly resolver: TagResolver;
}

export class DocumentModel implements vscode.Disposable {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument((document) => this.cache.delete(document.uri.toString())),
            vscode.workspace.onDidChangeConfiguration(() => this.cache.clear()),
            vscode.workspace.onDidGrantWorkspaceTrust(() => this.cache.clear()),
        );
    }

    /** The parse tree for a document, reusing the previous result when possible. */
    get(document: vscode.TextDocument): ParseResult {
        return this.entry(document).result;
    }

    /** The tag resolver matching the document's dialect and custom tags. */
    resolver(document: vscode.TextDocument): TagResolver {
        return this.entry(document).resolver;
    }

    config(document: vscode.TextDocument): BBCodeConfig {
        return getConfig(document.uri);
    }

    private entry(document: vscode.TextDocument): CacheEntry {
        const key = document.uri.toString();
        const config = getConfig(document.uri);
        const configKey = `${config.dialect}|${JSON.stringify(config.customTags)}`;
        const cached = this.cache.get(key);

        if (cached && cached.version === document.version && cached.configKey === configKey) {
            return cached;
        }

        const resolver = createResolver(config.dialect, config.customTags);
        const entry: CacheEntry = {
            version: document.version,
            configKey,
            resolver,
            result: parse(document.getText(), { resolver }),
        };
        this.cache.set(key, entry);
        return entry;
    }

    dispose(): void {
        this.cache.clear();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}

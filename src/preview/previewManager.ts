/**
 * Owns the preview webviews: creating them, keeping them in sync with the
 * editor, and restoring them when VS Code restarts.
 */

import * as vscode from 'vscode';

import { RenderOptions, render } from '../bbcode/renderer';
import { PreviewConfig, getConfig } from '../config';
import { DocumentModel } from '../documentModel';
import { buildPreviewDocument } from './html';

export const PREVIEW_VIEW_TYPE = 'bbcode.preview';
const FOCUS_CONTEXT = 'bbcodePreviewFocus';
const UPDATE_DEBOUNCE_MS = 120;

interface PreviewState {
    readonly resource: string;
    readonly line?: number;
}

/** Messages the webview sends back to the extension. */
type InboundMessage =
    | { type: 'openLink'; href: string }
    | { type: 'scroll'; line: number }
    | { type: 'jumpToLine'; line: number }
    | { type: 'ready' };

export class PreviewManager implements vscode.Disposable {
    private readonly previews: BBCodePreview[] = [];
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly model: DocumentModel,
    ) {
        this.disposables.push(
            vscode.window.registerWebviewPanelSerializer(PREVIEW_VIEW_TYPE, {
                deserializeWebviewPanel: async (panel, state: PreviewState | undefined) => {
                    const resource = state?.resource ? vscode.Uri.parse(state.resource) : undefined;
                    if (!resource) {
                        panel.dispose();
                        return;
                    }
                    this.register(new BBCodePreview(panel, resource, this.context, this.model, state?.line ?? 0));
                },
            }),
            vscode.workspace.onDidChangeTextDocument((event) => {
                for (const preview of this.previews) {
                    preview.onDocumentChanged(event.document);
                }
            }),
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('bbcode')) {
                    for (const preview of this.previews) {
                        preview.refresh();
                    }
                }
            }),
            vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
                for (const preview of this.previews) {
                    preview.onEditorScrolled(event);
                }
            }),
        );
    }

    /** Opens (or focuses) a preview for `resource`. */
    show(resource: vscode.Uri, viewColumn: vscode.ViewColumn, line = 0): void {
        const existing = this.previews.find((preview) => preview.matches(resource));
        if (existing) {
            existing.reveal(viewColumn);
            existing.revealLine(line);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            PREVIEW_VIEW_TYPE,
            previewTitle(resource),
            { viewColumn, preserveFocus: true },
            {
                enableScripts: true,
                enableFindWidget: true,
                retainContextWhenHidden: true,
                localResourceRoots: localResourceRoots(this.context.extensionUri, resource),
            },
        );
        this.register(new BBCodePreview(panel, resource, this.context, this.model, line));
    }

    /** The preview currently holding focus, if any. */
    activePreview(): BBCodePreview | undefined {
        return this.previews.find((preview) => preview.isActive);
    }

    refreshActive(): void {
        this.activePreview()?.refresh();
    }

    private register(preview: BBCodePreview): void {
        this.previews.push(preview);
        preview.onViewStateChanged(() => this.updateFocusContext());
        preview.onDispose(() => {
            const index = this.previews.indexOf(preview);
            if (index !== -1) {
                this.previews.splice(index, 1);
            }
            this.updateFocusContext();
        });
        this.updateFocusContext();
    }

    /**
     * `bbcodePreviewFocus` gates the preview-only title bar buttons. It has to
     * be computed across every preview: when focus moves from one preview to
     * another, the panel losing focus reports first.
     */
    private updateFocusContext(): void {
        void vscode.commands.executeCommand(
            'setContext',
            FOCUS_CONTEXT,
            this.previews.some((preview) => preview.isActive),
        );
    }

    dispose(): void {
        for (const preview of [...this.previews]) {
            preview.dispose();
        }
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}

export class BBCodePreview implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly disposeHandlers: Array<() => void> = [];
    private readonly viewStateHandlers: Array<() => void> = [];
    private updateTimer: NodeJS.Timeout | undefined;
    private pendingLine: number;
    /**
     * The webview document is only rebuilt when something outside the body
     * changes; ordinary edits swap the body over `postMessage` so that scroll
     * position, open spoilers and text selection survive.
     */
    private shellKey: string | undefined;
    /** Set while the preview is scrolling the editor, to avoid a feedback loop. */
    private scrollingEditor = false;
    private disposed = false;

    constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly resource: vscode.Uri,
        private readonly context: vscode.ExtensionContext,
        private readonly model: DocumentModel,
        initialLine: number,
    ) {
        this.pendingLine = initialLine;
        this.panel.title = previewTitle(resource);
        this.panel.iconPath = {
            light: vscode.Uri.joinPath(context.extensionUri, 'images', 'preview-light.svg'),
            dark: vscode.Uri.joinPath(context.extensionUri, 'images', 'preview-dark.svg'),
        };
        this.panel.webview.options = {
            enableScripts: true,
            localResourceRoots: localResourceRoots(context.extensionUri, resource),
        };

        this.disposables.push(
            this.panel.onDidDispose(() => this.dispose()),
            this.panel.onDidChangeViewState(() => {
                for (const handler of this.viewStateHandlers) {
                    handler();
                }
            }),
            this.panel.webview.onDidReceiveMessage((message: InboundMessage) => void this.onMessage(message)),
        );

        void this.render();
    }

    get isActive(): boolean {
        return !this.disposed && this.panel.active;
    }

    matches(resource: vscode.Uri): boolean {
        return this.resource.toString() === resource.toString();
    }

    get sourceUri(): vscode.Uri {
        return this.resource;
    }

    reveal(viewColumn: vscode.ViewColumn): void {
        this.panel.reveal(viewColumn, true);
    }

    revealLine(line: number): void {
        this.pendingLine = line;
        void this.panel.webview.postMessage({ type: 'revealLine', line });
    }

    refresh(): void {
        void this.render(true);
    }

    onDocumentChanged(document: vscode.TextDocument): void {
        if (document.uri.toString() !== this.resource.toString()) {
            return;
        }
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        this.updateTimer = setTimeout(() => {
            this.updateTimer = undefined;
            void this.render();
        }, UPDATE_DEBOUNCE_MS);
    }

    onEditorScrolled(event: vscode.TextEditorVisibleRangesChangeEvent): void {
        if (this.scrollingEditor || event.textEditor.document.uri.toString() !== this.resource.toString()) {
            return;
        }
        if (!getConfig(this.resource).preview.scrollPreviewWithEditor) {
            return;
        }
        const range = event.visibleRanges[0];
        if (!range) {
            return;
        }
        void this.panel.webview.postMessage({ type: 'revealLine', line: range.start.line });
    }

    onDispose(handler: () => void): void {
        this.disposeHandlers.push(handler);
    }

    onViewStateChanged(handler: () => void): void {
        this.viewStateHandlers.push(handler);
    }

    // ------------------------------------------------------------- rendering

    private async render(force = false): Promise<void> {
        if (this.disposed) {
            return;
        }

        const document = await this.openDocument();
        if (!document || this.disposed) {
            return;
        }

        const config = getConfig(this.resource);
        const result = this.model.get(document);
        const body = render(result, this.renderOptions(config.preview));
        const shellKey = JSON.stringify(config.preview);

        this.panel.title = previewTitle(this.resource);

        if (force || this.shellKey !== shellKey) {
            this.shellKey = shellKey;
            this.panel.webview.html = buildPreviewDocument({
                webview: this.panel.webview,
                extensionUri: this.context.extensionUri,
                config: config.preview,
                body,
                title: previewTitle(this.resource),
                resource: this.resource,
                initialLine: this.pendingLine,
            });
            return;
        }

        await this.panel.webview.postMessage({ type: 'update', body });
    }

    private renderOptions(preview: PreviewConfig): Partial<RenderOptions> {
        const webview = this.panel.webview;
        const documentDirectory = vscode.Uri.joinPath(this.resource, '..');

        return {
            dialect: getConfig(this.resource).dialect,
            newlineMode: preview.newlineMode,
            autoLink: preview.autoLink,
            emoticons: preview.emoticons,
            remoteImages: preview.remoteImages,
            embedVideos: preview.embedVideos,
            unknownTags: preview.unknownTags,
            sourceMap: true,
            resolveResource: (url) => {
                if (/^(?:https?|data|blob):/i.test(url) || url.startsWith('//')) {
                    return url;
                }
                try {
                    const target = url.startsWith('file:')
                        ? vscode.Uri.parse(url)
                        : vscode.Uri.joinPath(documentDirectory, url);
                    return webview.asWebviewUri(target).toString();
                } catch {
                    return undefined;
                }
            },
        };
    }

    private async openDocument(): Promise<vscode.TextDocument | undefined> {
        const open = vscode.workspace.textDocuments.find(
            (candidate) => candidate.uri.toString() === this.resource.toString(),
        );
        if (open) {
            return open;
        }
        try {
            return await vscode.workspace.openTextDocument(this.resource);
        } catch {
            return undefined;
        }
    }

    // -------------------------------------------------------------- messages

    private async onMessage(message: InboundMessage): Promise<void> {
        switch (message.type) {
            case 'openLink':
                await this.openLink(message.href);
                return;
            case 'scroll':
                this.scrollEditorTo(message.line);
                return;
            case 'jumpToLine':
                await this.showSource(message.line);
                return;
            case 'ready':
                if (this.pendingLine > 0) {
                    void this.panel.webview.postMessage({ type: 'revealLine', line: this.pendingLine });
                }
                return;
        }
    }

    private async openLink(href: string): Promise<void> {
        if (!href) {
            return;
        }
        const config = getConfig(this.resource).preview;

        if (/^(?:https?|mailto|ftp|ftps|tel):/i.test(href)) {
            if (config.openLinksExternally) {
                await vscode.env.openExternal(vscode.Uri.parse(href));
            }
            return;
        }

        // A relative link: treat it as a sibling file and open it in the editor.
        try {
            const target = href.startsWith('file:')
                ? vscode.Uri.parse(href)
                : vscode.Uri.joinPath(vscode.Uri.joinPath(this.resource, '..'), href);
            await vscode.window.showTextDocument(target, { preview: true });
        } catch {
            void vscode.window.showWarningMessage(`Could not open "${href}".`);
        }
    }

    private scrollEditorTo(line: number): void {
        if (!getConfig(this.resource).preview.scrollEditorWithPreview) {
            return;
        }
        const editor = vscode.window.visibleTextEditors.find(
            (candidate) => candidate.document.uri.toString() === this.resource.toString(),
        );
        if (!editor) {
            return;
        }
        const target = Math.max(0, Math.min(line, editor.document.lineCount - 1));
        this.scrollingEditor = true;
        editor.revealRange(
            new vscode.Range(target, 0, target, 0),
            vscode.TextEditorRevealType.AtTop,
        );
        setTimeout(() => {
            this.scrollingEditor = false;
        }, 50);
    }

    /** Focuses the source document, optionally on a specific line. */
    async showSource(line?: number): Promise<void> {
        const document = await this.openDocument();
        if (!document) {
            return;
        }
        const editor = await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: false,
        });
        if (line !== undefined) {
            const target = Math.max(0, Math.min(line, document.lineCount - 1));
            const position = new vscode.Position(target, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        for (const handler of this.disposeHandlers) {
            handler();
        }
        this.panel.dispose();
    }
}

export function previewTitle(resource: vscode.Uri): string {
    const name = resource.path.split('/').pop() || 'BBCode';
    return `Preview ${name}`;
}

function localResourceRoots(extensionUri: vscode.Uri, resource: vscode.Uri): vscode.Uri[] {
    const roots = [vscode.Uri.joinPath(extensionUri, 'media'), vscode.Uri.joinPath(extensionUri, 'images')];

    const folder = vscode.workspace.getWorkspaceFolder(resource);
    if (folder) {
        roots.push(folder.uri);
    }
    if (resource.scheme === 'file') {
        roots.push(vscode.Uri.joinPath(resource, '..'));
    }
    return roots;
}

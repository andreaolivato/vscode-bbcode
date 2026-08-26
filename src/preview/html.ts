/** Builds the HTML document that the preview webview displays. */

import * as vscode from 'vscode';

import { escapeAttribute, escapeHtml, sanitizeFontFamily } from '../bbcode/sanitize';
import { PreviewConfig } from '../config';

export interface PreviewDocumentOptions {
    readonly webview: vscode.Webview;
    readonly extensionUri: vscode.Uri;
    readonly config: PreviewConfig;
    /** The rendered BBCode. */
    readonly body: string;
    readonly title: string;
    /** Source document, used for the "reveal source" affordances. */
    readonly resource: vscode.Uri;
    /** Line to scroll to when the preview first loads. */
    readonly initialLine: number;
}

export function buildPreviewDocument(options: PreviewDocumentOptions): string {
    const { webview, extensionUri, config, body, title, resource, initialLine } = options;
    const nonce = createNonce();
    const media = (file: string): vscode.Uri =>
        webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', file));

    const imageSources = config.remoteImages
        ? `${webview.cspSource} https: http: data: blob:`
        : `${webview.cspSource} data: blob:`;
    const frameSources = config.embedVideos
        ? 'https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com'
        : "'none'";

    const csp = [
        `default-src 'none'`,
        `img-src ${imageSources}`,
        `media-src ${imageSources}`,
        `style-src ${webview.cspSource} 'unsafe-inline' https:`,
        `font-src ${webview.cspSource} https: data:`,
        `script-src 'nonce-${nonce}'`,
        `frame-src ${frameSources}`,
    ].join('; ');

    const customStyles = config.customStyles
        .map((style) => resolveStyle(style, webview, resource))
        .filter((uri): uri is string => uri !== undefined)
        .map((uri) => `<link rel="stylesheet" href="${escapeAttribute(uri)}">`)
        .join('\n    ');

    const settings = {
        resource: resource.toString(),
        scrollEditorWithPreview: config.scrollEditorWithPreview,
        doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
        openLinksExternally: config.openLinksExternally,
        initialLine,
    };

    return `<!DOCTYPE html>
<html lang="en" class="bb-theme-${escapeAttribute(config.theme)}">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${escapeAttribute(media('preview.css').toString())}">
    ${customStyles}
    <style nonce="${nonce}">${escapeCss(rootVariables(config))}</style>
</head>
<body class="bb-preview">
    <main class="bb-content" id="bb-content">
${body || '<p class="bb-empty">This document is empty. Start typing BBCode to see it here.</p>'}
    </main>
    <script nonce="${nonce}">window.bbcodeSettings = ${JSON.stringify(settings)};</script>
    <script nonce="${nonce}" src="${escapeAttribute(media('preview.js').toString())}"></script>
</body>
</html>`;
}

/** Custom-property overrides derived from the user's settings. */
function rootVariables(config: PreviewConfig): string {
    const declarations: string[] = [`--bb-font-size: ${clampNumber(config.fontSize, 8, 40)}px;`];

    // Anything that is not a plain list of font names is dropped outright,
    // rather than patched up, so it can never reach the stylesheet.
    const family = sanitizeFontFamily(config.fontFamily);
    if (family) {
        declarations.push(`--bb-font-family: ${family};`);
    }

    const width = clampNumber(config.maxWidth, 0, 10000);
    declarations.push(`--bb-max-width: ${width > 0 ? `${width}px` : 'none'};`);

    return `:root { ${declarations.join(' ')} }`;
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, Math.round(value)));
}

/** Nothing reaches this that a user did not type, but keep `</style>` out. */
function escapeCss(css: string): string {
    return css.replace(/</g, '\\3c ');
}

function resolveStyle(style: string, webview: vscode.Webview, resource: vscode.Uri): string | undefined {
    if (/^https?:\/\//i.test(style)) {
        return style;
    }
    const uri = resolveWorkspacePath(style, resource);
    return uri ? webview.asWebviewUri(uri).toString() : undefined;
}

function resolveWorkspacePath(target: string, resource: vscode.Uri): vscode.Uri | undefined {
    if (target.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(target)) {
        return vscode.Uri.file(target);
    }
    const folder = vscode.workspace.getWorkspaceFolder(resource);
    const base = folder?.uri ?? vscode.Uri.joinPath(resource, '..');
    return vscode.Uri.joinPath(base, target);
}

function createNonce(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return nonce;
}

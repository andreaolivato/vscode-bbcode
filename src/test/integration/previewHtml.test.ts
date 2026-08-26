/**
 * The preview shell is the security boundary: a strict CSP, a fresh nonce, and
 * no user-controlled value reaching the document unescaped. These tests run in
 * the extension host so they can build the document against a real webview.
 */

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

import { PreviewConfig } from '../../config';
import { buildPreviewDocument } from '../../preview/html';

const BASE_CONFIG: PreviewConfig = {
    theme: 'auto',
    fontFamily: '',
    fontSize: 14,
    maxWidth: 900,
    customStyles: [],
    newlineMode: 'br',
    autoLink: true,
    emoticons: true,
    remoteImages: true,
    embedVideos: true,
    unknownTags: 'text',
    scrollPreviewWithEditor: true,
    scrollEditorWithPreview: true,
    doubleClickToSwitchToEditor: true,
    openLinksExternally: true,
};

/** The CSP is stored HTML-escaped; read it back the way a browser would. */
function contentSecurityPolicy(html: string): string {
    const raw = /content="([^"]*default-src[^"]*)"/.exec(html)?.[1];
    assert.ok(raw, 'expected a CSP meta tag');
    return raw
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/** The sources listed for one CSP directive. */
function directive(csp: string, name: string): string[] {
    const match = new RegExp(`${name} ([^;]*)`).exec(csp);
    return match ? match[1].trim().split(/\s+/) : [];
}

function build(config: Partial<PreviewConfig> = {}, body = '<p>hi</p>'): string {
    const panel = vscode.window.createWebviewPanel('bbcode.test', 'test', vscode.ViewColumn.One, {
        enableScripts: true,
    });
    try {
        return buildPreviewDocument({
            webview: panel.webview,
            extensionUri: vscode.extensions.getExtension('andreaolivato.bbcode-preview')!.extensionUri,
            config: { ...BASE_CONFIG, ...config },
            body,
            title: 'Preview demo.bbcode',
            resource: vscode.Uri.file('/tmp/demo.bbcode'),
            initialLine: 0,
        });
    } finally {
        panel.dispose();
    }
}

describe('preview document', () => {
    it('declares a locked-down content security policy', () => {
        const csp = contentSecurityPolicy(build());
        assert.ok(csp.includes("default-src 'none'"));
        assert.ok(!csp.includes("script-src 'unsafe-inline'"));
        assert.ok(!csp.includes("script-src 'unsafe-eval'"));
    });

    it('gives every script the same one-off nonce', () => {
        const html = build();
        const nonce = /nonce-([A-Za-z0-9]+)/.exec(html)?.[1];
        assert.ok(nonce && nonce.length >= 16, 'expected a long nonce');

        const scripts = html.match(/<script[^>]*>/g) ?? [];
        assert.ok(scripts.length >= 2);
        for (const script of scripts) {
            assert.ok(script.includes(`nonce="${nonce}"`), script);
        }
    });

    it('uses a different nonce every time', () => {
        const first = /nonce-([A-Za-z0-9]+)/.exec(build())?.[1];
        const second = /nonce-([A-Za-z0-9]+)/.exec(build())?.[1];
        assert.notEqual(first, second);
    });

    it('blocks remote images when the setting is off', () => {
        // `https://*.vscode-cdn.net` has to stay: that is where the webview
        // serves the extension's own files from. The bare schemes must go.
        const sources = directive(contentSecurityPolicy(build({ remoteImages: false })), 'img-src');
        assert.ok(!sources.includes('https:'), sources.join(' '));
        assert.ok(!sources.includes('http:'), sources.join(' '));
    });

    it('allows remote images by default', () => {
        const sources = directive(contentSecurityPolicy(build()), 'img-src');
        assert.ok(sources.includes('https:'), sources.join(' '));
    });

    it('blocks frames when embeds are off', () => {
        const csp = contentSecurityPolicy(build({ embedVideos: false }));
        assert.ok(csp.includes("frame-src 'none'"), csp);
    });

    it('only lets the two known video hosts into frame-src', () => {
        for (const host of directive(contentSecurityPolicy(build()), 'frame-src')) {
            assert.ok(
                /^https:\/\/(?:www\.youtube-nocookie\.com|www\.youtube\.com|player\.vimeo\.com)$/.test(host),
                host,
            );
        }
    });

    it('drops a font family that is not a list of font names', () => {
        const html = build({ fontFamily: 'Arial; } body { display: none } /*' });
        assert.ok(!html.includes('--bb-font-family'), html);
    });

    it('keeps a legitimate font family', () => {
        assert.ok(build({ fontFamily: 'Times New Roman, serif' }).includes("--bb-font-family: 'Times New Roman'"));
    });

    it('clamps out-of-range numeric settings', () => {
        assert.ok(build({ fontSize: 9999 }).includes('--bb-font-size: 40px'));
        assert.ok(build({ maxWidth: 0 }).includes('--bb-max-width: none'));
    });

    it('escapes the title', () => {
        const panel = vscode.window.createWebviewPanel('bbcode.test', 'test', vscode.ViewColumn.One, {});
        try {
            const html = buildPreviewDocument({
                webview: panel.webview,
                extensionUri: vscode.extensions.getExtension('andreaolivato.bbcode-preview')!.extensionUri,
                config: BASE_CONFIG,
                body: '',
                title: '</title><script>alert(1)</script>',
                resource: vscode.Uri.file('/tmp/x.bbcode'),
                initialLine: 0,
            });
            assert.ok(!html.includes('<script>alert(1)'), html);
        } finally {
            panel.dispose();
        }
    });

    it('shows a placeholder for an empty document', () => {
        assert.ok(build({}, '').includes('bb-empty'));
    });
});

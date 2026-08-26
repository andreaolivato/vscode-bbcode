import * as assert from 'node:assert/strict';

import { parse } from '../../bbcode/parser';
import { createResolver } from '../../bbcode/resolver';
import { RenderOptions, render, renderBBCode } from '../../bbcode/renderer';

function html(source: string, options: Partial<RenderOptions> = {}): string {
    return renderBBCode(source, { emoticons: false, autoLink: false, ...options });
}

describe('renderer: text', () => {
    it('escapes HTML in plain text', () => {
        assert.equal(html('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('turns line breaks into <br>', () => {
        assert.equal(html('one\ntwo'), 'one<br>\ntwo');
    });

    it('leaves an unknown tag verbatim by default', () => {
        assert.equal(html('[wibble]x[/wibble]'), '[wibble]x[/wibble]');
    });

    it('can strip unknown tags instead', () => {
        assert.equal(html('[wibble]x[/wibble]', { unknownTags: 'strip' }), 'x');
    });
});

describe('renderer: formatting', () => {
    it('renders the basic styles', () => {
        assert.equal(html('[b]a[/b]'), '<strong>a</strong>');
        assert.equal(html('[i]a[/i]'), '<em>a</em>');
        assert.equal(html('[s]a[/s]'), '<s>a</s>');
        assert.equal(html('[u]a[/u]'), '<span class="bb-underline">a</span>');
    });

    it('nests styles', () => {
        assert.equal(html('[b]a[i]b[/i][/b]'), '<strong>a<em>b</em></strong>');
    });

    it('closes an unclosed tag at the end of the document', () => {
        assert.equal(html('[b]a'), '<strong>a</strong>');
    });

    it('applies a validated colour', () => {
        assert.equal(html('[color=red]a[/color]'), '<span style="color:red">a</span>');
        assert.equal(html('[color=#FF8800]a[/color]'), '<span style="color:#ff8800">a</span>');
    });

    it('drops a colour that is not a colour', () => {
        assert.equal(html('[color=x;background:url(y)]a[/color]'), 'a');
    });

    it('applies a size according to the dialect', () => {
        assert.equal(html('[size=150]a[/size]'), '<span style="font-size:150%">a</span>');
        assert.equal(
            html('[size=4]a[/size]', { dialect: 'vbulletin' }),
            '<span style="font-size:1.13em">a</span>',
        );
    });

    it('renders headings as real heading elements', () => {
        assert.equal(html('[h2]Title[/h2]'), '<h2 class="bb-heading">Title</h2>');
    });
});

describe('renderer: links', () => {
    it('renders a bare url', () => {
        assert.equal(
            html('[url]https://example.com[/url]'),
            '<a class="bb-link" href="https://example.com" title="https://example.com" rel="noopener noreferrer">https://example.com</a>',
        );
    });

    it('renders a labelled url', () => {
        assert.ok(html('[url=https://example.com]Example[/url]').includes('>Example</a>'));
    });

    it('refuses a javascript: url and keeps the label', () => {
        assert.equal(html('[url=javascript:alert(1)]click[/url]'), 'click');
        assert.equal(html('[url]javascript:alert(1)[/url]'), 'javascript:alert(1)');
    });

    it('renders an email address', () => {
        assert.equal(
            html('[email]a@example.com[/email]'),
            '<a class="bb-link" href="mailto:a@example.com">a@example.com</a>',
        );
    });

    it('auto-links bare addresses when asked', () => {
        const output = html('see https://example.com/a now', { autoLink: true });
        assert.ok(output.includes('href="https://example.com/a"'));
        assert.ok(output.startsWith('see '));
        assert.ok(output.endsWith(' now'));
    });

    it('keeps sentence punctuation out of an auto-link', () => {
        const output = html('go to https://example.com.', { autoLink: true });
        assert.ok(output.includes('href="https://example.com"'));
        assert.ok(output.endsWith('.'));
    });

    it('does not auto-link inside an explicit url tag', () => {
        const output = html('[url=https://a.example]https://b.example[/url]', { autoLink: true });
        assert.equal(output.match(/<a /g)?.length, 1);
    });
});

describe('renderer: quotes and blocks', () => {
    it('renders a quote with its author', () => {
        const output = html('[quote="Alice"]hi[/quote]');
        assert.ok(output.includes('<blockquote class="bb-quote">'));
        assert.ok(output.includes('<span class="bb-quote-author">Alice</span> said:'));
        assert.ok(output.includes('<div class="bb-quote-body">hi</div>'));
    });

    it('escapes the author name', () => {
        assert.ok(html('[quote=<b>]x[/quote]').includes('&lt;b&gt;'));
    });

    it('swallows the newlines that hug a block tag', () => {
        assert.equal(
            html('[quote]\nhi\n[/quote]'),
            '<blockquote class="bb-quote"><div class="bb-quote-body">hi</div></blockquote>',
        );
    });

    it('renders a spoiler as a details element', () => {
        const output = html('[spoiler=Ending]dead[/spoiler]');
        assert.ok(output.includes('<details class="bb-spoiler">'));
        assert.ok(output.includes('<summary>Ending</summary>'));
    });

    it('renders alignment', () => {
        assert.equal(
            html('[center]x[/center]'),
            '<div class="bb-align bb-align-center">x</div>',
        );
        assert.equal(html('[align=right]x[/align]'), '<div class="bb-align bb-align-right">x</div>');
    });

    it('falls back to left for a bogus alignment', () => {
        assert.ok(html('[align=sideways]x[/align]').includes('bb-align-left'));
    });
});

describe('renderer: lists', () => {
    it('renders a bulleted list', () => {
        assert.equal(
            html('[list]\n[*]one\n[*]two\n[/list]'),
            '<ul class="bb-list" style="list-style-type:disc"><li>one</li><li>two</li></ul>',
        );
    });

    it('renders a numbered list', () => {
        assert.ok(html('[list=1]\n[*]one\n[/list]').startsWith('<ol class="bb-list" type="1">'));
        assert.ok(html('[list=a]\n[*]one\n[/list]').startsWith('<ol class="bb-list" type="a">'));
    });

    it('wraps stray content in a single item', () => {
        assert.equal(
            html('[list]just text[/list]'),
            '<ul class="bb-list" style="list-style-type:disc"><li>just text</li></ul>',
        );
    });

    it('renders explicit list items', () => {
        assert.ok(html('[ul][li]a[/li][li]b[/li][/ul]').includes('<li>a</li><li>b</li>'));
    });
});

describe('renderer: code', () => {
    it('does not interpret BBCode inside a code block', () => {
        const output = html('[code][b]x[/b][/code]');
        assert.ok(output.includes('[b]x[/b]'));
        assert.ok(!output.includes('<strong>'));
    });

    it('escapes HTML inside a code block', () => {
        assert.ok(html('[code]<script>[/code]').includes('&lt;script&gt;'));
    });

    it('labels the language', () => {
        const output = html('[code=js]let a = 1;[/code]');
        assert.ok(output.includes('<span class="bb-code-label">js</span>'));
        assert.ok(output.includes('class="language-js"'));
    });

    it('drops the newlines that hug the block', () => {
        assert.ok(html('[code]\nx\n[/code]').includes('<code>x</code>'));
    });

    it('renders noparse as plain text', () => {
        assert.equal(html('[noparse][b]x[/b][/noparse]'), '[b]x[/b]');
    });
});

describe('renderer: media', () => {
    it('renders an image from the tag body', () => {
        assert.equal(
            html('[img]https://example.com/a.png[/img]'),
            '<img class="bb-image" src="https://example.com/a.png" alt="image" loading="lazy">',
        );
    });

    it('renders an image from the tag value with the body as alt text', () => {
        const output = html('[img=https://example.com/a.png]A cat[/img]');
        assert.ok(output.includes('src="https://example.com/a.png"'));
        assert.ok(output.includes('alt="A cat"'));
    });

    it('reads a numeric value as a width', () => {
        assert.ok(html('[img=200]https://example.com/a.png[/img]').includes('width="200"'));
    });

    it('honours width and height parameters', () => {
        const output = html('[img width=100 height=50]https://example.com/a.png[/img]');
        assert.ok(output.includes('width="100"'));
        assert.ok(output.includes('height="50"'));
    });

    it('refuses a javascript: image source', () => {
        assert.equal(html('[img]javascript:alert(1)[/img]'), 'javascript:alert(1)');
    });

    it('replaces a remote image with a link when remote images are off', () => {
        const output = html('[img]https://example.com/a.png[/img]', { remoteImages: false });
        assert.ok(output.includes('bb-blocked-image'));
        assert.ok(!output.includes('<img'));
    });

    it('embeds a YouTube video', () => {
        const output = html('[youtube]https://youtu.be/dQw4w9WgXcQ[/youtube]');
        assert.ok(output.includes('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'));
    });

    it('links instead of embedding when embeds are off', () => {
        const output = html('[youtube]dQw4w9WgXcQ[/youtube]', { embedVideos: false });
        assert.ok(!output.includes('<iframe'));
        assert.ok(output.includes('watch?v=dQw4w9WgXcQ'));
    });

    it('routes a media tag to the right provider', () => {
        assert.ok(html('[media=vimeo]76979871[/media]').includes('player.vimeo.com/video/76979871'));
    });

    it('rewrites a local image through resolveResource', () => {
        const output = html('[img]cat.png[/img]', {
            resolveResource: (url) => `https://webview.test/${url}`,
        });
        assert.ok(output.includes('src="https://webview.test/cat.png"'));
    });
});

describe('renderer: tables', () => {
    it('renders a table', () => {
        const output = html('[table][tr][th]A[/th][td]B[/td][/tr][/table]');
        assert.ok(output.includes('<table class="bb-table">'));
        assert.ok(output.includes('<th>A</th><td>B</td>'));
    });

    it('honours cell parameters', () => {
        const output = html('[table][tr][td colspan=2 align=center]A[/td][/tr][/table]');
        assert.ok(output.includes('colspan="2"'));
        assert.ok(output.includes('style="text-align:center"'));
    });
});

describe('renderer: emoticons', () => {
    it('substitutes emoji', () => {
        const output = html('hello :)', { emoticons: true });
        assert.ok(output.includes('class="bb-emoticon"'));
        assert.ok(output.includes('🙂'));
    });

    it('leaves emoticons inside code alone', () => {
        assert.ok(!html('[code]:)[/code]', { emoticons: true }).includes('bb-emoticon'));
    });

    it('does not mangle a URL', () => {
        const output = html('https://example.com/a', { emoticons: true, autoLink: false });
        assert.ok(!output.includes('bb-emoticon'));
    });
});

describe('renderer: paragraph mode', () => {
    it('splits on blank lines', () => {
        assert.equal(
            html('one\n\ntwo', { newlineMode: 'paragraph' }),
            '<p>one</p>\n<p>two</p>',
        );
    });

    it('keeps a single newline as a break', () => {
        assert.equal(html('one\ntwo', { newlineMode: 'paragraph' }), '<p>one<br>\ntwo</p>');
    });

    it('lets block tags stand on their own', () => {
        const output = html('a\n\n[quote]b[/quote]\n\nc', { newlineMode: 'paragraph' });
        assert.ok(output.startsWith('<p>a</p>'));
        assert.ok(output.includes('<blockquote'));
        assert.ok(output.trimEnd().endsWith('<p>c</p>'));
    });
});

describe('renderer: source map', () => {
    it('adds a line number to block elements', () => {
        const output = html('line one\n[quote]x[/quote]', { sourceMap: true });
        assert.ok(output.includes('<blockquote class="bb-quote" data-bb-line="1">'));
    });

    it('omits line numbers when the source map is off', () => {
        assert.ok(!html('[quote]x[/quote]').includes('data-bb-line'));
    });
});

describe('renderer: custom tags', () => {
    const resolver = createResolver('generic', [
        { name: 'steam', html: '<a href="https://steamcommunity.com/id/${text}">${content}</a>' },
        { name: 'shout', html: '<b class="shout">${content}</b>', block: false },
        { name: 'go', html: '<a href="${url}">go</a>' },
    ]);

    function custom(source: string): string {
        return render(parse(source, { resolver }), { emoticons: false, autoLink: false });
    }

    it('substitutes rendered content', () => {
        assert.equal(custom('[shout]a[b]b[/b][/shout]'), '<b class="shout">a<strong>b</strong></b>');
    });

    it('escapes the raw text placeholder', () => {
        assert.ok(custom('[steam]<x>[/steam]').includes('id/&lt;x&gt;'));
    });

    it('sanitises the url placeholder', () => {
        assert.equal(custom('[go=javascript:alert(1)]x[/go]'), '<a href="#">go</a>');
        assert.equal(custom('[go=https://ok.example]x[/go]'), '<a href="https://ok.example">go</a>');
    });
});

describe('renderer: hostile input', () => {
    const attacks = [
        '[url=" onmouseover="alert(1)]x[/url]',
        '[img]" onerror="alert(1)[/img]',
        '[color=red" onload="alert(1)]x[/color]',
        '[quote="</blockquote><script>alert(1)</script>"]x[/quote]',
        '[size=1"><script>alert(1)</script>]x[/size]',
        '[code]</code></pre><script>alert(1)</script>[/code]',
        '[spoiler=</summary><img src=x onerror=alert(1)>]x[/spoiler]',
    ];

    /** The markup of the output, ignoring escaped text between the tags. */
    const elements = (output: string): string[] => output.match(/<[^>]*>/g) ?? [];

    for (const attack of attacks) {
        it(`neutralises ${attack.slice(0, 40)}`, () => {
            const output = html(attack);
            assert.ok(!/<script/i.test(output), output);
            assert.ok(
                !elements(output).some((element) => /\son\w+\s*=/i.test(element)),
                output,
            );
            assert.ok(
                !elements(output).some((element) => /javascript:/i.test(element)),
                output,
            );
        });
    }

    it('survives deeply nested input without blowing up', () => {
        const source = '[b]'.repeat(400) + 'x' + '[/b]'.repeat(400);
        assert.ok(html(source).includes('x'));
    });

    it('handles a very long run of brackets', () => {
        assert.doesNotThrow(() => html('['.repeat(5000)));
    });
});

describe('renderer: nested lists', () => {
    it('keeps a nested list inside the item it follows', () => {
        const output = html('[list]\n[*]outer\n[list=a]\n[*]inner\n[/list]\n[/list]');
        assert.equal(
            output,
            '<ul class="bb-list" style="list-style-type:disc">' +
                '<li>outer<ol class="bb-list" type="a"><li>inner</li></ol></li>' +
                '</ul>',
        );
    });

    it('keeps content that appears before the first item', () => {
        const output = html('[list]intro\n[*]one\n[/list]');
        assert.ok(output.includes('<li>intro'), output);
        assert.ok(output.includes('<li>one</li>'), output);
    });
});

describe('renderer: highlight contrast', () => {
    it('leaves a light highlight to the stylesheet', () => {
        assert.equal(
            html('[bgcolor=yellow]x[/bgcolor]'),
            '<span class="bb-highlight" style="background-color:yellow">x</span>',
        );
    });

    it('lightens the text on a dark highlight', () => {
        assert.ok(html('[bgcolor=navy]x[/bgcolor]').includes('color:#f8fafc'));
        assert.ok(html('[bgcolor=#101820]x[/bgcolor]').includes('color:#f8fafc'));
        assert.ok(html('[bgcolor=rgb(20, 20, 30)]x[/bgcolor]').includes('color:#f8fafc'));
    });

    it('drops a highlight that is not a colour', () => {
        assert.equal(html('[bgcolor=nonsense]x[/bgcolor]'), 'x');
    });
});

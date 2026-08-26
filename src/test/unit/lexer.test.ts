import * as assert from 'node:assert/strict';

import { OpenToken, parseAttributes, tokenize } from '../../bbcode/lexer';

const RAW_TAGS = new Set(['code', 'noparse', 'img']);
const options = { isRawTag: (name: string) => RAW_TAGS.has(name) };

function types(source: string): string[] {
    return tokenize(source, options).map((token) => token.type);
}

describe('lexer', () => {
    it('emits plain text as a single token', () => {
        const tokens = tokenize('hello world');
        assert.equal(tokens.length, 1);
        assert.deepEqual(types('hello world'), ['text']);
    });

    it('recognises an opening and a closing tag', () => {
        const tokens = tokenize('[b]hi[/b]');
        assert.deepEqual(
            tokens.map((token) => token.type),
            ['open', 'text', 'close'],
        );
        assert.equal((tokens[0] as OpenToken).name, 'b');
        assert.equal(tokens[0].start, 0);
        assert.equal(tokens[0].end, 3);
    });

    it('lower-cases tag names but keeps the original spelling', () => {
        const [token] = tokenize('[URL=https://example.com]x[/URL]');
        assert.equal((token as OpenToken).name, 'url');
        assert.equal((token as OpenToken).rawName, 'URL');
    });

    it('treats a bracket that is not a tag as text', () => {
        assert.deepEqual(types('see [1] and [ 2 ]'), ['text']);
    });

    it('does not let a tag span a line break', () => {
        assert.deepEqual(types('[quote=\nBob]'), ['text']);
    });

    it('gives up on an unterminated bracket', () => {
        assert.deepEqual(types('a [b c'), ['text']);
    });

    it('captures the body of a raw tag verbatim', () => {
        const tokens = tokenize('[code][b]not bold[/b][/code]', options);
        assert.deepEqual(
            tokens.map((token) => token.type),
            ['open', 'text', 'close'],
        );
        assert.equal(tokens[1].type === 'text' && tokens[1].value, '[b]not bold[/b]');
        assert.equal(tokens[1].type === 'text' && tokens[1].raw, true);
    });

    it('falls back to normal lexing when a raw tag is never closed', () => {
        // Swallowing the rest of the document would be much worse than losing
        // the raw treatment of a tag the author forgot to close.
        const tokens = tokenize('[code]x[b]y[/b]', options);
        assert.deepEqual(
            tokens.map((token) => token.type),
            ['open', 'text', 'open', 'text', 'close'],
        );
    });

    it('matches a raw closing tag regardless of case', () => {
        const tokens = tokenize('[code]x[/CODE]', options);
        assert.equal(tokens.length, 3);
        assert.equal(tokens[2].type, 'close');
    });

    it('rejects a closing tag that carries attributes', () => {
        assert.deepEqual(types('[/b=1]'), ['text']);
    });

    it('records exact source offsets', () => {
        const tokens = tokenize('ab[b]cd[/b]');
        assert.deepEqual(
            tokens.map((token) => [token.start, token.end]),
            [
                [0, 2],
                [2, 5],
                [5, 7],
                [7, 11],
            ],
        );
    });
});

describe('parseAttributes', () => {
    it('reads a bare default value', () => {
        assert.deepEqual(parseAttributes('=red'), { value: 'red', params: {} });
    });

    it('keeps spaces inside an unquoted value', () => {
        assert.deepEqual(parseAttributes('=Times New Roman'), {
            value: 'Times New Roman',
            params: {},
        });
    });

    it('reads a quoted default value', () => {
        assert.deepEqual(parseAttributes('="John Doe"'), { value: 'John Doe', params: {} });
    });

    it('splits a default value from named parameters', () => {
        assert.deepEqual(parseAttributes('=Bob post=12'), {
            value: 'Bob',
            params: { post: '12' },
        });
    });

    it('reads named parameters without a default value', () => {
        assert.deepEqual(parseAttributes(' width=100 height="50"'), {
            value: undefined,
            params: { width: '100', height: '50' },
        });
    });

    it('keeps a URL with a query string intact', () => {
        assert.deepEqual(parseAttributes('=https://example.com/?a=1&b=2'), {
            value: 'https://example.com/?a=1&b=2',
            params: {},
        });
    });

    it('lower-cases parameter names', () => {
        assert.deepEqual(parseAttributes(' WIDTH=10').params, { width: '10' });
    });
});

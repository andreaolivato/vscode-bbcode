import * as assert from 'node:assert/strict';

import { TagNode } from '../../bbcode/ast';
import { openTagsAt, parse } from '../../bbcode/parser';
import { createResolver } from '../../bbcode/resolver';

function tags(source: string) {
    return parse(source);
}

function firstTag(source: string): TagNode {
    const node = parse(source).root.children.find((child) => child.type === 'tag');
    assert.ok(node && node.type === 'tag', `expected a tag in ${JSON.stringify(source)}`);
    return node;
}

describe('parser', () => {
    it('nests tags', () => {
        const outer = firstTag('[b]bold [i]and italic[/i][/b]');
        assert.equal(outer.name, 'b');
        assert.equal(outer.closed, true);
        const inner = outer.children.find((child) => child.type === 'tag');
        assert.ok(inner && inner.type === 'tag');
        assert.equal(inner.name, 'i');
    });

    it('resolves aliases to the canonical name', () => {
        assert.equal(firstTag('[bold]x[/bold]').name, 'b');
        assert.equal(firstTag('[colour=red]x[/colour]').name, 'color');
    });

    it('reports an unclosed tag', () => {
        const { problems } = tags('[b]never closed');
        assert.equal(problems.length, 1);
        assert.equal(problems[0].code, 'unclosed-tag');
        assert.equal(problems[0].tagName, 'b');
    });

    it('closes overlapping tags in stack order', () => {
        const { problems } = tags('[b][i]text[/b][/i]');
        assert.equal(problems.filter((problem) => problem.code === 'unclosed-tag').length, 1);
        assert.equal(problems.filter((problem) => problem.code === 'stray-close').length, 1);
    });

    it('reports a stray closing tag', () => {
        const { problems } = tags('text [/b] more');
        assert.equal(problems.length, 1);
        assert.equal(problems[0].code, 'stray-close');
    });

    it('keeps an unknown tag as literal source', () => {
        const result = tags('[wibble]x[/wibble]');
        const [first] = result.root.children;
        assert.equal(first.type, 'unknown');
        assert.equal(first.type === 'unknown' && first.source, '[wibble]');
        assert.equal(result.problems.every((problem) => problem.code === 'unknown-tag'), true);
    });

    it('closes a list item when the next one starts', () => {
        const list = firstTag('[list]\n[*]one\n[*]two\n[/list]');
        const items = list.children.filter((child) => child.type === 'tag');
        assert.equal(items.length, 2);
        assert.equal(items.every((item) => item.type === 'tag' && item.implicitlyClosed), true);
    });

    it('reports a list item used outside a list', () => {
        const { problems } = tags('[*]lonely');
        assert.equal(problems.some((problem) => problem.code === 'misplaced-tag'), true);
    });

    it('does not parse BBCode inside a raw tag', () => {
        const code = firstTag('[code][b]x[/b][/code]');
        assert.equal(code.children.length, 1);
        assert.equal(code.children[0].type, 'text');
    });

    it('honours the dialect when resolving tags', () => {
        const steam = createResolver('steam');
        const phpbb = createResolver('phpbb');
        assert.ok(steam.resolve('olist'));
        assert.equal(phpbb.resolve('olist'), undefined);
    });

    it('accepts a custom tag', () => {
        const resolver = createResolver('generic', [{ name: 'lnk', html: '<a>${content}</a>' }]);
        const result = parse('[lnk]x[/lnk]', { resolver });
        const [node] = result.root.children;
        assert.equal(node.type, 'tag');
        assert.equal(result.problems.length, 0);
    });

    it('records content boundaries', () => {
        const node = firstTag('[b]hi[/b]');
        assert.equal(node.contentStart, 3);
        assert.equal(node.contentEnd, 5);
        assert.equal(node.start, 0);
        assert.equal(node.end, 9);
    });

    describe('openTagsAt', () => {
        it('returns the chain of enclosing tags', () => {
            const source = '[quote][b]here[/b][/quote]';
            const chain = openTagsAt(parse(source), source.indexOf('here'));
            assert.deepEqual(chain.map((node) => node.name), ['quote', 'b']);
        });

        it('returns nothing outside any tag', () => {
            assert.deepEqual(openTagsAt(parse('plain text'), 3), []);
        });
    });
});

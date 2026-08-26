import * as assert from 'node:assert/strict';

import { createResolver } from '../../bbcode/resolver';
import {
    DIALECTS,
    TAG_DEFINITIONS,
    findTag,
    isInDialect,
    snippetFor,
    tagsForDialect,
} from '../../bbcode/tags';

describe('tag registry', () => {
    it('has no duplicate names or aliases', () => {
        const seen = new Set<string>();
        for (const def of TAG_DEFINITIONS) {
            for (const name of [def.name, ...(def.aliases ?? [])]) {
                assert.equal(seen.has(name), false, `duplicate name: ${name}`);
                seen.add(name);
            }
        }
    });

    it('uses lower-case names', () => {
        for (const def of TAG_DEFINITIONS) {
            assert.equal(def.name, def.name.toLowerCase());
            for (const alias of def.aliases ?? []) {
                assert.equal(alias, alias.toLowerCase());
            }
        }
    });

    it('gives every tag a description and a matching example', () => {
        for (const def of TAG_DEFINITIONS) {
            assert.ok(def.description.length > 0, def.name);
            assert.ok(def.example.includes(`[${def.name}`), def.name);
        }
    });

    it('only lists dialects that exist', () => {
        for (const def of TAG_DEFINITIONS) {
            for (const dialect of def.dialects ?? []) {
                assert.ok(DIALECTS.includes(dialect), `${def.name}: ${dialect}`);
            }
        }
    });

    it('resolves aliases case-insensitively', () => {
        assert.equal(findTag('BOLD')?.name, 'b');
        assert.equal(findTag('STRIKE')?.name, 's');
        assert.equal(findTag('nope'), undefined);
    });

    it('treats generic as a superset of every dialect', () => {
        for (const dialect of DIALECTS) {
            for (const def of tagsForDialect(dialect)) {
                assert.equal(isInDialect(def, 'generic'), true, def.name);
            }
        }
    });

    it('produces a balanced snippet for every tag', () => {
        for (const def of TAG_DEFINITIONS) {
            const snippet = snippetFor(def);
            assert.ok(snippet.startsWith(def.name), def.name);
            if (def.kind !== 'void' && def.kind !== 'listItem') {
                assert.ok(snippet.includes(`[/${def.name}]`), `${def.name} has no closing tag`);
            }
        }
    });
});

describe('resolver', () => {
    it('lets a custom tag override a built-in one', () => {
        const resolver = createResolver('generic', [{ name: 'b', html: '<mark>x</mark>' }]);
        assert.ok(resolver.resolve('b')?.custom);
    });

    it('ignores malformed custom tags', () => {
        const resolver = createResolver('generic', [
            { name: 'ok', html: 'x' },
            { name: 'bad' } as never,
        ]);
        assert.ok(resolver.resolve('ok'));
        assert.equal(resolver.resolve('bad'), undefined);
    });

    it('knows which tags hold raw content', () => {
        const resolver = createResolver();
        assert.equal(resolver.isRawTag('code'), true);
        assert.equal(resolver.isRawTag('b'), false);
    });
});

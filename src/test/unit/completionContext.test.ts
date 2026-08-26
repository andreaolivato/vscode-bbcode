import * as assert from 'node:assert/strict';

import { analyzeCompletion } from '../../bbcode/completionContext';

describe('analyzeCompletion', () => {
    it('finds nothing outside a tag', () => {
        assert.equal(analyzeCompletion('plain text').kind, 'none');
        assert.equal(analyzeCompletion('[b]already closed').kind, 'none');
    });

    it('detects a tag name being typed', () => {
        const context = analyzeCompletion('hello [quo');
        assert.equal(context.kind, 'tagName');
        assert.equal(context.kind === 'tagName' && context.prefix, 'quo');
        assert.equal(context.start, 7);
    });

    it('detects an empty tag', () => {
        const context = analyzeCompletion('[');
        assert.equal(context.kind, 'tagName');
        assert.equal(context.start, 1);
    });

    it('detects a closing tag', () => {
        const context = analyzeCompletion('text [/qu');
        assert.equal(context.kind, 'closingTag');
        assert.equal(context.kind === 'closingTag' && context.prefix, 'qu');
    });

    it('detects a value', () => {
        const context = analyzeCompletion('[color=#ff');
        assert.equal(context.kind, 'value');
        assert.equal(context.kind === 'value' && context.tag, 'color');
        assert.equal(context.kind === 'value' && context.prefix, '#ff');
        assert.equal(context.start, 7);
    });

    it('detects a parameter name', () => {
        const context = analyzeCompletion('[img wid');
        assert.equal(context.kind, 'paramName');
        assert.equal(context.kind === 'paramName' && context.tag, 'img');
        assert.equal(context.kind === 'paramName' && context.prefix, 'wid');
    });

    it('detects a parameter value', () => {
        const context = analyzeCompletion('[td align=cen');
        assert.equal(context.kind, 'paramValue');
        assert.equal(context.kind === 'paramValue' && context.param, 'align');
        assert.equal(context.kind === 'paramValue' && context.prefix, 'cen');
    });

    it('switches to parameters once a space follows the value', () => {
        const context = analyzeCompletion('[quote=Bob po');
        assert.equal(context.kind, 'paramName');
        assert.equal(context.kind === 'paramName' && context.prefix, 'po');
    });
});

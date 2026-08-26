import * as assert from 'node:assert/strict';

import {
    escapeHtml,
    isRemoteUrl,
    sanitizeColor,
    sanitizeFontFamily,
    sanitizeInteger,
    sanitizeSize,
    sanitizeUrl,
    vimeoId,
    youtubeId,
} from '../../bbcode/sanitize';

/** Builds a string containing a literal control character. */
const withControl = (before: string, code: number, after: string): string =>
    before + String.fromCharCode(code) + after;

describe('escapeHtml', () => {
    it('escapes every character that could start markup', () => {
        assert.equal(escapeHtml('<a href="x">&\'') , '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    });
});

describe('sanitizeUrl', () => {
    it('accepts the common schemes', () => {
        for (const url of [
            'https://example.com/a?b=1#c',
            'http://example.com',
            'mailto:someone@example.com',
            'ftp://files.example.com/x',
            'magnet:?xt=urn:btih:abc',
        ]) {
            assert.equal(sanitizeUrl(url), url, url);
        }
    });

    it('accepts relative and protocol-relative addresses', () => {
        assert.equal(sanitizeUrl('images/cat.png'), 'images/cat.png');
        assert.equal(sanitizeUrl('//cdn.example.com/x.png'), '//cdn.example.com/x.png');
        assert.equal(sanitizeUrl('/absolute/path.png'), '/absolute/path.png');
    });

    it('accepts a host and port', () => {
        assert.equal(sanitizeUrl('example.com:8080/x'), 'example.com:8080/x');
    });

    it('rejects script-bearing schemes', () => {
        for (const url of [
            'javascript:alert(1)',
            'JavaScript:alert(1)',
            '  javascript:alert(1)',
            'vbscript:msgbox(1)',
            'java script:alert(1)',
            'data:text/html;base64,PHNjcmlwdD4=',
        ]) {
            assert.equal(sanitizeUrl(url), undefined, url);
        }
    });

    it('rejects a scheme hidden behind control characters', () => {
        // Browsers strip these before resolving, so the check has to as well.
        assert.equal(sanitizeUrl(withControl('java', 9, 'script:alert(1)')), undefined);
        assert.equal(sanitizeUrl(withControl('jav', 10, 'ascript:alert(1)')), undefined);
        assert.equal(sanitizeUrl(withControl('javascri', 13, 'pt:alert(1)')), undefined);
    });

    it('allows base64 images only where they are opted in', () => {
        const url = 'data:image/png;base64,iVBORw0KGgo=';
        assert.equal(sanitizeUrl(url), undefined);
        assert.equal(sanitizeUrl(url, { allowDataImages: true }), url);
        assert.equal(
            sanitizeUrl('data:image/svg+xml;base64,PHN2Zz4=', { allowDataImages: true }),
            undefined,
            'SVG can carry script, so it stays out',
        );
    });

    it('rejects an empty value', () => {
        assert.equal(sanitizeUrl('   '), undefined);
    });
});

describe('isRemoteUrl', () => {
    it('separates remote from local addresses', () => {
        assert.equal(isRemoteUrl('https://example.com/a.png'), true);
        assert.equal(isRemoteUrl('//example.com/a.png'), true);
        assert.equal(isRemoteUrl('images/a.png'), false);
    });
});

describe('sanitizeColor', () => {
    it('accepts keywords, hex values and functions', () => {
        assert.equal(sanitizeColor('Red'), 'red');
        assert.equal(sanitizeColor('#FF8800'), '#ff8800');
        assert.equal(sanitizeColor('ff8800'), '#ff8800');
        assert.equal(sanitizeColor('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
        assert.equal(sanitizeColor('hsl(200, 50%, 40%)'), 'hsl(200, 50%, 40%)');
    });

    it('rejects anything that could escape the attribute', () => {
        assert.equal(sanitizeColor('red; background: url(x)'), undefined);
        assert.equal(sanitizeColor('expression(alert(1))'), undefined);
        assert.equal(sanitizeColor(''), undefined);
    });
});

describe('sanitizeSize', () => {
    it('reads a bare number as a scale step in vBulletin', () => {
        assert.equal(sanitizeSize('4', 'vbulletin'), '1.13em');
        assert.equal(sanitizeSize('7', 'vbulletin'), '2.5em');
    });

    it('reads a bare number as a percentage in phpBB', () => {
        assert.equal(sanitizeSize('150', 'phpbb'), '150%');
    });

    it('splits the difference for the generic dialect', () => {
        assert.equal(sanitizeSize('3'), '1em');
        assert.equal(sanitizeSize('150'), '150%');
    });

    it('keeps an explicit unit', () => {
        assert.equal(sanitizeSize('18px'), '18px');
        assert.equal(sanitizeSize('2em'), '2em');
    });

    it('clamps extreme values', () => {
        assert.equal(sanitizeSize('9999px'), '96px');
        assert.equal(sanitizeSize('1000', 'phpbb'), '400%');
    });

    it('rejects nonsense', () => {
        assert.equal(sanitizeSize('big'), undefined);
        assert.equal(sanitizeSize('10px; color: red'), undefined);
    });
});

describe('sanitizeFontFamily', () => {
    it('quotes families that contain a space', () => {
        assert.equal(sanitizeFontFamily('Times New Roman'), "'Times New Roman'");
        assert.equal(sanitizeFontFamily('Arial, Verdana'), 'Arial, Verdana');
    });

    it('drops anything with punctuation', () => {
        assert.equal(sanitizeFontFamily('Arial;}body{display:none'), undefined);
    });
});

describe('sanitizeInteger', () => {
    it('accepts positive integers with an optional px suffix', () => {
        assert.equal(sanitizeInteger('100'), 100);
        assert.equal(sanitizeInteger('100px'), 100);
    });

    it('rejects everything else', () => {
        assert.equal(sanitizeInteger('0'), undefined);
        assert.equal(sanitizeInteger('-5'), undefined);
        assert.equal(sanitizeInteger('abc'), undefined);
        assert.equal(sanitizeInteger(undefined), undefined);
    });
});

describe('video ids', () => {
    it('extracts a YouTube id from every common URL shape', () => {
        assert.equal(youtubeId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
        assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
        assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=30'), 'dQw4w9WgXcQ');
        assert.equal(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
        assert.equal(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
        assert.equal(youtubeId('not a video'), undefined);
    });

    it('extracts a Vimeo id', () => {
        assert.equal(vimeoId('76979871'), '76979871');
        assert.equal(vimeoId('https://vimeo.com/76979871'), '76979871');
    });
});

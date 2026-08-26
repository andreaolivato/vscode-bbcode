/**
 * Value sanitisers.
 *
 * The renderer builds every element itself and escapes all text, so there is no
 * HTML parsing to defend against. What still needs checking are the *values*
 * that end up inside attributes: URLs, colours, sizes and font names.
 */

import { Dialect } from './tags';

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Escapes a value for use inside a double-quoted HTML attribute. */
export function escapeAttribute(value: string): string {
    return escapeHtml(value);
}

/**
 * Schemes a link is allowed to use. Anything else - most importantly
 * `javascript:` and `data:` - is rejected.
 */
const ALLOWED_SCHEMES = new Set([
    'http',
    'https',
    'mailto',
    'ftp',
    'ftps',
    'sftp',
    'tel',
    'irc',
    'ircs',
    'news',
    'nntp',
    'xmpp',
    'magnet',
    'steam',
    'ts3server',
    'mumble',
]);

const DATA_IMAGE = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[A-Za-z0-9+/=\s]+$/i;

/** Anything that looks like `host.tld`, so that `example.com:8080/x` survives. */
const HOSTNAME = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;

/**
 * C0 and C1 control characters. Browsers strip these from URLs before acting on
 * them, so a scheme check has to strip them first as well.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g');

export interface UrlOptions {
    /** Additionally allow `data:image/...;base64,` values. Used by `[img]`. */
    readonly allowDataImages?: boolean;
}

/**
 * Returns a safe absolute or relative URL, or undefined when the value must not
 * be turned into a link or an image source.
 */
export function sanitizeUrl(value: string, options: UrlOptions = {}): string | undefined {
    const url = value.replace(CONTROL_CHARS, '').trim();
    if (!url) {
        return undefined;
    }
    // Quotes and angle brackets never appear unencoded in a real URL; seeing
    // one means the value is trying to break out of the attribute.
    if (/["'<>`]/.test(url)) {
        return undefined;
    }

    const colon = url.indexOf(':');
    const pathStart = url.search(/[/?#]/);
    const looksSchemed = colon !== -1 && (pathStart === -1 || colon < pathStart);
    if (!looksSchemed) {
        // Relative or protocol-relative: safe by construction.
        return url;
    }

    const scheme = url.slice(0, colon).toLowerCase();
    if (ALLOWED_SCHEMES.has(scheme)) {
        return url;
    }
    if (scheme === 'data' && options.allowDataImages && DATA_IMAGE.test(url)) {
        return url;
    }
    if (HOSTNAME.test(scheme)) {
        // `example.com:8080/path` - a host and a port, not a scheme.
        return url;
    }
    return undefined;
}

/** True when the URL points at a remote host rather than the local file system. */
export function isRemoteUrl(url: string): boolean {
    return /^(?:https?:)?\/\//i.test(url) || /^(?:ftp|ftps|sftp):\/\//i.test(url);
}

const NAMED_COLORS = new Set(
    (
        'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
        'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
        'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
        'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
        'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
        'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
        'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
        'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
        'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
        'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
        'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
        'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
        'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
        'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
        'teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen'
    ).split(' '),
);

/** True when the value names a CSS colour keyword. */
export function isNamedColor(value: string): boolean {
    return NAMED_COLORS.has(value.trim().toLowerCase());
}

/** Returns a CSS colour value, or undefined when the input is not one. */
export function sanitizeColor(value: string): string | undefined {
    const color = value.trim().toLowerCase();
    if (!color) {
        return undefined;
    }
    if (NAMED_COLORS.has(color)) {
        return color;
    }
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(color)) {
        return color;
    }
    // Some engines accept a bare hex value without the leading hash.
    if (/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(color)) {
        return `#${color}`;
    }
    if (/^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)$/.test(color)) {
        return color;
    }
    if (/^hsla?\(\s*[\d.]+(?:deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*[\d.]+%?\s*)?\)$/.test(color)) {
        return color;
    }
    return undefined;
}

/** The classic HTML 1-7 font scale, used by vBulletin and friends. */
const SIZE_SCALE = ['0.63em', '0.82em', '1em', '1.13em', '1.5em', '2em', '2.5em'];

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Turns a `[size]` value into a CSS length.
 *
 * The meaning of a bare number depends on the engine: phpBB reads it as a
 * percentage, vBulletin as a step on the 1-7 scale. `generic` splits the
 * difference by treating 1-7 as scale steps and anything larger as a
 * percentage, which is how such documents were almost certainly written.
 */
export function sanitizeSize(value: string, dialect: Dialect = 'generic'): string | undefined {
    const size = value.trim().toLowerCase();
    if (!size) {
        return undefined;
    }

    const withUnit = /^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/.exec(size);
    if (withUnit) {
        const amount = Number(withUnit[1]);
        switch (withUnit[2]) {
            case 'px':
                return `${clamp(amount, 6, 96)}px`;
            case 'pt':
                return `${clamp(amount, 5, 72)}pt`;
            case 'em':
            case 'rem':
                return `${clamp(amount, 0.3, 6)}${withUnit[2]}`;
            default:
                return `${clamp(amount, 20, 400)}%`;
        }
    }

    if (!/^\d+(?:\.\d+)?$/.test(size)) {
        return undefined;
    }

    const amount = Number(size);
    const scaleDialects: Dialect[] = ['vbulletin', 'smf', 'mybb'];
    const useScale = scaleDialects.includes(dialect) || (dialect === 'generic' && amount <= 7);

    if (useScale) {
        const step = clamp(Math.round(amount), 1, 7);
        return SIZE_SCALE[step - 1];
    }
    return `${clamp(amount, 20, 400)}%`;
}

/** Returns a safe `font-family` value, or undefined. */
export function sanitizeFontFamily(value: string): string | undefined {
    const families = value
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter((part) => /^[A-Za-z0-9 _-]{1,64}$/.test(part));
    if (families.length === 0) {
        return undefined;
    }
    return families.map((family) => (/\s/.test(family) ? `'${family}'` : family)).join(', ');
}

/** Returns a positive integer, for width/height/colspan style parameters. */
export function sanitizeInteger(value: string | undefined, max = 10000): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const match = /^(\d+)(?:px)?$/.exec(value.trim());
    if (!match) {
        return undefined;
    }
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
        return undefined;
    }
    return Math.min(amount, max);
}

/** Extracts a YouTube video ID from a URL, or returns a bare ID unchanged. */
export function youtubeId(value: string): string | undefined {
    const input = value.trim();
    const patterns = [
        /(?:youtube\.com|youtube-nocookie\.com)\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)([A-Za-z0-9_-]{6,20})/i,
        /youtu\.be\/([A-Za-z0-9_-]{6,20})/i,
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(input);
        if (match) {
            return match[1];
        }
    }
    if (/^[A-Za-z0-9_-]{6,20}$/.test(input)) {
        return input;
    }
    return undefined;
}

/** Extracts a Vimeo video ID from a URL, or returns a bare ID unchanged. */
export function vimeoId(value: string): string | undefined {
    const input = value.trim();
    if (/^\d{6,12}$/.test(input)) {
        return input;
    }
    const match = /vimeo\.com\/(?:video\/)?(\d{6,12})/i.exec(input);
    return match?.[1];
}

/**
 * Named colours dark enough that light text reads better on them. Only the
 * keywords people actually reach for as a highlight are listed; anything not
 * here falls back to the stylesheet's dark-on-light default.
 */
const DARK_NAMED_COLORS = new Set(
    (
        'black navy darkblue mediumblue blue midnightblue darkslateblue slateblue indigo purple darkmagenta ' +
        'darkviolet darkorchid maroon darkred firebrick brown crimson red saddlebrown sienna darkolivegreen ' +
        'darkgreen green forestgreen seagreen darkslategray darkslategrey darkcyan teal olive dimgray dimgrey ' +
        'gray grey slategray slategrey steelblue royalblue mediumvioletred darkgoldenrod'
    ).split(' '),
);

/** Relative luminance of an sRGB triple, per WCAG. */
function relativeLuminance(red: number, green: number, blue: number): number {
    const channel = (value: number): number => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/**
 * A foreground colour to pair with `background`, or undefined when the default
 * dark-on-light pairing is already right (or the colour cannot be measured).
 */
export function contrastForeground(background: string): string | undefined {
    const color = background.trim().toLowerCase();

    if (DARK_NAMED_COLORS.has(color)) {
        return '#f8fafc';
    }

    const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(color);
    if (hex) {
        const digits = hex[1];
        const short = digits.length <= 4;
        const part = (index: number): number => {
            const slice = short
                ? digits[index].repeat(2)
                : digits.slice(index * 2, index * 2 + 2);
            return parseInt(slice, 16);
        };
        return relativeLuminance(part(0), part(1), part(2)) < 0.4 ? '#f8fafc' : undefined;
    }

    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color);
    if (rgb) {
        return relativeLuminance(Number(rgb[1]), Number(rgb[2]), Number(rgb[3])) < 0.4
            ? '#f8fafc'
            : undefined;
    }

    const hsl = /^hsla?\(\s*[\d.]+(?:deg)?\s*,\s*[\d.]+%\s*,\s*([\d.]+)%/.exec(color);
    if (hsl) {
        return Number(hsl[1]) < 45 ? '#f8fafc' : undefined;
    }

    return undefined;
}

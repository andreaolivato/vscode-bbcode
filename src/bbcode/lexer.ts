/**
 * Turns BBCode source into a flat token stream.
 *
 * The lexer is deliberately forgiving: anything that does not look like a
 * well-formed tag is emitted as text, which is what forum engines do. Every
 * token carries absolute source offsets so that the preview can map rendered
 * HTML back to editor lines.
 */

export interface TokenBase {
    /** Inclusive offset of the first character of the token. */
    readonly start: number;
    /** Exclusive offset just past the last character of the token. */
    readonly end: number;
}

export interface TextToken extends TokenBase {
    readonly type: 'text';
    readonly value: string;
    /**
     * True when the text came from the body of a `raw` tag such as `[code]`.
     * Raw text must not be auto-linked or emoticon-substituted.
     */
    readonly raw: boolean;
}

export interface OpenToken extends TokenBase {
    readonly type: 'open';
    /** Lower-cased tag name. */
    readonly name: string;
    /** The name exactly as written, for diagnostics. */
    readonly rawName: string;
    /** The `value` in `[tag=value]`, if any. */
    readonly value?: string;
    /** Named parameters, keyed by lower-cased name. */
    readonly params: Readonly<Record<string, string>>;
}

export interface CloseToken extends TokenBase {
    readonly type: 'close';
    readonly name: string;
    readonly rawName: string;
}

export type Token = TextToken | OpenToken | CloseToken;

/**
 * The longest `[...]` run the lexer will consider a tag. Anything longer is
 * treated as literal text so that stray brackets in prose stay cheap to scan.
 */
const MAX_TAG_LENGTH = 2048;

const NAME_PATTERN = /^[A-Za-z*][A-Za-z0-9*_.-]*$/;

/** A `key=` boundary that separates the default value from named parameters. */
const PARAM_BOUNDARY = /\s+([A-Za-z_][A-Za-z0-9_-]*)=/;

export interface LexerOptions {
    /**
     * Returns true for tags whose body must be captured verbatim, such as
     * `[code]` or `[noparse]`.
     */
    isRawTag?(name: string): boolean;
}

export function tokenize(source: string, options: LexerOptions = {}): Token[] {
    const isRawTag = options.isRawTag ?? (() => false);
    const tokens: Token[] = [];
    const length = source.length;

    let index = 0;
    let textStart = 0;

    const flushText = (until: number, raw = false): void => {
        if (until > textStart) {
            tokens.push({
                type: 'text',
                value: source.slice(textStart, until),
                start: textStart,
                end: until,
                raw,
            });
        }
    };

    while (index < length) {
        const bracket = source.indexOf('[', index);
        if (bracket === -1) {
            break;
        }

        const tag = readTag(source, bracket);
        if (!tag) {
            // Not a tag after all; keep scanning from just past the bracket so
            // the character ends up in the surrounding text token.
            index = bracket + 1;
            continue;
        }

        flushText(bracket);
        tokens.push(tag);
        index = tag.end;
        textStart = tag.end;

        if (tag.type === 'open' && isRawTag(tag.name)) {
            const closing = findClosingTag(source, tag.name, tag.end);
            // Without a closing tag there is no body to protect, and swallowing
            // the rest of the document would be far worse than losing the raw
            // treatment. Fall back to ordinary lexing and let the parser
            // report the tag as unclosed.
            if (closing) {
                if (closing.start > tag.end) {
                    tokens.push({
                        type: 'text',
                        value: source.slice(tag.end, closing.start),
                        start: tag.end,
                        end: closing.start,
                        raw: true,
                    });
                }
                tokens.push(closing);
                index = closing.end;
                textStart = index;
            }
        }
    }

    flushText(length);
    return tokens;
}

/**
 * Attempts to read a tag starting at `at`, which must point at a `[`.
 * Returns undefined when the text is not a well-formed tag.
 */
function readTag(source: string, at: number): OpenToken | CloseToken | undefined {
    const limit = Math.min(source.length, at + MAX_TAG_LENGTH);
    let quote: string | undefined;
    let close = -1;

    for (let i = at + 1; i < limit; i++) {
        const ch = source[i];
        if (quote) {
            if (ch === quote) {
                quote = undefined;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === '[' || ch === '\n') {
            // Tags never nest or span lines; bail out early.
            return undefined;
        }
        if (ch === ']') {
            close = i;
            break;
        }
    }

    if (close === -1) {
        return undefined;
    }

    let body = source.slice(at + 1, close);
    const isClosing = body.startsWith('/');
    if (isClosing) {
        body = body.slice(1);
    }

    const nameMatch = /^[A-Za-z*][A-Za-z0-9*_.-]*/.exec(body);
    if (!nameMatch) {
        return undefined;
    }
    const rawName = nameMatch[0];
    if (!NAME_PATTERN.test(rawName)) {
        return undefined;
    }

    const rest = body.slice(rawName.length);

    if (isClosing) {
        // A closing tag may not carry attributes.
        if (rest.trim() !== '') {
            return undefined;
        }
        return {
            type: 'close',
            name: rawName.toLowerCase(),
            rawName,
            start: at,
            end: close + 1,
        };
    }

    const { value, params } = parseAttributes(rest);
    return {
        type: 'open',
        name: rawName.toLowerCase(),
        rawName,
        value,
        params,
        start: at,
        end: close + 1,
    };
}

/**
 * Parses the part of a tag that follows its name.
 *
 * Two shapes are supported and may be combined:
 *
 * - `=value`, the default value, as in `[color=red]`
 * - `key=value` pairs, as in `[quote author=Bob post=12]`
 *
 * An unquoted default value extends up to the first ` key=` boundary, so that
 * `[color=dark red]` keeps its space while `[quote=Bob post=12]` splits.
 */
export function parseAttributes(rest: string): { value?: string; params: Record<string, string> } {
    const params: Record<string, string> = {};
    let value: string | undefined;
    let remainder = rest;

    if (remainder.startsWith('=')) {
        remainder = remainder.slice(1);
        const quoted = readQuoted(remainder);
        if (quoted) {
            value = quoted.value;
            remainder = quoted.rest;
        } else {
            const boundary = PARAM_BOUNDARY.exec(remainder);
            const cut = boundary ? boundary.index : remainder.length;
            value = remainder.slice(0, cut).trim();
            remainder = remainder.slice(cut);
        }
    }

    const pair = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s\]]*)/g;
    let match: RegExpExecArray | null;
    while ((match = pair.exec(remainder)) !== null) {
        params[match[1].toLowerCase()] = unquote(match[2]);
    }

    return { value, params };
}

function readQuoted(input: string): { value: string; rest: string } | undefined {
    const trimmed = input.replace(/^\s+/, '');
    const quote = trimmed[0];
    if (quote !== '"' && quote !== "'") {
        return undefined;
    }
    const end = trimmed.indexOf(quote, 1);
    if (end === -1) {
        return undefined;
    }
    return { value: trimmed.slice(1, end), rest: trimmed.slice(end + 1) };
}

function unquote(input: string): string {
    if (input.length >= 2) {
        const first = input[0];
        if ((first === '"' || first === "'") && input[input.length - 1] === first) {
            return input.slice(1, -1);
        }
    }
    return input;
}

/** Finds the next `[/name]` at or after `from`, ignoring case. */
function findClosingTag(source: string, name: string, from: number): CloseToken | undefined {
    const needle = `[/${name}`;
    const haystack = source.toLowerCase();
    let index = from;

    for (;;) {
        const found = haystack.indexOf(needle, index);
        if (found === -1) {
            return undefined;
        }
        const after = haystack.slice(found + needle.length);
        const trailing = /^\s*\]/.exec(after);
        if (trailing) {
            const end = found + needle.length + trailing[0].length;
            return {
                type: 'close',
                name,
                rawName: source.slice(found + 2, found + 2 + name.length),
                start: found,
                end,
            };
        }
        index = found + needle.length;
    }
}

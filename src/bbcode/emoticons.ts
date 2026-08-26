/**
 * Text emoticon substitution, as most forum engines perform it.
 *
 * Matching happens against text that has already been HTML-escaped, so the
 * patterns are built from the escaped form of each emoticon: `<3` is matched as
 * `&lt;3`.
 */

import { escapeHtml } from './sanitize';

export const EMOTICONS: ReadonlyArray<readonly [string, string]> = [
    [':)', '🙂'],
    [':-)', '🙂'],
    [':(', '🙁'],
    [':-(', '🙁'],
    [':D', '😀'],
    [':-D', '😀'],
    [':P', '😛'],
    [':-P', '😛'],
    [';)', '😉'],
    [';-)', '😉'],
    [':o', '😮'],
    [':O', '😮'],
    [':-o', '😮'],
    [":'(", '😢'],
    [':|', '😐'],
    [':-|', '😐'],
    [':/', '😕'],
    [':-/', '😕'],
    ['8)', '😎'],
    ['8-)', '😎'],
    ['>:(', '😠'],
    ['<3', '❤️'],
    [':heart:', '❤️'],
    [':thumbsup:', '👍'],
    [':thumbsdown:', '👎'],
    [':fire:', '🔥'],
    [':cool:', '😎'],
    [':lol:', '😂'],
    [':cry:', '😢'],
    [':wink:', '😉'],
    [':shock:', '😱'],
    [':evil:', '😈'],
    [':idea:', '💡'],
    [':arrow:', '➡️'],
    [':star:', '⭐'],
];

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escaped emoticon text to emoji. */
const LOOKUP = new Map(EMOTICONS.map(([text, emoji]) => [escapeHtml(text), emoji] as const));

/** Escaped emoticon text to the original, for the tooltip. */
const ORIGINAL = new Map(EMOTICONS.map(([text]) => [escapeHtml(text), text] as const));

/**
 * Longest alternatives first so that `:-)` wins over `:-`, and only at a word
 * boundary so that URLs and things like `C:/tmp` are left alone.
 */
const PATTERN = new RegExp(
    `(?<=^|[\\s(\\[{;"'])(?:${[...LOOKUP.keys()]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join('|')})(?=$|[\\s.,!?)\\]}&])`,
    'g',
);

/**
 * Replaces text emoticons in an already HTML-escaped string.
 * Returns HTML.
 */
export function replaceEmoticons(escapedText: string): string {
    return escapedText.replace(PATTERN, (match) => {
        const emoji = LOOKUP.get(match);
        if (!emoji) {
            return match;
        }
        const title = escapeHtml(ORIGINAL.get(match) ?? match);
        return `<span class="bb-emoticon" title="${title}">${emoji}</span>`;
    });
}

/**
 * Works out what the caret is sitting inside, from the text before it on the
 * current line. Kept free of the `vscode` module so it can be unit-tested.
 */

export type CompletionContext =
    | { kind: 'none'; start: number }
    | { kind: 'tagName'; prefix: string; start: number }
    | { kind: 'closingTag'; prefix: string; start: number }
    | { kind: 'value'; tag: string; prefix: string; start: number }
    | { kind: 'paramName'; tag: string; prefix: string; start: number }
    | { kind: 'paramValue'; tag: string; param: string; prefix: string; start: number };

/**
 * Looks backwards for an unterminated `[`. All returned offsets are relative to
 * the start of the line.
 */
export function analyzeCompletion(lineBeforeCaret: string): CompletionContext {
    const open = lineBeforeCaret.lastIndexOf('[');
    if (open === -1 || lineBeforeCaret.indexOf(']', open) !== -1) {
        return { kind: 'none', start: lineBeforeCaret.length };
    }

    const body = lineBeforeCaret.slice(open + 1);

    if (body.startsWith('/')) {
        return { kind: 'closingTag', prefix: body.slice(1), start: open + 1 };
    }

    const name = /^[A-Za-z*][A-Za-z0-9*_.-]*/.exec(body);
    if (!name) {
        // Only an empty or single-character prefix can still become a tag name.
        return /^[A-Za-z*]?$/.test(body)
            ? { kind: 'tagName', prefix: body, start: open + 1 }
            : { kind: 'none', start: lineBeforeCaret.length };
    }

    const rest = body.slice(name[0].length);
    if (rest === '') {
        return { kind: 'tagName', prefix: body, start: open + 1 };
    }

    if (rest.startsWith('=')) {
        const value = rest.slice(1);
        if (/\s/.test(value)) {
            return analyzeParams(name[0], value, open + 1 + name[0].length + 1);
        }
        return { kind: 'value', tag: name[0], prefix: value, start: open + 2 + name[0].length };
    }

    if (/^\s/.test(rest)) {
        return analyzeParams(name[0], rest, open + 1 + name[0].length);
    }

    return { kind: 'none', start: lineBeforeCaret.length };
}

function analyzeParams(tag: string, rest: string, restStart: number): CompletionContext {
    const lastSpace = rest.lastIndexOf(' ');
    const current = rest.slice(lastSpace + 1);
    const start = restStart + lastSpace + 1;

    const equals = current.indexOf('=');
    if (equals === -1) {
        return { kind: 'paramName', tag, prefix: current, start };
    }
    return {
        kind: 'paramValue',
        tag,
        param: current.slice(0, equals).toLowerCase(),
        prefix: current.slice(equals + 1),
        start: start + equals + 1,
    };
}

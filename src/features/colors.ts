/**
 * Puts a colour swatch and the native colour picker next to `[color=...]` and
 * `[bgcolor=...]` values.
 */

import * as vscode from 'vscode';

import { isNamedColor, sanitizeColor } from '../bbcode/sanitize';

const COLOR_TAG = /\[(color|colour|bgcolor|bg|highlight|mark)=([^\]\s][^\]]*)\]/gi;

export class BBCodeColorProvider implements vscode.DocumentColorProvider {
    provideDocumentColors(document: vscode.TextDocument): vscode.ColorInformation[] {
        const text = document.getText();
        const result: vscode.ColorInformation[] = [];
        COLOR_TAG.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = COLOR_TAG.exec(text)) !== null) {
            const raw = match[2].trim();
            const normalized = sanitizeColor(raw);
            if (!normalized) {
                continue;
            }
            const color = parseColor(normalized);
            if (!color) {
                continue;
            }
            const valueStart = match.index + match[0].indexOf('=', match[1].length) + 1;
            const range = new vscode.Range(
                document.positionAt(valueStart),
                document.positionAt(valueStart + match[2].length),
            );
            result.push(new vscode.ColorInformation(range, color));
        }

        return result;
    }

    provideColorPresentations(
        color: vscode.Color,
        context: { document: vscode.TextDocument; range: vscode.Range },
    ): vscode.ColorPresentation[] {
        const original = context.document.getText(context.range).trim();
        const presentations = [new vscode.ColorPresentation(toHex(color))];

        // Offer to keep a colour keyword when the value already was one.
        if (isNamedColor(original) && color.alpha === 1) {
            const named = NAMED_LOOKUP.get(toHex(color));
            if (named) {
                presentations.push(new vscode.ColorPresentation(named));
            }
        }
        presentations.push(new vscode.ColorPresentation(toRgb(color)));
        return presentations;
    }
}

function toHex(color: vscode.Color): string {
    const part = (value: number): string =>
        Math.round(value * 255)
            .toString(16)
            .padStart(2, '0');
    const alpha = color.alpha < 1 ? part(color.alpha) : '';
    return `#${part(color.red)}${part(color.green)}${part(color.blue)}${alpha}`;
}

function toRgb(color: vscode.Color): string {
    const part = (value: number): number => Math.round(value * 255);
    if (color.alpha < 1) {
        return `rgba(${part(color.red)}, ${part(color.green)}, ${part(color.blue)}, ${round(color.alpha)})`;
    }
    return `rgb(${part(color.red)}, ${part(color.green)}, ${part(color.blue)})`;
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/** A handful of common keywords, so the picker can round-trip them. */
const NAMED_COLORS: Record<string, string> = {
    black: '#000000',
    white: '#ffffff',
    red: '#ff0000',
    lime: '#00ff00',
    blue: '#0000ff',
    yellow: '#ffff00',
    cyan: '#00ffff',
    magenta: '#ff00ff',
    silver: '#c0c0c0',
    gray: '#808080',
    maroon: '#800000',
    olive: '#808000',
    green: '#008000',
    purple: '#800080',
    teal: '#008080',
    navy: '#000080',
    orange: '#ffa500',
};

const NAMED_LOOKUP = new Map(Object.entries(NAMED_COLORS).map(([name, hex]) => [hex, name] as const));

function parseColor(value: string): vscode.Color | undefined {
    const named = NAMED_COLORS[value];
    const input = named ?? value;

    const hex = /^#([0-9a-f]{3,8})$/i.exec(input);
    if (hex) {
        const digits = hex[1];
        const expand = (part: string): number => parseInt(part.length === 1 ? part + part : part, 16) / 255;
        if (digits.length === 3 || digits.length === 4) {
            return new vscode.Color(
                expand(digits[0]),
                expand(digits[1]),
                expand(digits[2]),
                digits.length === 4 ? expand(digits[3]) : 1,
            );
        }
        if (digits.length === 6 || digits.length === 8) {
            return new vscode.Color(
                expand(digits.slice(0, 2)),
                expand(digits.slice(2, 4)),
                expand(digits.slice(4, 6)),
                digits.length === 8 ? expand(digits.slice(6, 8)) : 1,
            );
        }
        return undefined;
    }

    const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(input);
    if (rgb) {
        return new vscode.Color(
            Number(rgb[1]) / 255,
            Number(rgb[2]) / 255,
            Number(rgb[3]) / 255,
            rgb[4] === undefined ? 1 : Number(rgb[4]),
        );
    }

    return undefined;
}

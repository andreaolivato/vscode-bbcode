/**
 * Turns a parsed BBCode document into HTML.
 *
 * Every piece of text is escaped and every attribute value is validated, so the
 * output is safe to drop into a webview with a strict content security policy.
 * Block-level elements carry a `data-bb-line` attribute that maps them back to
 * a line in the source, which is what drives scroll sync in the preview.
 */

import { Node, RootNode, TagNode } from './ast';
import { replaceEmoticons } from './emoticons';
import { ParseResult, parse } from './parser';
import { TagResolver, createResolver } from './resolver';
import {
    contrastForeground,
    escapeAttribute,
    escapeHtml,
    isRemoteUrl,
    sanitizeColor,
    sanitizeFontFamily,
    sanitizeInteger,
    sanitizeSize,
    sanitizeUrl,
    vimeoId,
    youtubeId,
} from './sanitize';
import { Dialect } from './tags';

export interface RenderOptions {
    readonly dialect: Dialect;
    /** How line breaks become HTML. */
    readonly newlineMode: 'br' | 'paragraph';
    readonly autoLink: boolean;
    readonly emoticons: boolean;
    /** When false, remote images are replaced by a placeholder link. */
    readonly remoteImages: boolean;
    /** When false, video tags render as links instead of players. */
    readonly embedVideos: boolean;
    readonly unknownTags: 'text' | 'strip';
    /** Emit `data-bb-line` attributes. */
    readonly sourceMap: boolean;
    /**
     * Rewrites a URL so the preview can load it, typically by turning a
     * workspace-relative path into a `vscode-webview-resource:` URI. Returning
     * undefined hides the resource.
     */
    readonly resolveResource?: (url: string) => string | undefined;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
    dialect: 'generic',
    newlineMode: 'br',
    autoLink: true,
    emoticons: true,
    remoteImages: true,
    embedVideos: true,
    unknownTags: 'text',
    sourceMap: false,
};

interface Context {
    /** Inside a `raw` tag: no auto-linking, no emoticons. */
    readonly inRaw: boolean;
    /** Inside `[url]` or `[email]`: do not auto-link again. */
    readonly inLink: boolean;
    /** The current position accepts block-level children. */
    readonly block: boolean;
}

const ROOT_CONTEXT: Context = { inRaw: false, inLink: false, block: true };

/** Convenience wrapper that parses and renders in one step. */
export function renderBBCode(
    source: string,
    options: Partial<RenderOptions> = {},
    resolver?: TagResolver,
): string {
    const merged = { ...DEFAULT_RENDER_OPTIONS, ...options };
    const tagResolver = resolver ?? createResolver(merged.dialect);
    return render(parse(source, { resolver: tagResolver }), merged);
}

export function render(result: ParseResult, options: Partial<RenderOptions> = {}): string {
    return new Renderer(result, { ...DEFAULT_RENDER_OPTIONS, ...options }).run();
}

class Renderer {
    private readonly options: RenderOptions;
    private readonly source: string;
    private readonly root: RootNode;
    private readonly lineStarts: number[];

    constructor(result: ParseResult, options: RenderOptions) {
        this.options = options;
        this.source = result.source;
        this.root = result.root;
        this.lineStarts = computeLineStarts(result.source);
    }

    run(): string {
        return this.renderChildren(this.root.children, ROOT_CONTEXT);
    }

    // ------------------------------------------------------------- utilities

    /** Zero-based line number containing `offset`. */
    private lineOf(offset: number): number {
        let low = 0;
        let high = this.lineStarts.length - 1;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (this.lineStarts[mid] <= offset) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return low;
    }

    /** The `data-bb-line` attribute for a node, or an empty string. */
    private lineAttr(offset: number): string {
        return this.options.sourceMap ? ` data-bb-line="${this.lineOf(offset)}"` : '';
    }

    // --------------------------------------------------------------- children

    private renderChildren(children: readonly Node[], ctx: Context): string {
        const cleaned = trimBreaksAroundBlocks(children);
        if (this.options.newlineMode === 'paragraph' && ctx.block) {
            return this.renderParagraphs(cleaned, ctx);
        }
        return cleaned.map((child) => this.renderNode(child, ctx)).join('');
    }

    /**
     * Groups inline content into `<p>` elements, splitting on blank lines and
     * letting block-level children stand on their own.
     */
    private renderParagraphs(children: readonly Node[], ctx: Context): string {
        const out: string[] = [];
        let paragraph: string[] = [];
        let paragraphStart: number | undefined;

        const flush = (): void => {
            // A break at either edge of a paragraph is the separator itself,
            // not content, so it never survives into the output.
            const html = paragraph
                .join('')
                .replace(/^(?:\s*<br>\s*)+/, '')
                .replace(/(?:\s*<br>\s*)+$/, '')
                .trim();
            paragraph = [];
            if (html) {
                out.push(`<p${this.lineAttr(paragraphStart ?? 0)}>${html}</p>`);
            }
            paragraphStart = undefined;
        };

        for (const child of children) {
            if (isBlockLevel(child)) {
                flush();
                out.push(this.renderNode(child, ctx));
                continue;
            }

            if (child.type === 'text' && !child.raw) {
                const parts = child.value.split(/\n[ \t]*\n+/);
                parts.forEach((part, index) => {
                    if (index > 0) {
                        flush();
                    }
                    if (paragraphStart === undefined && part.trim()) {
                        paragraphStart = child.start;
                    }
                    paragraph.push(this.renderText(part, ctx));
                });
                continue;
            }

            if (paragraphStart === undefined) {
                paragraphStart = child.start;
            }
            paragraph.push(this.renderNode(child, ctx));
        }

        flush();
        return out.join('\n');
    }

    private renderNode(node: Node, ctx: Context): string {
        switch (node.type) {
            case 'text':
                return this.renderText(node.value, node.raw ? { ...ctx, inRaw: true } : ctx);
            case 'unknown':
                return this.options.unknownTags === 'strip' ? '' : escapeHtml(node.source);
            case 'tag':
                return this.renderTag(node, ctx);
        }
    }

    // ------------------------------------------------------------------ text

    private renderText(text: string, ctx: Context): string {
        if (!text) {
            return '';
        }
        if (ctx.inRaw) {
            return escapeHtml(text);
        }

        const html =
            this.options.autoLink && !ctx.inLink ? this.linkify(text, ctx) : this.decorate(escapeHtml(text));

        return html.replace(/\r?\n/g, '<br>\n');
    }

    /** Applies emoticon substitution to already-escaped text. */
    private decorate(escaped: string): string {
        return this.options.emoticons ? replaceEmoticons(escaped) : escaped;
    }

    private linkify(text: string, ctx: Context): string {
        const out: string[] = [];
        let last = 0;
        AUTO_LINK.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = AUTO_LINK.exec(text)) !== null) {
            const found = trimTrailingPunctuation(match[0]);
            if (!found) {
                continue;
            }
            const start = match.index;
            const end = start + found.length;
            AUTO_LINK.lastIndex = end;

            const href = found.includes('@') && !/^[a-z][a-z0-9+.-]*:/i.test(found)
                ? `mailto:${found}`
                : /^www\./i.test(found)
                  ? `https://${found}`
                  : found;
            const safe = sanitizeUrl(href);
            if (!safe) {
                continue;
            }

            out.push(this.decorate(escapeHtml(text.slice(last, start))));
            out.push(
                `<a class="bb-link bb-autolink" href="${escapeAttribute(safe)}" title="${escapeAttribute(safe)}">${escapeHtml(found)}</a>`,
            );
            last = end;
        }

        out.push(this.decorate(escapeHtml(text.slice(last))));
        void ctx;
        return out.join('');
    }

    // ------------------------------------------------------------------ tags

    private renderTag(node: TagNode, ctx: Context): string {
        const custom = node.tag.custom;
        if (custom) {
            return this.renderCustom(node, ctx);
        }

        const inline = { ...ctx, block: false };
        const block = { ...ctx, block: true };
        const line = this.lineAttr(node.start);

        switch (node.name) {
            // ------------------------------------------------------ formatting
            case 'b':
                return `<strong>${this.renderChildren(node.children, inline)}</strong>`;
            case 'i':
                return `<em>${this.renderChildren(node.children, inline)}</em>`;
            case 'u':
                return `<span class="bb-underline">${this.renderChildren(node.children, inline)}</span>`;
            case 's':
                return `<s>${this.renderChildren(node.children, inline)}</s>`;
            case 'ins':
                return `<ins>${this.renderChildren(node.children, inline)}</ins>`;
            case 'sub':
                return `<sub>${this.renderChildren(node.children, inline)}</sub>`;
            case 'sup':
                return `<sup>${this.renderChildren(node.children, inline)}</sup>`;
            case 'color':
                return this.styledSpan(node, inline, 'color', sanitizeColor(node.value ?? ''));
            case 'bgcolor':
                return this.highlight(node, inline);
            case 'size':
                return this.styledSpan(
                    node,
                    inline,
                    'font-size',
                    sanitizeSize(node.value ?? '', this.options.dialect),
                );
            case 'font':
                return this.styledSpan(node, inline, 'font-family', sanitizeFontFamily(node.value ?? ''));
            case 'h1':
            case 'h2':
            case 'h3':
            case 'h4':
            case 'h5':
            case 'h6':
                return `<${node.name} class="bb-heading"${line}>${this.renderChildren(node.children, inline)}</${node.name}>`;

            // ------------------------------------------------------- structure
            case 'left':
            case 'center':
            case 'right':
            case 'justify':
                return this.alignedBlock(node, block, node.name);
            case 'align':
                return this.alignedBlock(node, block, (node.value ?? 'left').toLowerCase());
            case 'indent':
                return this.indentBlock(node, block);
            case 'quote':
                return this.quote(node, block);
            case 'spoiler':
                return this.spoiler(node, block);
            case 'box':
                return this.box(node, block);
            case 'hr':
                return `<hr class="bb-hr"${line}>`;
            case 'br':
                return '<br>';
            case 'float': {
                const side = (node.value ?? 'left').toLowerCase() === 'right' ? 'right' : 'left';
                return `<div class="bb-float bb-float-${side}"${line}>${this.renderChildren(node.children, block)}</div>`;
            }

            // ------------------------------------------------------------ lists
            case 'list':
            case 'ul':
            case 'ol':
                return this.list(node, block);
            case '*':
            case 'li':
                return `<li${line}>${this.renderChildren(node.children, block)}</li>`;

            // ------------------------------------------------------------ links
            case 'url':
                return this.link(node, ctx);
            case 'email':
                return this.email(node, ctx);
            case 'user':
                return this.mention(node, inline);
            case 'anchor':
                return `<a class="bb-anchor" id="bb-${escapeAttribute(slug(node.value ?? ''))}">${this.renderChildren(node.children, inline)}</a>`;

            // ------------------------------------------------------------ media
            case 'img':
                return this.image(node);
            case 'youtube':
                return this.youtube(node, this.textOf(node));
            case 'vimeo':
                return this.vimeo(node, this.textOf(node));
            case 'media':
                return this.media(node);
            case 'video':
                return this.video(node);
            case 'audio':
                return this.audio(node);
            case 'attach':
                return `<span class="bb-attachment" title="Attachment">📎 ${escapeHtml(this.textOf(node))}</span>`;

            // ------------------------------------------------------------- code
            case 'code':
            case 'php':
                return this.code(node, node.name === 'php' ? 'php' : this.codeLanguage(node));
            case 'icode':
                return `<code class="bb-inline-code">${escapeHtml(this.textOf(node))}</code>`;
            case 'pre':
                return `<pre class="bb-pre"${line}>${escapeHtml(stripOuterNewlines(this.textOf(node)))}</pre>`;
            case 'noparse':
                return this.decorate(escapeHtml(this.textOf(node))).replace(/\r?\n/g, '<br>\n');

            // ----------------------------------------------------------- tables
            case 'table':
                return `<div class="bb-table-wrap"${line}><table class="bb-table">${this.renderChildren(node.children, block)}</table></div>`;
            case 'thead':
            case 'tbody':
                return `<${node.name}>${this.renderChildren(node.children, block)}</${node.name}>`;
            case 'tr':
                return `<tr${line}>${this.renderChildren(node.children, block)}</tr>`;
            case 'td':
            case 'th':
                return this.cell(node, block);

            // ------------------------------------------------------------- misc
            case 'abbr':
                return `<abbr title="${escapeAttribute(node.value ?? '')}">${this.renderChildren(node.children, inline)}</abbr>`;
            case 'tt':
                return `<code class="bb-monospace">${this.renderChildren(node.children, inline)}</code>`;
            case 'time':
                return this.time(node);
            default:
                // A tag the registry knows about but this renderer has no
                // special handling for: keep the content, drop the wrapper.
                return this.renderChildren(node.children, ctx);
        }
    }

    // ------------------------------------------------------------- tag helpers

    private styledSpan(
        node: TagNode,
        ctx: Context,
        property: string,
        value: string | undefined,
        className = '',
    ): string {
        const content = this.renderChildren(node.children, ctx);
        if (!value) {
            return content;
        }
        const classes = className ? ` class="${className}"` : '';
        return `<span${classes} style="${property}:${escapeAttribute(value)}">${content}</span>`;
    }

    /**
     * `[bgcolor]` needs a foreground that stays readable. The stylesheet
     * assumes a light highlight, which is the convention; only a background we
     * can prove is dark gets an explicit light foreground.
     */
    private highlight(node: TagNode, ctx: Context): string {
        const content = this.renderChildren(node.children, ctx);
        const background = sanitizeColor(node.value ?? '');
        if (!background) {
            return content;
        }
        const foreground = contrastForeground(background);
        const style = foreground
            ? `background-color:${background};color:${foreground}`
            : `background-color:${background}`;
        return `<span class="bb-highlight" style="${escapeAttribute(style)}">${content}</span>`;
    }

    private alignedBlock(node: TagNode, ctx: Context, alignment: string): string {
        const allowed = ['left', 'center', 'centre', 'right', 'justify'];
        const value = allowed.includes(alignment) ? (alignment === 'centre' ? 'center' : alignment) : 'left';
        return `<div class="bb-align bb-align-${value}"${this.lineAttr(node.start)}>${this.renderChildren(node.children, ctx)}</div>`;
    }

    private indentBlock(node: TagNode, ctx: Context): string {
        const levels = Math.min(Math.max(sanitizeInteger(node.value) ?? 1, 1), 8);
        return `<div class="bb-indent" style="margin-left:${levels * 2}em"${this.lineAttr(node.start)}>${this.renderChildren(node.children, ctx)}</div>`;
    }

    private quote(node: TagNode, ctx: Context): string {
        const author = node.value ?? node.params.author ?? node.params.name ?? '';
        const link = node.params.link ?? node.params.url ?? '';
        const safeLink = link ? sanitizeUrl(link) : undefined;

        let head = '';
        if (author) {
            const name = `<span class="bb-quote-author">${escapeHtml(author)}</span>`;
            const label = `${name} said:`;
            head = safeLink
                ? `<div class="bb-quote-head"><a class="bb-link" href="${escapeAttribute(safeLink)}">${label}</a></div>`
                : `<div class="bb-quote-head">${label}</div>`;
        }

        return `<blockquote class="bb-quote"${this.lineAttr(node.start)}>${head}<div class="bb-quote-body">${this.renderChildren(node.children, ctx)}</div></blockquote>`;
    }

    private spoiler(node: TagNode, ctx: Context): string {
        const title = node.value ?? node.params.title ?? 'Spoiler';
        return `<details class="bb-spoiler"${this.lineAttr(node.start)}><summary>${escapeHtml(title)}</summary><div class="bb-spoiler-body">${this.renderChildren(node.children, ctx)}</div></details>`;
    }

    private box(node: TagNode, ctx: Context): string {
        const title = node.value ?? node.params.title;
        const head = title ? `<div class="bb-box-head">${escapeHtml(title)}</div>` : '';
        return `<div class="bb-box"${this.lineAttr(node.start)}>${head}<div class="bb-box-body">${this.renderChildren(node.children, ctx)}</div></div>`;
    }

    private list(node: TagNode, ctx: Context): string {
        const line = this.lineAttr(node.start);
        const type = (node.value ?? '').trim();
        const groups = groupListItems(node.children);

        const body =
            groups.length > 0
                ? groups
                      .map((group) => {
                          const [head, ...rest] = group;
                          // A nested list closes the item it follows, so it
                          // arrives as a sibling; put it back inside the item.
                          const inner =
                              (head.type === 'tag' && head.name !== 'list'
                                  ? this.renderChildren(head.children, ctx)
                                  : this.renderNode(head, ctx)) +
                              rest.map((child) => this.renderNode(child, ctx)).join('');
                          return `<li${this.lineAttr(head.start)}>${inner}</li>`;
                      })
                      .join('')
                : `<li>${this.renderChildren(node.children, ctx)}</li>`;

        const ordered = node.name === 'ol' || /^[1aAiI]$/.test(type);
        if (ordered) {
            const listType = /^[1aAiI]$/.test(type) ? type : '1';
            return `<ol class="bb-list" type="${listType}"${line}>${body}</ol>`;
        }

        const bullet = ['disc', 'circle', 'square', 'none'].includes(type.toLowerCase())
            ? type.toLowerCase()
            : 'disc';
        return `<ul class="bb-list" style="list-style-type:${bullet}"${line}>${body}</ul>`;
    }

    private link(node: TagNode, ctx: Context): string {
        const inner = { ...ctx, block: false, inLink: true };
        const target = node.value ?? this.textOf(node);
        const safe = sanitizeUrl(target);
        if (!safe) {
            return this.renderChildren(node.children, { ...ctx, block: false });
        }

        const label = node.value
            ? this.renderChildren(node.children, inner)
            : escapeHtml(this.textOf(node).trim());
        const external = isRemoteUrl(safe) ? ' rel="noopener noreferrer"' : '';
        return `<a class="bb-link" href="${escapeAttribute(safe)}" title="${escapeAttribute(safe)}"${external}>${label || escapeHtml(safe)}</a>`;
    }

    private email(node: TagNode, ctx: Context): string {
        const address = (node.value ?? this.textOf(node)).trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
            return this.renderChildren(node.children, { ...ctx, block: false });
        }
        const label = node.value
            ? this.renderChildren(node.children, { ...ctx, block: false, inLink: true })
            : escapeHtml(address);
        return `<a class="bb-link" href="mailto:${escapeAttribute(address)}">${label}</a>`;
    }

    private mention(node: TagNode, ctx: Context): string {
        const label = this.renderChildren(node.children, ctx) || escapeHtml(node.value ?? '');
        return `<span class="bb-mention">@${label}</span>`;
    }

    private image(node: TagNode): string {
        const text = this.textOf(node).trim();
        const value = (node.value ?? '').trim();

        // `[img=url]alt[/img]`, `[img=120]url[/img]` and `[img]url[/img]` are
        // all in use across engines; tell them apart by shape.
        let src = text;
        let alt = node.params.alt ?? '';
        let width = sanitizeInteger(node.params.width);
        const height = sanitizeInteger(node.params.height);

        if (value) {
            if (/^\d+$/.test(value)) {
                width = width ?? sanitizeInteger(value);
            } else {
                src = value;
                alt = alt || text;
            }
        }

        const safe = sanitizeUrl(src, { allowDataImages: true });
        if (!safe) {
            return escapeHtml(src);
        }

        if (isRemoteUrl(safe) && !this.options.remoteImages) {
            return `<a class="bb-link bb-blocked-image" href="${escapeAttribute(safe)}" title="Remote images are disabled">🖼 ${escapeHtml(safe)}</a>`;
        }

        const resolved = this.options.resolveResource ? this.options.resolveResource(safe) : safe;
        if (!resolved) {
            return `<span class="bb-blocked-image">🖼 ${escapeHtml(safe)}</span>`;
        }

        const attrs = [
            `class="bb-image"`,
            `src="${escapeAttribute(resolved)}"`,
            `alt="${escapeAttribute(alt || 'image')}"`,
        ];
        if (node.params.title) {
            attrs.push(`title="${escapeAttribute(node.params.title)}"`);
        }
        if (width) {
            attrs.push(`width="${width}"`);
        }
        if (height) {
            attrs.push(`height="${height}"`);
        }
        attrs.push('loading="lazy"');
        return `<img ${attrs.join(' ')}${this.lineAttr(node.start)}>`;
    }

    private youtube(node: TagNode, raw: string): string {
        const id = youtubeId(raw);
        if (!id) {
            return this.mediaFallback(raw);
        }
        if (!this.options.embedVideos) {
            return this.mediaFallback(`https://www.youtube.com/watch?v=${id}`);
        }
        return `<div class="bb-embed"${this.lineAttr(node.start)}><iframe class="bb-embed-frame" src="https://www.youtube-nocookie.com/embed/${escapeAttribute(id)}" title="YouTube video" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    }

    private vimeo(node: TagNode, raw: string): string {
        const id = vimeoId(raw);
        if (!id) {
            return this.mediaFallback(raw);
        }
        if (!this.options.embedVideos) {
            return this.mediaFallback(`https://vimeo.com/${id}`);
        }
        return `<div class="bb-embed"${this.lineAttr(node.start)}><iframe class="bb-embed-frame" src="https://player.vimeo.com/video/${escapeAttribute(id)}" title="Vimeo video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    }

    private media(node: TagNode): string {
        const provider = (node.value ?? '').toLowerCase();
        const raw = this.textOf(node);
        if (provider === 'vimeo') {
            return this.vimeo(node, raw);
        }
        if (provider === 'youtube' || provider === '') {
            return this.youtube(node, raw);
        }
        return this.mediaFallback(raw);
    }

    private video(node: TagNode): string {
        const raw = this.textOf(node).trim();
        const safe = sanitizeUrl(raw);
        if (!safe) {
            return escapeHtml(raw);
        }
        if (/\.(mp4|webm|ogv|ogg|mov)(\?|#|$)/i.test(safe)) {
            if (!this.options.embedVideos) {
                return this.mediaFallback(safe);
            }
            const resolved = this.options.resolveResource ? this.options.resolveResource(safe) : safe;
            if (!resolved) {
                return this.mediaFallback(safe);
            }
            return `<video class="bb-video" controls preload="metadata" src="${escapeAttribute(resolved)}"${this.lineAttr(node.start)}></video>`;
        }
        return this.youtube(node, safe);
    }

    private audio(node: TagNode): string {
        const raw = this.textOf(node).trim();
        const safe = sanitizeUrl(raw);
        if (!safe) {
            return escapeHtml(raw);
        }
        if (!this.options.embedVideos) {
            return this.mediaFallback(safe);
        }
        const resolved = this.options.resolveResource ? this.options.resolveResource(safe) : safe;
        if (!resolved) {
            return this.mediaFallback(safe);
        }
        return `<audio class="bb-audio" controls preload="metadata" src="${escapeAttribute(resolved)}"${this.lineAttr(node.start)}></audio>`;
    }

    private mediaFallback(raw: string): string {
        const safe = sanitizeUrl(raw.trim());
        if (!safe) {
            return escapeHtml(raw);
        }
        return `<a class="bb-link bb-media-link" href="${escapeAttribute(safe)}">▶ ${escapeHtml(safe)}</a>`;
    }

    private codeLanguage(node: TagNode): string {
        const raw = node.value ?? node.params.lang ?? '';
        return /^[A-Za-z0-9+#_.-]{1,24}$/.test(raw) ? raw.toLowerCase() : '';
    }

    private code(node: TagNode, language: string): string {
        const body = stripOuterNewlines(this.textOf(node));
        const title = node.params.title ?? '';
        const label = title || language || 'Code';
        const languageClass = language ? ` class="language-${escapeAttribute(language)}"` : '';
        return [
            `<figure class="bb-code"${this.lineAttr(node.start)}>`,
            `<figcaption class="bb-code-head">`,
            `<span class="bb-code-label">${escapeHtml(label)}</span>`,
            `<button class="bb-copy" type="button" data-bb-copy title="Copy to clipboard">Copy</button>`,
            `</figcaption>`,
            `<pre class="bb-code-body"><code${languageClass}>${escapeHtml(body)}</code></pre>`,
            `</figure>`,
        ].join('');
    }

    private cell(node: TagNode, ctx: Context): string {
        const attrs: string[] = [];
        const colspan = sanitizeInteger(node.params.colspan, 100);
        const rowspan = sanitizeInteger(node.params.rowspan, 100);
        const align = (node.params.align ?? '').toLowerCase();
        if (colspan) {
            attrs.push(`colspan="${colspan}"`);
        }
        if (rowspan) {
            attrs.push(`rowspan="${rowspan}"`);
        }
        if (['left', 'center', 'right'].includes(align)) {
            attrs.push(`style="text-align:${align}"`);
        }
        const rendered = attrs.length ? ` ${attrs.join(' ')}` : '';
        return `<${node.name}${rendered}>${this.renderChildren(node.children, ctx)}</${node.name}>`;
    }

    private time(node: TagNode): string {
        const raw = this.textOf(node).trim();
        const epoch = /^\d{9,13}$/.test(raw) ? Number(raw) : NaN;
        if (Number.isNaN(epoch)) {
            return escapeHtml(raw);
        }
        const date = new Date(raw.length > 10 ? epoch : epoch * 1000);
        if (Number.isNaN(date.getTime())) {
            return escapeHtml(raw);
        }
        const iso = date.toISOString();
        return `<time class="bb-time" datetime="${escapeAttribute(iso)}">${escapeHtml(iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC'))}</time>`;
    }

    private renderCustom(node: TagNode, ctx: Context): string {
        const custom = node.tag.custom!;
        const content =
            node.tag.content === 'raw'
                ? escapeHtml(this.textOf(node))
                : this.renderChildren(node.children, { ...ctx, block: node.tag.kind === 'block' });

        return custom.html.replace(/\$\{([a-zA-Z]+)(?:\.([A-Za-z0-9_-]+))?\}/g, (match, name: string, key?: string) => {
            switch (name) {
                case 'content':
                    return content;
                case 'text':
                    return escapeHtml(this.textOf(node));
                case 'value':
                    return escapeAttribute(node.value ?? '');
                case 'url':
                    return escapeAttribute(sanitizeUrl(node.value ?? this.textOf(node)) ?? '#');
                case 'param':
                    return key ? escapeAttribute(node.params[key.toLowerCase()] ?? '') : '';
                default:
                    return match;
            }
        });
    }

    /** The concatenated raw text of a node's children. */
    private textOf(node: TagNode): string {
        if (node.tag.content === 'raw') {
            return this.source.slice(node.contentStart, node.contentEnd);
        }
        let out = '';
        for (const child of node.children) {
            if (child.type === 'text') {
                out += child.value;
            } else if (child.type === 'unknown') {
                out += child.source;
            } else {
                out += this.textOf(child);
            }
        }
        return out;
    }
}

// ------------------------------------------------------------------ helpers

/** Matches bare URLs and e-mail addresses for auto-linking. */
const AUTO_LINK =
    /(?:(?:https?|ftp|ftps):\/\/|www\.)[^\s<>"'[\]{}]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gi;

/**
 * Trailing punctuation is almost always sentence punctuation rather than part
 * of the URL. Closing brackets are kept when the URL opens them.
 */
function trimTrailingPunctuation(url: string): string {
    let out = url;
    for (;;) {
        const last = out[out.length - 1];
        if (!last) {
            return out;
        }
        if ('.,;:!?"\''.includes(last)) {
            out = out.slice(0, -1);
            continue;
        }
        if (last === ')' && countChar(out, ')') > countChar(out, '(')) {
            out = out.slice(0, -1);
            continue;
        }
        return out;
    }
}

function countChar(value: string, ch: string): number {
    let count = 0;
    for (const current of value) {
        if (current === ch) {
            count++;
        }
    }
    return count;
}

/** True for `[*]` and `[li]`, the nodes that start a list item. */
function isListItem(node: Node): boolean {
    return node.type === 'tag' && (node.name === '*' || node.name === 'li');
}

/**
 * Splits a list's children into one group per item. Anything between two items
 * - most importantly a nested list, which implicitly closed the item before it
 * - belongs to the item it follows.
 */
function groupListItems(children: readonly Node[]): Node[][] {
    const groups: Node[][] = [];

    for (const child of children) {
        if (isListItem(child)) {
            groups.push([child]);
            continue;
        }
        if (child.type === 'text' && child.value.trim() === '') {
            continue;
        }
        if (groups.length === 0) {
            // Content before the first item still has to go somewhere.
            groups.push([child]);
            continue;
        }
        groups[groups.length - 1].push(child);
    }

    return groups;
}

function isBlockLevel(node: Node): boolean {
    return node.type === 'tag' && (node.tag.kind === 'block' || node.name === 'hr');
}

/**
 * Forum engines swallow the single newline that follows a block tag and the one
 * that precedes its closing tag, so that `[quote]\ntext\n[/quote]` does not gain
 * two stray blank lines.
 */
function trimBreaksAroundBlocks(children: readonly Node[]): Node[] {
    const out = children.slice();

    const trimStart = (index: number): void => {
        const node = out[index];
        if (node?.type !== 'text' || node.raw) {
            return;
        }
        const value = node.value.replace(/^[ \t]*\r?\n/, '');
        out[index] = { ...node, value };
    };

    const trimEnd = (index: number): void => {
        const node = out[index];
        if (node?.type !== 'text' || node.raw) {
            return;
        }
        const value = node.value.replace(/\r?\n[ \t]*$/, '');
        out[index] = { ...node, value };
    };

    if (out.length > 0) {
        trimStart(0);
        trimEnd(out.length - 1);
    }

    for (let i = 0; i < out.length; i++) {
        if (!isBlockLevel(out[i])) {
            continue;
        }
        trimEnd(i - 1);
        trimStart(i + 1);
    }

    return out.filter((node) => !(node.type === 'text' && node.value === ''));
}

/** Drops one leading and one trailing newline, as code blocks are usually written. */
function stripOuterNewlines(value: string): string {
    return value.replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '');
}

function slug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

function computeLineStarts(source: string): number[] {
    const starts = [0];
    for (let i = 0; i < source.length; i++) {
        if (source[i] === '\n') {
            starts.push(i + 1);
        }
    }
    return starts;
}

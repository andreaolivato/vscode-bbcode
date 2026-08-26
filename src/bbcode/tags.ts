/**
 * The BBCode tag registry.
 *
 * This is the single source of truth for the parser, the renderer, IntelliSense,
 * hovers and diagnostics. It deliberately has no dependency on the `vscode`
 * module so that it can be unit-tested in a plain Node process.
 */

/** Forum engines whose tag sets this extension knows about. */
export type Dialect = 'generic' | 'phpbb' | 'vbulletin' | 'xenforo' | 'smf' | 'mybb' | 'steam';

export const DIALECTS: readonly Dialect[] = ['generic', 'phpbb', 'vbulletin', 'xenforo', 'smf', 'mybb', 'steam'];

/** How a tag participates in the document flow. */
export type TagKind =
    /** Flows with the surrounding text, e.g. `[b]`. */
    | 'inline'
    /** Starts on its own line and may contain other blocks, e.g. `[quote]`. */
    | 'block'
    /** Has no closing tag and no content, e.g. `[hr]`. */
    | 'void'
    /** A list item, e.g. `[*]`. Closed implicitly by the next item. */
    | 'listItem';

/** How the content between the opening and closing tag is treated. */
export type ContentMode =
    /** Nested BBCode is parsed as usual. */
    | 'parse'
    /** Content is taken verbatim; nested tags are not parsed. */
    | 'raw';

export interface ParameterSpec {
    readonly name: string;
    readonly description: string;
    /** Fixed set of accepted values, offered by IntelliSense. */
    readonly values?: readonly string[];
}

export interface TagDefinition {
    /** Canonical, lower-case tag name. */
    readonly name: string;
    /** Alternative spellings that behave identically. */
    readonly aliases?: readonly string[];
    readonly kind: TagKind;
    readonly content: ContentMode;
    readonly category: TagCategory;
    readonly description: string;
    /** The `value` in `[tag=value]`, when the tag accepts one. */
    readonly value?: ParameterSpec;
    /** Named parameters, as in `[quote author=Bob post=12]`. */
    readonly params?: readonly ParameterSpec[];
    /**
     * Tag names that implicitly close this tag when they are opened while this
     * tag is still on the stack. Used for `[*]` inside `[list]`.
     */
    readonly closedBy?: readonly string[];
    /** Names of tags this tag is expected to appear inside of. */
    readonly parents?: readonly string[];
    /** Dialects that provide this tag. Omitted means "every dialect". */
    readonly dialects?: readonly Dialect[];
    /** A short, copy-pasteable example used in hovers and documentation. */
    readonly example: string;
    /**
     * Snippet body inserted by IntelliSense, without the leading `[`.
     * Defaults to `name]$0[/name]` (or `name]` for void tags).
     */
    readonly snippet?: string;
}

export type TagCategory =
    | 'formatting'
    | 'structure'
    | 'links'
    | 'media'
    | 'lists'
    | 'tables'
    | 'code'
    | 'misc';

export const CATEGORY_LABELS: Record<TagCategory, string> = {
    formatting: 'Text formatting',
    structure: 'Layout',
    links: 'Links',
    media: 'Media',
    lists: 'Lists',
    tables: 'Tables',
    code: 'Code',
    misc: 'Miscellaneous',
};

const LIST_PARENTS = ['list', 'ul', 'ol', 'olist'];

export const TAG_DEFINITIONS: readonly TagDefinition[] = [
    // ---------------------------------------------------------------- formatting
    {
        name: 'b',
        aliases: ['bold'],
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Bold text.',
        example: '[b]important[/b]',
    },
    {
        name: 'i',
        aliases: ['italic'],
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Italic text.',
        example: '[i]emphasised[/i]',
    },
    {
        name: 'u',
        aliases: ['underline'],
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Underlined text.',
        example: '[u]underlined[/u]',
    },
    {
        name: 's',
        aliases: ['strike', 'strikethrough', 'del'],
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Struck-through text.',
        example: '[s]removed[/s]',
    },
    {
        name: 'ins',
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Inserted text, rendered underlined.',
        example: '[ins]added later[/ins]',
        dialects: ['generic', 'xenforo'],
    },
    {
        name: 'sub',
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Subscript text.',
        example: 'H[sub]2[/sub]O',
    },
    {
        name: 'sup',
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Superscript text.',
        example: 'x[sup]2[/sup]',
    },
    {
        name: 'color',
        aliases: ['colour'],
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Sets the text colour. Accepts a named CSS colour or a hex value.',
        value: {
            name: 'color',
            description: 'A CSS colour name such as `red`, or a hex value such as `#ff8800`.',
        },
        example: '[color=#ff8800]orange[/color]',
        snippet: 'color=${1:#ff8800}]$0[/color]',
    },
    {
        name: 'bgcolor',
        aliases: ['bg', 'highlight', 'mark'],
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Sets the background (highlight) colour of the text.',
        value: { name: 'color', description: 'A CSS colour name or hex value.' },
        example: '[bgcolor=yellow]highlighted[/bgcolor]',
        snippet: 'bgcolor=${1:yellow}]$0[/bgcolor]',
        dialects: ['generic', 'xenforo', 'mybb'],
    },
    {
        name: 'size',
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description:
            'Sets the text size. Depending on the dialect the value is a percentage (phpBB), a 1-7 scale (vBulletin) or an explicit CSS length.',
        value: {
            name: 'size',
            description: 'A percentage (`150`), a scale step (`1`-`7`) or a CSS length (`18px`).',
            values: ['1', '2', '3', '4', '5', '6', '7', '85', '100', '150', '200', '12px', '18px', '24px'],
        },
        example: '[size=150]bigger[/size]',
        snippet: 'size=${1:150}]$0[/size]',
    },
    {
        name: 'font',
        kind: 'inline',
        content: 'parse',
        category: 'formatting',
        description: 'Sets the font family.',
        value: {
            name: 'family',
            description: 'A font family name.',
            values: ['Arial', 'Courier New', 'Georgia', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
        },
        example: '[font=Georgia]serif text[/font]',
        snippet: 'font=${1:Georgia}]$0[/font]',
    },
    {
        name: 'h1',
        kind: 'block',
        content: 'parse',
        category: 'formatting',
        description: 'A first-level heading.',
        example: '[h1]Title[/h1]',
        dialects: ['generic', 'steam', 'xenforo'],
    },
    {
        name: 'h2',
        kind: 'block',
        content: 'parse',
        category: 'formatting',
        description: 'A second-level heading.',
        example: '[h2]Section[/h2]',
        dialects: ['generic', 'steam', 'xenforo'],
    },
    {
        name: 'h3',
        kind: 'block',
        content: 'parse',
        category: 'formatting',
        description: 'A third-level heading.',
        example: '[h3]Subsection[/h3]',
        dialects: ['generic', 'steam', 'xenforo'],
    },
    {
        name: 'h4',
        kind: 'block',
        content: 'parse',
        category: 'formatting',
        description: 'A fourth-level heading.',
        example: '[h4]Heading[/h4]',
        dialects: ['generic'],
    },
    {
        name: 'h5',
        kind: 'block',
        content: 'parse',
        category: 'formatting',
        description: 'A fifth-level heading.',
        example: '[h5]Heading[/h5]',
        dialects: ['generic'],
    },
    {
        name: 'h6',
        kind: 'block',
        content: 'parse',
        category: 'formatting',
        description: 'A sixth-level heading.',
        example: '[h6]Heading[/h6]',
        dialects: ['generic'],
    },

    // ----------------------------------------------------------------- structure
    {
        name: 'left',
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Left-aligns a block of text.',
        example: '[left]left aligned[/left]',
    },
    {
        name: 'center',
        aliases: ['centre'],
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Centres a block of text.',
        example: '[center]centred[/center]',
    },
    {
        name: 'right',
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Right-aligns a block of text.',
        example: '[right]right aligned[/right]',
    },
    {
        name: 'justify',
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Justifies a block of text.',
        example: '[justify]justified[/justify]',
        dialects: ['generic', 'phpbb', 'xenforo', 'mybb'],
    },
    {
        name: 'align',
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Aligns a block of text.',
        value: {
            name: 'alignment',
            description: 'The horizontal alignment to apply.',
            values: ['left', 'center', 'right', 'justify'],
        },
        example: '[align=center]centred[/align]',
        snippet: 'align=${1|left,center,right,justify|}]$0[/align]',
    },
    {
        name: 'indent',
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Indents a block of text.',
        value: { name: 'levels', description: 'Number of indentation levels.', values: ['1', '2', '3', '4'] },
        example: '[indent]indented[/indent]',
    },
    {
        name: 'quote',
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Quotes another post. The optional value names the author.',
        value: { name: 'author', description: 'Name of the person being quoted.' },
        params: [
            { name: 'post', description: 'ID of the quoted post.' },
            { name: 'source', description: 'Where the quote came from.' },
            { name: 'link', description: 'A URL pointing at the quoted post.' },
            { name: 'date', description: 'Timestamp of the quoted post.' },
        ],
        example: '[quote="Alice"]Hello there.[/quote]',
        snippet: 'quote="${1:author}"]$0[/quote]',
    },
    {
        name: 'spoiler',
        aliases: ['hide', 'ispoiler'],
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Hides content behind a click-to-reveal box.',
        value: { name: 'title', description: 'Label shown on the collapsed box.' },
        example: '[spoiler=Ending]They were dead all along.[/spoiler]',
        snippet: 'spoiler=${1:Spoiler}]$0[/spoiler]',
        dialects: ['generic', 'xenforo', 'smf', 'mybb', 'steam'],
    },
    {
        name: 'box',
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Draws a bordered box around its content.',
        value: { name: 'title', description: 'Optional box heading.' },
        example: '[box=Note]Remember to save.[/box]',
        dialects: ['generic', 'xenforo'],
    },
    {
        name: 'hr',
        aliases: ['rule'],
        kind: 'void',
        content: 'parse',
        category: 'structure',
        description: 'A horizontal rule.',
        example: '[hr]',
        snippet: 'hr]$0',
    },
    {
        name: 'br',
        kind: 'void',
        content: 'parse',
        category: 'structure',
        description: 'An explicit line break.',
        example: '[br]',
        snippet: 'br]$0',
        dialects: ['generic', 'mybb'],
    },
    {
        name: 'float',
        kind: 'block',
        content: 'parse',
        category: 'structure',
        description: 'Floats a block to one side so text wraps around it.',
        value: { name: 'side', description: 'Side to float towards.', values: ['left', 'right'] },
        example: '[float=right][img]logo.png[/img][/float]',
        dialects: ['generic', 'phpbb'],
    },

    // --------------------------------------------------------------------- lists
    {
        name: 'list',
        kind: 'block',
        content: 'parse',
        category: 'lists',
        description: 'A list. Without a value the list is bulleted; with one it is numbered.',
        value: {
            name: 'type',
            description: 'Numbering style.',
            values: ['1', 'a', 'A', 'i', 'I'],
        },
        example: '[list]\n[*]First\n[*]Second\n[/list]',
        snippet: 'list]\n[*]$1\n[*]$2\n[/list]$0',
    },
    {
        name: 'ul',
        kind: 'block',
        content: 'parse',
        category: 'lists',
        description: 'An explicitly bulleted list.',
        example: '[ul][li]First[/li][/ul]',
        snippet: 'ul]\n[li]$1[/li]\n[/ul]$0',
        dialects: ['generic', 'xenforo', 'steam'],
    },
    {
        name: 'ol',
        aliases: ['olist'],
        kind: 'block',
        content: 'parse',
        category: 'lists',
        description: 'An explicitly numbered list.',
        value: { name: 'type', description: 'Numbering style.', values: ['1', 'a', 'A', 'i', 'I'] },
        example: '[ol][li]First[/li][/ol]',
        snippet: 'ol]\n[li]$1[/li]\n[/ol]$0',
        dialects: ['generic', 'xenforo', 'steam'],
    },
    {
        name: '*',
        kind: 'listItem',
        content: 'parse',
        category: 'lists',
        description: 'A list item. The closing tag is optional; the next item closes it.',
        closedBy: ['*', 'list', 'ul', 'ol', 'olist', 'li'],
        parents: LIST_PARENTS,
        example: '[*]An item',
        snippet: '*]$0',
    },
    {
        name: 'li',
        kind: 'block',
        content: 'parse',
        category: 'lists',
        description: 'A list item with an explicit closing tag.',
        closedBy: ['li', '*'],
        parents: LIST_PARENTS,
        example: '[li]An item[/li]',
        dialects: ['generic', 'xenforo', 'steam'],
    },

    // --------------------------------------------------------------------- links
    {
        name: 'url',
        aliases: ['link'],
        kind: 'inline',
        content: 'parse',
        category: 'links',
        description: 'A hyperlink. Use `[url]http://…[/url]` or `[url=http://…]label[/url]`.',
        value: { name: 'href', description: 'Target address.' },
        params: [{ name: 'unfurl', description: 'XenForo: render as a rich link preview.', values: ['true', 'false'] }],
        example: '[url=https://example.com]Example[/url]',
        snippet: 'url=${1:https://example.com}]${2:label}[/url]$0',
    },
    {
        name: 'email',
        kind: 'inline',
        content: 'parse',
        category: 'links',
        description: 'A `mailto:` link.',
        value: { name: 'address', description: 'The e-mail address.' },
        example: '[email]someone@example.com[/email]',
    },
    {
        name: 'user',
        aliases: ['mention'],
        kind: 'inline',
        content: 'parse',
        category: 'links',
        description: 'A mention of another forum member.',
        value: { name: 'id', description: 'Numeric member ID.' },
        example: '[user=42]Alice[/user]',
        dialects: ['generic', 'xenforo', 'vbulletin'],
    },
    {
        name: 'anchor',
        kind: 'inline',
        content: 'parse',
        category: 'links',
        description: 'Defines a named anchor that can be linked to with `[goto]`.',
        value: { name: 'name', description: 'Anchor name.' },
        example: '[anchor=top]Top of page[/anchor]',
        dialects: ['generic', 'smf'],
    },

    // --------------------------------------------------------------------- media
    {
        name: 'img',
        aliases: ['image'],
        kind: 'inline',
        content: 'raw',
        category: 'media',
        description: 'Embeds an image. The URL goes in the content or in the value.',
        value: { name: 'src', description: 'Image URL. Some engines put the width here instead.' },
        params: [
            { name: 'width', description: 'Display width in pixels.' },
            { name: 'height', description: 'Display height in pixels.' },
            { name: 'alt', description: 'Alternative text.' },
            { name: 'title', description: 'Tooltip text.' },
        ],
        example: '[img]https://example.com/cat.png[/img]',
        snippet: 'img]${1:https://example.com/image.png}[/img]$0',
    },
    {
        name: 'youtube',
        aliases: ['yt'],
        kind: 'block',
        content: 'raw',
        category: 'media',
        description: 'Embeds a YouTube video from a full URL or a bare video ID.',
        example: '[youtube]dQw4w9WgXcQ[/youtube]',
        dialects: ['generic', 'phpbb', 'vbulletin', 'smf', 'mybb'],
    },
    {
        name: 'vimeo',
        kind: 'block',
        content: 'raw',
        category: 'media',
        description: 'Embeds a Vimeo video from a full URL or a bare video ID.',
        example: '[vimeo]76979871[/vimeo]',
        dialects: ['generic', 'phpbb'],
    },
    {
        name: 'media',
        kind: 'block',
        content: 'raw',
        category: 'media',
        description: 'XenForo-style embed. The value selects the provider.',
        value: { name: 'provider', description: 'Media provider.', values: ['youtube', 'vimeo', 'dailymotion'] },
        example: '[media=youtube]dQw4w9WgXcQ[/media]',
        snippet: 'media=${1|youtube,vimeo|}]$0[/media]',
        dialects: ['generic', 'xenforo'],
    },
    {
        name: 'video',
        kind: 'block',
        content: 'raw',
        category: 'media',
        description: 'Embeds a video file or a supported video URL.',
        value: { name: 'provider', description: 'Optional provider hint.' },
        example: '[video]https://example.com/clip.mp4[/video]',
        dialects: ['generic', 'smf'],
    },
    {
        name: 'audio',
        kind: 'block',
        content: 'raw',
        category: 'media',
        description: 'Embeds an audio file.',
        example: '[audio]https://example.com/song.mp3[/audio]',
        dialects: ['generic'],
    },
    {
        name: 'attach',
        aliases: ['attachment'],
        kind: 'inline',
        content: 'raw',
        category: 'media',
        description: 'References a file attached to the post.',
        value: { name: 'display', description: 'How to display the attachment.', values: ['full', 'thumb', 'inline'] },
        example: '[attach]12345[/attach]',
        dialects: ['generic', 'xenforo', 'vbulletin'],
    },

    // ---------------------------------------------------------------------- code
    {
        name: 'code',
        kind: 'block',
        content: 'raw',
        category: 'code',
        description: 'A block of preformatted code. BBCode inside is not parsed.',
        value: { name: 'language', description: 'Language hint, shown as a label.' },
        params: [
            { name: 'title', description: 'Caption shown above the block.' },
            { name: 'lang', description: 'Language hint (XenForo spelling).' },
        ],
        example: '[code=js]console.log("hi");[/code]',
        snippet: 'code=${1:js}]\n$0\n[/code]',
    },
    {
        name: 'icode',
        aliases: ['inlinecode', 'c'],
        kind: 'inline',
        content: 'raw',
        category: 'code',
        description: 'Inline preformatted code.',
        example: '[icode]npm install[/icode]',
        dialects: ['generic', 'xenforo'],
    },
    {
        name: 'pre',
        kind: 'block',
        content: 'raw',
        category: 'code',
        description: 'Preformatted text that keeps whitespace exactly as written.',
        example: '[pre]  spaced   out[/pre]',
        dialects: ['generic', 'smf'],
    },
    {
        name: 'php',
        kind: 'block',
        content: 'raw',
        category: 'code',
        description: 'A block of PHP source code.',
        example: '[php]echo "hi";[/php]',
        dialects: ['generic', 'vbulletin', 'mybb', 'smf'],
    },
    {
        name: 'noparse',
        aliases: ['plain', 'nobbc'],
        kind: 'block',
        content: 'raw',
        category: 'code',
        description: 'Shows its content verbatim, without interpreting any BBCode.',
        example: '[noparse][b]not bold[/b][/noparse]',
    },

    // -------------------------------------------------------------------- tables
    {
        name: 'table',
        kind: 'block',
        content: 'parse',
        category: 'tables',
        description: 'A table. Contains `[tr]` rows.',
        example: '[table][tr][td]A[/td][/tr][/table]',
        snippet: 'table]\n[tr][td]$1[/td][td]$2[/td][/tr]\n[/table]$0',
        dialects: ['generic', 'phpbb', 'xenforo', 'mybb'],
    },
    {
        name: 'thead',
        kind: 'block',
        content: 'parse',
        category: 'tables',
        description: 'The header section of a table.',
        parents: ['table'],
        example: '[thead][tr][th]Name[/th][/tr][/thead]',
        dialects: ['generic', 'xenforo'],
    },
    {
        name: 'tbody',
        kind: 'block',
        content: 'parse',
        category: 'tables',
        description: 'The body section of a table.',
        parents: ['table'],
        example: '[tbody][tr][td]A[/td][/tr][/tbody]',
        dialects: ['generic', 'xenforo'],
    },
    {
        name: 'tr',
        kind: 'block',
        content: 'parse',
        category: 'tables',
        description: 'A table row.',
        parents: ['table', 'thead', 'tbody'],
        example: '[tr][td]A[/td][td]B[/td][/tr]',
        dialects: ['generic', 'phpbb', 'xenforo', 'mybb'],
    },
    {
        name: 'td',
        kind: 'block',
        content: 'parse',
        category: 'tables',
        description: 'A table cell.',
        params: [
            { name: 'colspan', description: 'Number of columns the cell spans.' },
            { name: 'rowspan', description: 'Number of rows the cell spans.' },
            { name: 'align', description: 'Horizontal alignment.', values: ['left', 'center', 'right'] },
        ],
        parents: ['tr'],
        example: '[td]A cell[/td]',
        dialects: ['generic', 'phpbb', 'xenforo', 'mybb'],
    },
    {
        name: 'th',
        kind: 'block',
        content: 'parse',
        category: 'tables',
        description: 'A table header cell.',
        params: [
            { name: 'colspan', description: 'Number of columns the cell spans.' },
            { name: 'rowspan', description: 'Number of rows the cell spans.' },
            { name: 'align', description: 'Horizontal alignment.', values: ['left', 'center', 'right'] },
        ],
        parents: ['tr'],
        example: '[th]Column[/th]',
        dialects: ['generic', 'phpbb', 'xenforo', 'mybb'],
    },

    // ---------------------------------------------------------------------- misc
    {
        name: 'abbr',
        aliases: ['acronym'],
        kind: 'inline',
        content: 'parse',
        category: 'misc',
        description: 'An abbreviation with an explanatory tooltip.',
        value: { name: 'title', description: 'The expanded form.' },
        example: '[abbr=HyperText Markup Language]HTML[/abbr]',
        dialects: ['generic', 'smf'],
    },
    {
        name: 'tt',
        aliases: ['monospace'],
        kind: 'inline',
        content: 'parse',
        category: 'misc',
        description: 'Monospaced text.',
        example: '[tt]fixed width[/tt]',
        dialects: ['generic', 'smf'],
    },
    {
        name: 'time',
        kind: 'inline',
        content: 'raw',
        category: 'misc',
        description: 'A timestamp rendered in the reader’s local time zone.',
        example: '[time]1700000000[/time]',
        dialects: ['generic', 'phpbb'],
    },
];

/** Every alias and canonical name that maps to a definition. */
const BY_NAME = new Map<string, TagDefinition>();
for (const def of TAG_DEFINITIONS) {
    BY_NAME.set(def.name, def);
    for (const alias of def.aliases ?? []) {
        BY_NAME.set(alias, def);
    }
}

/** Looks up a tag definition by canonical name or alias. Case-insensitive. */
export function findTag(name: string): TagDefinition | undefined {
    return BY_NAME.get(name.toLowerCase());
}

/** Every name that resolves to a tag, including aliases, sorted alphabetically. */
export function allTagNames(): string[] {
    return [...BY_NAME.keys()].sort();
}

/** True when the tag belongs to the given dialect. */
export function isInDialect(def: TagDefinition, dialect: Dialect): boolean {
    if (dialect === 'generic' || !def.dialects) {
        return true;
    }
    return def.dialects.includes(dialect);
}

/** All definitions available in a dialect, in registry order. */
export function tagsForDialect(dialect: Dialect): TagDefinition[] {
    return TAG_DEFINITIONS.filter((def) => isInDialect(def, dialect));
}

/** The snippet body IntelliSense inserts for a tag, excluding the leading `[`. */
export function snippetFor(def: TagDefinition): string {
    if (def.snippet) {
        return def.snippet;
    }
    if (def.kind === 'void') {
        return `${def.name}]$0`;
    }
    return `${def.name}]$0[/${def.name}]`;
}

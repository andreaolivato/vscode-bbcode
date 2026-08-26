import { writeFileSync } from 'node:fs';

/** Languages that get real syntax highlighting inside [code=...] blocks. */
const EMBEDDED = [
    { aliases: ['js', 'javascript', 'jsx', 'node'], scope: 'source.js', embedded: 'javascript' },
    { aliases: ['ts', 'typescript', 'tsx'], scope: 'source.ts', embedded: 'typescript' },
    { aliases: ['html', 'htm', 'xhtml'], scope: 'text.html.basic', embedded: 'html' },
    { aliases: ['css', 'scss', 'less'], scope: 'source.css', embedded: 'css' },
    { aliases: ['py', 'python', 'python3'], scope: 'source.python', embedded: 'python' },
    { aliases: ['php', 'php5', 'php7', 'php8'], scope: 'source.php', embedded: 'php' },
    { aliases: ['json', 'jsonc'], scope: 'source.json', embedded: 'json' },
    { aliases: ['sql', 'mysql', 'postgres', 'postgresql'], scope: 'source.sql', embedded: 'sql' },
    { aliases: ['xml', 'xsl', 'svg'], scope: 'text.xml', embedded: 'xml' },
    { aliases: ['sh', 'bash', 'shell', 'zsh', 'console'], scope: 'source.shell', embedded: 'shellscript' },
];

const alt = (values) => values.join('|');

/** `[code=js] … [/code]` with the body handed to another grammar. */
const embeddedBlocks = EMBEDDED.map((language) => ({
    name: `meta.embedded.block.${language.embedded}.bbcode`,
    begin: `(?i)(\\[)(code)(=)(${alt(language.aliases)})(\\])`,
    beginCaptures: {
        1: { name: 'punctuation.definition.tag.begin.bbcode' },
        2: { name: 'entity.name.tag.bbcode' },
        3: { name: 'punctuation.separator.key-value.bbcode' },
        4: { name: 'constant.language.bbcode' },
        5: { name: 'punctuation.definition.tag.end.bbcode' },
    },
    end: '(?i)(\\[)(/)(code)(\\])',
    endCaptures: {
        1: { name: 'punctuation.definition.tag.begin.bbcode' },
        2: { name: 'punctuation.definition.tag.begin.bbcode' },
        3: { name: 'entity.name.tag.bbcode' },
        4: { name: 'punctuation.definition.tag.end.bbcode' },
    },
    contentName: `meta.embedded.block.${language.embedded}`,
    patterns: [{ include: language.scope }],
}));

/** A `[php] … [/php]` block, which always holds PHP. */
const phpBlock = {
    name: 'meta.embedded.block.php.bbcode',
    begin: '(?i)(\\[)(php)(\\])',
    beginCaptures: {
        1: { name: 'punctuation.definition.tag.begin.bbcode' },
        2: { name: 'entity.name.tag.bbcode' },
        3: { name: 'punctuation.definition.tag.end.bbcode' },
    },
    end: '(?i)(\\[)(/)(php)(\\])',
    endCaptures: {
        1: { name: 'punctuation.definition.tag.begin.bbcode' },
        2: { name: 'punctuation.definition.tag.begin.bbcode' },
        3: { name: 'entity.name.tag.bbcode' },
        4: { name: 'punctuation.definition.tag.end.bbcode' },
    },
    contentName: 'meta.embedded.block.php',
    patterns: [{ include: 'source.php' }],
};

/** Any other code block: monospaced, but not parsed further. */
const genericCode = {
    name: 'markup.raw.block.bbcode',
    begin: '(?i)(\\[)(code|icode|pre)((=)([^\\]]*))?(\\])',
    beginCaptures: {
        1: { name: 'punctuation.definition.tag.begin.bbcode' },
        2: { name: 'entity.name.tag.bbcode' },
        4: { name: 'punctuation.separator.key-value.bbcode' },
        5: { name: 'constant.language.bbcode' },
        6: { name: 'punctuation.definition.tag.end.bbcode' },
    },
    end: '(?i)(\\[)(/)(code|icode|pre)(\\])',
    endCaptures: {
        1: { name: 'punctuation.definition.tag.begin.bbcode' },
        2: { name: 'punctuation.definition.tag.begin.bbcode' },
        3: { name: 'entity.name.tag.bbcode' },
        4: { name: 'punctuation.definition.tag.end.bbcode' },
    },
    contentName: 'markup.raw.bbcode',
};

const noparse = {
    name: 'markup.raw.block.bbcode',
    begin: '(?i)(\\[)(noparse|plain|nobbc)(\\])',
    beginCaptures: {
        1: { name: 'punctuation.definition.tag.begin.bbcode' },
        2: { name: 'entity.name.tag.bbcode' },
        3: { name: 'punctuation.definition.tag.end.bbcode' },
    },
    end: '(?i)(\\[)(/)(noparse|plain|nobbc)(\\])',
    endCaptures: {
        1: { name: 'punctuation.definition.tag.begin.bbcode' },
        2: { name: 'punctuation.definition.tag.begin.bbcode' },
        3: { name: 'entity.name.tag.bbcode' },
        4: { name: 'punctuation.definition.tag.end.bbcode' },
    },
    contentName: 'markup.raw.bbcode',
};

/**
 * Styled regions: the content itself gets a `markup.*` scope so that colour
 * themes render bold text bold, quotes muted, and so on.
 */
function styled(name, tags, markup) {
    return {
        name: `meta.${name}.bbcode`,
        begin: `(?i)(\\[)(${alt(tags)})((=)([^\\]]*))?(\\])`,
        beginCaptures: {
            1: { name: 'punctuation.definition.tag.begin.bbcode' },
            2: { name: 'entity.name.tag.bbcode' },
            4: { name: 'punctuation.separator.key-value.bbcode' },
            5: { name: 'string.unquoted.bbcode' },
            6: { name: 'punctuation.definition.tag.end.bbcode' },
        },
        end: `(?i)(\\[)(/)(${alt(tags)})(\\])`,
        endCaptures: {
            1: { name: 'punctuation.definition.tag.begin.bbcode' },
            2: { name: 'punctuation.definition.tag.begin.bbcode' },
            3: { name: 'entity.name.tag.bbcode' },
            4: { name: 'punctuation.definition.tag.end.bbcode' },
        },
        contentName: markup,
        patterns: [{ include: '$self' }],
    };
}

const grammar = {
    $schema:
        'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: 'BBCode',
    scopeName: 'text.bbcode',
    patterns: [
        { include: '#raw-blocks' },
        { include: '#styled' },
        { include: '#list-item' },
        { include: '#closing-tag' },
        { include: '#opening-tag' },
        { include: '#entity' },
    ],
    repository: {
        'raw-blocks': {
            patterns: [...embeddedBlocks, phpBlock, noparse, genericCode],
        },
        styled: {
            patterns: [
                styled('bold', ['b', 'bold'], 'markup.bold.bbcode'),
                styled('italic', ['i', 'italic'], 'markup.italic.bbcode'),
                styled('underline', ['u', 'underline'], 'markup.underline.bbcode'),
                styled('strikethrough', ['s', 'strike', 'strikethrough', 'del'], 'markup.strikethrough.bbcode'),
                styled('quote', ['quote'], 'markup.quote.bbcode'),
                styled('heading', ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], 'markup.heading.bbcode'),
                styled('link', ['url', 'link', 'email'], 'markup.underline.link.bbcode'),
            ],
        },
        'list-item': {
            name: 'meta.tag.list-item.bbcode',
            match: '(?i)(\\[)(\\*)(\\])',
            captures: {
                1: { name: 'punctuation.definition.tag.begin.bbcode' },
                2: { name: 'keyword.control.bbcode' },
                3: { name: 'punctuation.definition.tag.end.bbcode' },
            },
        },
        'closing-tag': {
            name: 'meta.tag.close.bbcode',
            match: '(?i)(\\[)(/)([a-z*][a-z0-9*_.-]*)(\\])',
            captures: {
                1: { name: 'punctuation.definition.tag.begin.bbcode' },
                2: { name: 'punctuation.definition.tag.begin.bbcode' },
                3: { name: 'entity.name.tag.bbcode' },
                4: { name: 'punctuation.definition.tag.end.bbcode' },
            },
        },
        'opening-tag': {
            name: 'meta.tag.open.bbcode',
            begin: '(?i)(\\[)([a-z*][a-z0-9*_.-]*)',
            beginCaptures: {
                1: { name: 'punctuation.definition.tag.begin.bbcode' },
                2: { name: 'entity.name.tag.bbcode' },
            },
            end: '(\\])',
            endCaptures: {
                1: { name: 'punctuation.definition.tag.end.bbcode' },
            },
            patterns: [{ include: '#attribute' }],
        },
        attribute: {
            patterns: [
                {
                    match: '(?i)([a-z_][a-z0-9_-]*)\\s*(=)',
                    captures: {
                        1: { name: 'entity.other.attribute-name.bbcode' },
                        2: { name: 'punctuation.separator.key-value.bbcode' },
                    },
                },
                { match: '(=)', name: 'punctuation.separator.key-value.bbcode' },
                { begin: '"', end: '"', name: 'string.quoted.double.bbcode' },
                { begin: "'", end: "'", name: 'string.quoted.single.bbcode' },
                { match: '#[0-9a-fA-F]{3,8}\\b', name: 'constant.other.color.bbcode' },
                { match: '\\b\\d+(?:px|pt|em|rem|%)?\\b', name: 'constant.numeric.bbcode' },
                { match: '[^\\s\\]="\']+', name: 'string.unquoted.bbcode' },
            ],
        },
        entity: {
            patterns: [
                {
                    match: '&(?:[a-zA-Z][a-zA-Z0-9]*|#\\d+|#x[0-9a-fA-F]+);',
                    name: 'constant.character.entity.bbcode',
                },
            ],
        },
    },
};

writeFileSync('syntaxes/bbcode.tmLanguage.json', JSON.stringify(grammar, null, 4) + '\n');
console.log('grammar written');

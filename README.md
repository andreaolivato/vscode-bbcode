# BBCode Preview

A preview panel for BBCode in VS Code, the same way `.md` files get one.

There are already a few extensions that colour BBCode or complete its tags. None of them show you what the post will actually look like, which is the part I wanted. So this does the preview, and the rest of the language support came along with it.

## The preview

Open a `.bbcode` file and hit the preview icon in the editor title bar, or press `Ctrl+K` then `V` (`Cmd+K` then `V` on a Mac). That's the same chord VS Code uses for the Markdown preview. `Shift+Ctrl+V` opens it in the current tab instead.

It updates while you type. Your scroll position stays put and open spoilers stay open, because it swaps the rendered body in rather than reloading the whole panel. Scrolling is synced both ways, so the preview follows the editor and the editor follows the preview. Double-click anything in the preview to jump to that line in the source.

By default it uses a forum-ish skin that follows your VS Code theme. If you'd rather it matched your editor colours exactly, or you want a fixed light or dark forum look regardless of theme, see `bbcode.preview.theme`.

## Everything else

**Syntax highlighting.** Tags, attributes, quoted values, colours, sizes. Bold text is genuinely bold and quotes are muted, because the grammar hands the content `markup.*` scopes that your theme already styles. Code blocks tagged with a language get that language's real grammar: `[code=js]` is highlighted by the JavaScript grammar, and the same goes for TypeScript, HTML, CSS, Python, PHP, JSON, SQL, XML and shell.

**IntelliSense.** Tag names after `[`. After `[/` it offers the tag you actually have open, innermost first. Inside a tag you get parameter names, and known values for things like `[align=]` and `[list=]`.

**Auto-close.** Type `[quote]` and `[/quote]` shows up behind the cursor.

**Hovers** tell you what a tag does, what it takes, and show an example you can copy.

**Validation** flags unclosed tags, closing tags with nothing to close, list items loose outside a list, and tags that aren't part of the forum dialect you've picked.

**Outline and folding** for headings, quotes, spoilers, code blocks, lists and tables. Multi-line tags fold.

**Colour picker** on `[color=#ff8800]`, using the native VS Code one.

Plus snippets for the tags you reach for constantly.

### Editing shortcuts

`Ctrl/Cmd+B`, `+I` and `+U` toggle bold, italic and underline. To insert a link, press `Ctrl/Cmd+K` and then `Ctrl/Cmd+L`. There's also strikethrough, insert image, insert colour, and "Wrap Selection with Tag..." if you want to pick from the full list. Each toggle unwraps the tag again if it's already there.

Two more in the palette: **Copy as HTML**, and **Export as Standalone HTML File...** which writes a self-contained page with the stylesheet inlined.

## Tags

59 of them, covering the overlap between phpBB, vBulletin, XenForo, SMF, MyBB and Steam. Full list in [docs/tags.md](docs/tags.md).

```bbcode
[h1]Heading[/h1]

[b]Bold[/b], [i]italic[/i], [u]underlined[/u], [s]struck through[/s],
[color=#e03131]coloured[/color], [size=150]resized[/size], [font=Georgia]refonted[/font].

[quote="Alice" post=1234]Quoted text.[/quote]

[list]
[*]Bulleted items need no closing tag
[*]Nesting works
[/list]

[code=js]
console.log('highlighted with the real JavaScript grammar');
[/code]

[table]
[tr][th]Header[/th][/tr]
[tr][td]Cell[/td][/tr]
[/table]

[spoiler=Reveal]Hidden until clicked.[/spoiler]

[url=https://example.com]A link[/url] and [img]https://example.com/cat.png[/img]
```

### Dialects

Forum engines disagree, and the annoying part isn't which tags exist. It's that `[size=4]` means "step 4 on a 1-7 scale" in vBulletin and "4 percent" in phpBB. Set `bbcode.dialect` to whichever forum you're writing for:

| Dialect | What changes |
| --- | --- |
| `generic` (default) | Everything the extension knows. `[size=4]` is read as a scale step, `[size=150]` as a percentage. |
| `phpbb` | `[size]` is always a percentage. |
| `vbulletin` | `[size]` is always a step on the old 1-7 scale. |
| `xenforo` | Adds `[media]`, `[user]`, `[icode]`, `[ispoiler]`, `[bgcolor]`. |
| `smf` | Adds `[abbr]`, `[tt]`, `[pre]`, `[anchor]`. |
| `mybb` | Adds `[php]`, `[br]`. |
| `steam` | `[h1]`-`[h3]`, `[olist]`, `[strike]`, `[noparse]`. |

Tags outside your dialect still render. They just get flagged as a hint so you know they might not survive the trip to the forum.

## Getting started

Install it, then open anything ending in `.bbcode`, `.bbc` or `.bb`. For other files, **BBCode: Open Preview** in the Command Palette works too.

There are two files to poke at: [`samples/demo.bbcode`](samples/demo.bbcode) runs through every feature, and [`samples/kitchen-sink.bbcode`](samples/kitchen-sink.bbcode) is deliberately broken in various ways so you can see how it copes.

## Settings

Everything lives under `bbcode.`.

| Setting | Default | What it does |
| --- | --- | --- |
| `dialect` | `generic` | Which forum engine to assume. |
| `customTags` | `[]` | Your own tags. See below. |
| `validate.enabled` | `true` | Flag unclosed and misplaced tags while you type. |
| `validate.unknownTags` | `hint` | How loudly to complain about tags outside the dialect: `ignore`, `hint`, `information`, `warning`. |
| `suggest.enabled` | `true` | Tag, parameter and value suggestions. |
| `suggest.autoCloseTags` | `true` | Insert the closing tag after you type `]`. |

And for the preview:

| Setting | Default | What it does |
| --- | --- | --- |
| `preview.theme` | `auto` | `auto`, `editor`, `forum-light`, `forum-dark`. |
| `preview.fontFamily` | `""` | Empty follows the theme. |
| `preview.fontSize` | `14` | Pixels. |
| `preview.maxWidth` | `900` | Pixels. `0` means full width. |
| `preview.customStyles` | `[]` | Extra stylesheets, by URL or workspace-relative path. |
| `preview.newlineMode` | `br` | `br` turns every line break into a `<br>`, like forums do. `paragraph` starts a new paragraph at each blank line. |
| `preview.autoLink` | `true` | Linkify bare URLs and email addresses. |
| `preview.emoticons` | `true` | Turn `:)` and friends into emoji. |
| `preview.remoteImages` | `true` | Load images from remote servers. Turn it off to keep the preview offline. |
| `preview.embedVideos` | `true` | Embed players for `[youtube]`, `[vimeo]` and `[media]`. |
| `preview.unknownTags` | `text` | `text` shows them verbatim like a forum would. `strip` removes them. |
| `preview.scrollPreviewWithEditor` | `true` | Preview follows the editor. |
| `preview.scrollEditorWithPreview` | `true` | Editor follows the preview. |
| `preview.doubleClickToSwitchToEditor` | `true` | Double-click to jump to the source. |
| `preview.openLinksExternally` | `true` | Open `http`/`https` links in your browser. |

### Custom tags

Every forum has its own bespoke tags. Add yours:

```jsonc
"bbcode.customTags": [
  {
    "name": "steam",
    "description": "Links to a Steam profile.",
    "html": "<a href=\"https://steamcommunity.com/id/${text}\">${content}</a>"
  },
  {
    "name": "warn",
    "block": true,
    "html": "<div class=\"warning\">${content}</div>"
  }
]
```

The placeholders:

| | |
| --- | --- |
| `${content}` | The rendered inner content. For a `"raw": true` tag, the escaped text instead. |
| `${text}` | The inner text, escaped, with no tags interpreted. |
| `${value}` | The `value` in `[tag=value]`, escaped. |
| `${url}` | The `value` checked as a URL, or `#` if it isn't a safe one. Use this for `href` and `src`, not `${value}`. |
| `${param.NAME}` | A named parameter, escaped. |

Other fields you can set: `selfClosing` for tags with no closing half, `raw` to leave the content alone, `block` for block-level instead of inline.

Style them with `bbcode.preview.customStyles`.

## A note on trust

The preview is a webview with a strict content security policy, and the renderer builds every element itself. All text gets escaped, and every attribute value has to survive a check before it's used. `javascript:` URLs, `data:` documents, colours that aren't colours and sizes that aren't sizes get dropped rather than passed along. A forum post is untrusted input, so it's treated that way.

`bbcode.customTags` and `bbcode.preview.customStyles` are the exception, because injecting HTML and CSS is the entire point of them. Both are ignored in workspaces you haven't marked as trusted. Everything else works fine there.

## Working on it

```bash
npm install
npm run watch
```

Then F5 opens an Extension Development Host with the extension loaded and `samples/` open.

```bash
npm test             # unit tests, then integration tests in a real VS Code
npm run test:unit    # just the fast ones
npm run lint
npm run docs         # regenerate docs/tags.md from the tag registry
npm run vsix         # build an installable .vsix
```

Nothing in [`src/bbcode/`](src/bbcode) imports `vscode`, which means the whole engine runs as plain Node and its tests take milliseconds. Worth keeping that way.

## How it fits together

```
source text
   |
   +- lexer.ts      tokens, with exact source offsets
   +- parser.ts     a forgiving tree; anything odd becomes a Problem, never an exception
   +- resolver.ts   tag name to behaviour, merging the dialect with your custom tags
   +- renderer.ts   HTML, with data-bb-line attributes that make scroll sync work
```

Diagnostics, folding, the outline, IntelliSense and the preview all read the same cached tree, so a keystroke only costs one parse.

## Contributing

Issues and PRs welcome. Adding a tag is usually one entry in [`src/bbcode/tags.ts`](src/bbcode/tags.ts), a `case` in the renderer, and a test. More in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

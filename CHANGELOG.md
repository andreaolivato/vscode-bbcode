# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-26

First release.

### Added

Live preview panel, opened from the editor title bar, the Command Palette, or `Ctrl/Cmd+K V`. It updates as you type without losing your scroll position or closing open spoilers, syncs scrolling with the editor both ways, and lets you double-click through to the source. Four themes: follow the editor's colours, a forum look that tracks light and dark, or a fixed light or dark forum skin. Survives a restart.

The BBCode engine, with 59 tags spanning formatting, layout, lists, links, media, code, tables and odds and ends, covering phpBB, vBulletin, XenForo, SMF, MyBB and Steam. The parser doesn't reject input: malformed markup is kept and reported rather than thrown away.

Syntax highlighting, including real grammars inside `[code=...]` blocks for JavaScript, TypeScript, HTML, CSS, Python, PHP, JSON, SQL, XML and shell.

IntelliSense for tag names, closing tags, parameter names and known values. Tags auto-close after you type `]`. Hover documentation on every tag.

Diagnostics for unclosed tags, stray closing tags, misplaced list items, and tags outside the selected dialect.

Outline and folding for headings, quotes, spoilers, code blocks, lists and tables. Colour picker on `[color=...]` and `[bgcolor=...]`.

Editing commands: toggle bold, italic, underline and strikethrough; insert a link, image or colour; wrap a selection in any tag.

Export, either by copying the rendered HTML or saving a self-contained file.

Custom tags via `bbcode.customTags` and extra preview stylesheets via `bbcode.preview.customStyles`. Both are ignored in untrusted workspaces, since they inject HTML and CSS by design.

Snippets for the tags people use most.

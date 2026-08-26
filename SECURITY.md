# Security

## Supported versions

The latest published version gets fixes.

## Reporting something

Please don't open a public issue for a security problem. Use [GitHub's private vulnerability reporting](../../security/advisories/new) instead.

Include the BBCode that triggers it, what the preview does with it, and what you expected. You'll get an acknowledgement within a week.

## What I'd consider a security bug

This extension renders untrusted text, because that's what a forum post is. The interesting failures:

- BBCode that gets script into the preview webview, or produces an event-handler attribute, a `javascript:` URL, or anything else executable.
- BBCode that makes the preview fetch something while `bbcode.preview.remoteImages` is off.
- BBCode that hangs the parser or eats all the memory.
- Anything that lets a workspace's settings behave as though the workspace were trusted, `bbcode.customTags` and `bbcode.preview.customStyles` especially.

## What I wouldn't

Custom tags and custom stylesheets doing exactly what they're documented to do in a workspace you've trusted. Injecting HTML and CSS is their whole job, which is why they're switched off when a workspace isn't trusted.

A malformed document rendering differently from one particular forum engine is a bug, but a normal one. Open a regular issue for that.

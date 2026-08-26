// @ts-check
/**
 * Runs inside the preview webview.
 *
 * Responsibilities: swapping in new content without losing the scroll position,
 * two-way scroll sync with the editor, routing link clicks back to the
 * extension, and the copy button on code blocks.
 */
(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const settings = window.bbcodeSettings || {};
    const content = document.getElementById('bb-content');

    /** Set while the extension is driving the scroll position. */
    let scrollingFromEditor = false;
    let scrollTimer = null;

    // --------------------------------------------------------------- helpers

    /** Every element that maps back to a source line, in document order. */
    function lineMarkers() {
        return Array.prototype.slice.call(document.querySelectorAll('[data-bb-line]'));
    }

    /** The source line that best matches the current viewport. */
    function currentLine() {
        const markers = lineMarkers();
        if (markers.length === 0) {
            return 0;
        }
        const top = window.scrollY;
        let candidate = markers[0];
        for (const marker of markers) {
            if (marker.getBoundingClientRect().top + window.scrollY <= top + 8) {
                candidate = marker;
            } else {
                break;
            }
        }
        return Number(candidate.getAttribute('data-bb-line')) || 0;
    }

    function revealLine(line) {
        const markers = lineMarkers();
        if (markers.length === 0) {
            return;
        }

        let target = null;
        for (const marker of markers) {
            const markerLine = Number(marker.getAttribute('data-bb-line'));
            if (markerLine <= line) {
                target = marker;
            } else {
                break;
            }
        }

        scrollingFromEditor = true;
        if (target) {
            const offset = target.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: Math.max(0, offset - 12), behavior: 'auto' });
        } else {
            window.scrollTo({ top: 0, behavior: 'auto' });
        }
        window.setTimeout(function () {
            scrollingFromEditor = false;
        }, 60);
    }

    function persist() {
        vscode.setState({ resource: settings.resource, line: currentLine() });
    }

    // -------------------------------------------------------------- messages

    window.addEventListener('message', function (event) {
        const message = event.data;
        if (!message) {
            return;
        }

        if (message.type === 'update') {
            const previousScroll = window.scrollY;
            // Record which spoilers are open by their position among *all*
            // spoilers, so the same ones can be reopened after the swap.
            const openSpoilers = new Set();
            document.querySelectorAll('details.bb-spoiler').forEach(function (details, index) {
                if (details.hasAttribute('open')) {
                    openSpoilers.add(index);
                }
            });

            content.innerHTML = message.body;

            document.querySelectorAll('details.bb-spoiler').forEach(function (details, index) {
                if (openSpoilers.has(index)) {
                    details.setAttribute('open', '');
                }
            });
            window.scrollTo({ top: previousScroll, behavior: 'auto' });
            persist();
            return;
        }

        if (message.type === 'revealLine') {
            revealLine(message.line);
        }
    });

    // ----------------------------------------------------------------- input

    window.addEventListener(
        'scroll',
        function () {
            if (scrollingFromEditor) {
                return;
            }
            if (scrollTimer !== null) {
                window.clearTimeout(scrollTimer);
            }
            scrollTimer = window.setTimeout(function () {
                scrollTimer = null;
                if (settings.scrollEditorWithPreview) {
                    vscode.postMessage({ type: 'scroll', line: currentLine() });
                }
                persist();
            }, 60);
        },
        { passive: true },
    );

    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) {
            return;
        }
        const copyButton = event.target.closest('[data-bb-copy]');
        if (copyButton) {
            const block = copyButton.closest('.bb-code');
            const code = block && block.querySelector('code');
            if (code) {
                navigator.clipboard.writeText(code.textContent || '').then(function () {
                    copyButton.textContent = 'Copied';
                    copyButton.classList.add('is-copied');
                    window.setTimeout(function () {
                        copyButton.textContent = 'Copy';
                        copyButton.classList.remove('is-copied');
                    }, 1500);
                });
            }
            return;
        }

        const anchor = event.target.closest('a[href]');
        if (!anchor) {
            return;
        }
        const href = anchor.getAttribute('href') || '';
        if (href.startsWith('#')) {
            // In-page anchor: let the browser handle it.
            return;
        }
        event.preventDefault();
        vscode.postMessage({ type: 'openLink', href: href });
    });

    document.addEventListener('dblclick', function (event) {
        if (!settings.doubleClickToSwitchToEditor || !(event.target instanceof Element)) {
            return;
        }
        let node = event.target;
        while (node && node !== document.body && !node.hasAttribute('data-bb-line')) {
            node = node.parentElement;
        }
        const line = node && node.getAttribute ? Number(node.getAttribute('data-bb-line')) : NaN;
        vscode.postMessage({ type: 'jumpToLine', line: Number.isNaN(line) ? 0 : line });
    });

    // ----------------------------------------------------------------- start

    const restored = vscode.getState();
    if (restored && restored.resource === settings.resource && restored.line) {
        revealLine(restored.line);
    } else if (settings.initialLine) {
        revealLine(settings.initialLine);
    }

    vscode.postMessage({ type: 'ready' });
})();

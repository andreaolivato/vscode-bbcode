/** Typed access to the `bbcode.*` settings. */

import * as vscode from 'vscode';

import { CustomTagDefinition } from './bbcode/resolver';
import { Dialect } from './bbcode/tags';

export interface PreviewConfig {
    readonly theme: 'auto' | 'editor' | 'forum-light' | 'forum-dark';
    readonly fontFamily: string;
    readonly fontSize: number;
    readonly maxWidth: number;
    readonly customStyles: readonly string[];
    readonly newlineMode: 'br' | 'paragraph';
    readonly autoLink: boolean;
    readonly emoticons: boolean;
    readonly remoteImages: boolean;
    readonly embedVideos: boolean;
    readonly unknownTags: 'text' | 'strip';
    readonly scrollPreviewWithEditor: boolean;
    readonly scrollEditorWithPreview: boolean;
    readonly doubleClickToSwitchToEditor: boolean;
    readonly openLinksExternally: boolean;
}

export interface BBCodeConfig {
    readonly dialect: Dialect;
    readonly customTags: readonly CustomTagDefinition[];
    readonly validateEnabled: boolean;
    readonly unknownTagSeverity: 'ignore' | 'hint' | 'information' | 'warning';
    readonly suggestEnabled: boolean;
    readonly autoCloseTags: boolean;
    readonly preview: PreviewConfig;
}

/** Setting sections that require a restart of the preview when they change. */
export const CONFIG_SECTION = 'bbcode';

const DIALECTS: readonly Dialect[] = ['generic', 'phpbb', 'vbulletin', 'xenforo', 'smf', 'mybb', 'steam'];

export function getConfig(resource?: vscode.Uri): BBCodeConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION, resource);
    const dialect = config.get<string>('dialect', 'generic');

    return {
        dialect: (DIALECTS as readonly string[]).includes(dialect) ? (dialect as Dialect) : 'generic',
        customTags: readCustomTags(config),
        validateEnabled: config.get<boolean>('validate.enabled', true),
        unknownTagSeverity: config.get<BBCodeConfig['unknownTagSeverity']>('validate.unknownTags', 'hint'),
        suggestEnabled: config.get<boolean>('suggest.enabled', true),
        autoCloseTags: config.get<boolean>('suggest.autoCloseTags', true),
        preview: {
            theme: config.get<PreviewConfig['theme']>('preview.theme', 'auto'),
            fontFamily: config.get<string>('preview.fontFamily', ''),
            fontSize: config.get<number>('preview.fontSize', 14),
            maxWidth: config.get<number>('preview.maxWidth', 900),
            customStyles: isTrusted() ? config.get<string[]>('preview.customStyles', []) : [],
            newlineMode: config.get<PreviewConfig['newlineMode']>('preview.newlineMode', 'br'),
            autoLink: config.get<boolean>('preview.autoLink', true),
            emoticons: config.get<boolean>('preview.emoticons', true),
            remoteImages: config.get<boolean>('preview.remoteImages', true),
            embedVideos: config.get<boolean>('preview.embedVideos', true),
            unknownTags: config.get<PreviewConfig['unknownTags']>('preview.unknownTags', 'text'),
            scrollPreviewWithEditor: config.get<boolean>('preview.scrollPreviewWithEditor', true),
            scrollEditorWithPreview: config.get<boolean>('preview.scrollEditorWithPreview', true),
            doubleClickToSwitchToEditor: config.get<boolean>('preview.doubleClickToSwitchToEditor', true),
            openLinksExternally: config.get<boolean>('preview.openLinksExternally', true),
        },
    };
}

/**
 * Custom tags inject HTML into the preview, so they are only honoured in a
 * workspace the user has marked as trusted.
 */
function readCustomTags(config: vscode.WorkspaceConfiguration): CustomTagDefinition[] {
    if (!isTrusted()) {
        return [];
    }
    const raw = config.get<unknown[]>('customTags', []);
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.filter(isCustomTag);
}

function isCustomTag(value: unknown): value is CustomTagDefinition {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const tag = value as Partial<CustomTagDefinition>;
    return (
        typeof tag.name === 'string' &&
        /^[A-Za-z][A-Za-z0-9_.-]*$/.test(tag.name) &&
        typeof tag.html === 'string'
    );
}

function isTrusted(): boolean {
    return vscode.workspace.isTrusted;
}

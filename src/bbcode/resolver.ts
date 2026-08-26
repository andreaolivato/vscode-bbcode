/**
 * Resolves tag names to the behaviour the parser and renderer need, merging the
 * built-in registry for the active dialect with any user-defined custom tags.
 */

import { ContentMode, Dialect, TagDefinition, TagKind, findTag, isInDialect } from './tags';

/** A tag contributed through the `bbcode.customTags` setting. */
export interface CustomTagDefinition {
    readonly name: string;
    /**
     * HTML template. `${content}`, `${value}` and `${param.NAME}` are replaced
     * with HTML-escaped values.
     */
    readonly html: string;
    readonly description?: string;
    readonly selfClosing?: boolean;
    readonly raw?: boolean;
    readonly block?: boolean;
}

export interface ResolvedTag {
    /** Canonical name; for aliases this is the name of the target definition. */
    readonly name: string;
    readonly kind: TagKind;
    readonly content: ContentMode;
    readonly closedBy?: readonly string[];
    readonly parents?: readonly string[];
    /** Set when the tag comes from the built-in registry. */
    readonly definition?: TagDefinition;
    /** Set when the tag comes from `bbcode.customTags`. */
    readonly custom?: CustomTagDefinition;
}

export interface TagResolver {
    resolve(name: string): ResolvedTag | undefined;
    isRawTag(name: string): boolean;
    readonly dialect: Dialect;
    readonly customTags: readonly CustomTagDefinition[];
}

export function createResolver(
    dialect: Dialect = 'generic',
    customTags: readonly CustomTagDefinition[] = [],
): TagResolver {
    const custom = new Map<string, CustomTagDefinition>();
    for (const tag of customTags) {
        if (tag && typeof tag.name === 'string' && typeof tag.html === 'string') {
            custom.set(tag.name.toLowerCase(), tag);
        }
    }

    const cache = new Map<string, ResolvedTag | undefined>();

    const resolve = (name: string): ResolvedTag | undefined => {
        const key = name.toLowerCase();
        if (cache.has(key)) {
            return cache.get(key);
        }

        let result: ResolvedTag | undefined;

        // Custom tags win, so that a user can override a built-in rendering.
        const own = custom.get(key);
        if (own) {
            result = {
                name: key,
                kind: own.selfClosing ? 'void' : own.block ? 'block' : 'inline',
                content: own.raw ? 'raw' : 'parse',
                custom: own,
            };
        } else {
            const def = findTag(key);
            if (def && isInDialect(def, dialect)) {
                result = {
                    name: def.name,
                    kind: def.kind,
                    content: def.content,
                    closedBy: def.closedBy,
                    parents: def.parents,
                    definition: def,
                };
            }
        }

        cache.set(key, result);
        return result;
    };

    return {
        resolve,
        isRawTag: (name) => resolve(name)?.content === 'raw',
        dialect,
        customTags,
    };
}

import { context } from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Reports esbuild failures in a format the VS Code problem matcher in
 * `.vscode/tasks.json` understands.
 * @type {import('esbuild').Plugin}
 */
const problemMatcherPlugin = {
    name: 'problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            for (const error of result.errors) {
                console.error(`✘ [ERROR] ${error.text}`);
                if (error.location) {
                    console.error(`    ${error.location.file}:${error.location.line}:${error.location.column}:`);
                }
            }
            console.log('[watch] build finished');
        });
    },
};

async function main() {
    const ctx = await context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        target: 'node20',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [problemMatcherPlugin],
    });

    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

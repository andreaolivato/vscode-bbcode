import { defineConfig } from '@vscode/test-cli';

/**
 * Options shared by both suites. `@vscode/test-cli` defaults to Mocha's `tdd`
 * interface, so `ui` has to be set explicitly for `describe`/`it` to exist.
 */
const mocha = {
    ui: 'bdd',
    timeout: 30000,
};

export default defineConfig([
    {
        // Tests that need a real extension host: commands, providers, webviews.
        label: 'integration',
        files: 'out/test/integration/**/*.test.js',
        workspaceFolder: './samples',
        version: 'stable',
        mocha,
    },
    {
        // Parser and renderer tests, which touch no VS Code API. `npm run
        // test:unit` runs these under plain Mocha in a fraction of the time;
        // they are listed here too so the Extension Test Runner shows them in
        // the Testing view alongside the integration suite.
        label: 'unit',
        files: 'out/test/unit/**/*.test.js',
        version: 'stable',
        mocha,
    },
]);

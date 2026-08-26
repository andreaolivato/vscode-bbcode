/**
 * Mocha entry point for the "Run Integration Tests" launch configuration.
 *
 * `npm test` goes through `@vscode/test-cli` instead, which discovers the same
 * `*.test.js` files; this file exists so the suite can be launched and debugged
 * from inside VS Code with F5.
 */

import * as path from 'node:path';

import Mocha from 'mocha';

export async function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 30000 });
    const testsRoot = __dirname;

    const { glob } = await import('glob');
    const files = await glob('**/*.test.js', { cwd: testsRoot });
    for (const file of files) {
        mocha.addFile(path.resolve(testsRoot, file));
    }

    await new Promise<void>((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} test${failures === 1 ? '' : 's'} failed.`));
            } else {
                resolve();
            }
        });
    });
}

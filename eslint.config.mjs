import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['dist/**', 'out/**', 'node_modules/**', '.vscode-test/**', 'media/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase'],
                },
            ],
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            curly: 'error',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-throw-literal': 'error',
            semi: 'error',
        },
    },
);

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-globals': ['error', { name: 'eval', message: 'Deterministic tools must never evaluate code.' }],
      'no-new-func': 'error',
      'no-eval': 'error',
    },
  },
  {
    files: ['packages/{core,math,statistics,finance,datetime,units}/src/**/*.ts', 'examples/acme-chemistry/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Tools must be deterministic.' },
        { object: 'Date', property: 'now', message: 'Pass time explicitly as input.' },
        { object: 'process', property: 'env', message: 'Tools must not depend on environment variables.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'node:fs', message: 'Tools must not read files.' },
            { name: 'node:child_process', message: 'Tools must not spawn processes.' },
            { name: 'node:http', message: 'Tools must not make network calls.' },
            { name: 'node:https', message: 'Tools must not make network calls.' },
          ],
        },
      ],
    },
  },
);

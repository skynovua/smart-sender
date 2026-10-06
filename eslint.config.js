import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    '.tanstack',
    'src/routeTree.gen.ts',
    'public/mockServiceWorker.js',
    '.husky/_',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['src/**/*.tsx'],
    extends: [reactRefresh.configs.vite],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
          allowExportNames: ['Route'],
        },
      ],
    },
  },
  {
    files: ['src/routes/**/*.tsx'],
    // TanStack Router transforms route modules and manages their Fast Refresh boundaries.
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  prettier,
]);

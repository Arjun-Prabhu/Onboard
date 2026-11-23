/**
 * @file ESLint flat config — TypeScript + React Hooks rules.
 * Zero warnings are expected at submission (NFR-8).
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Prisma writes contract.d.ts / contract.json and migration snapshots; they are generated.
  {
    ignores: [
      'dist',
      'node_modules',
      'data',
      'server/prisma/contract.d.ts',
      'server/prisma/migrations',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);

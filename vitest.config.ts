/**
 * @file Vitest configuration — unit tests for shared rules and domain services, plus API tests
 * against the real Express + Prisma server on temporary SQLite databases.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // API tests migrate a template SQLite database once (see tests/api/globalSetup.ts).
    globalSetup: ['tests/api/globalSetup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});

/**
 * @file Vite configuration for the Onboard web client.
 *
 * Onboard runs as a local web app on the presenter's laptop. In development Vite serves the
 * React app and proxies `/api` to the Express server (same origin in production, where
 * Express serves the built `dist/` folder itself).
 */
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/** Port the Express API listens on (see `.env` / README). */
const API_PORT = Number(process.env.API_PORT ?? 3000);
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Strict Content-Security-Policy: scripts, fonts and API calls all come from the same local
 * server. Added only to production builds, because Vite's dev server injects an inline
 * hot-reload script. (Express will also send this as a header via helmet.)
 */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:";

/**
 * Injects the CSP `<meta>` tag into the built `index.html`.
 * @returns A Vite plugin that runs at build time only.
 */
function cspPlugin(): Plugin {
  return {
    name: 'onboard-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  root: 'client',
  base: '/',
  plugins: [react(), tailwindcss(), cspPlugin()],
  define: {
    /** App version shown in Settings, read from package.json at build time. */
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Current evergreen browsers only (NFR-9).
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in the browser; Vite forwards API calls to Express during development.
    proxy: { '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false } },
  },
  preview: { host: '127.0.0.1' },
});

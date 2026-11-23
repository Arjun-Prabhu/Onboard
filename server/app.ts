/**
 * @file Builds the Express application: security headers, JSON parsing, the API and (in
 * production) the built React UI with an SPA fallback.
 *
 * Kept separate from `index.ts` so tests can mount the app on a temporary database without
 * opening a port.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { attachUser, errorHandler, notFound, sameOriginOnly } from './middleware';
import { apiRouter } from './routes';
import type { Store } from './store';

/**
 * Creates the Onboard Express app.
 * @param store - Data store (owns the Prisma client).
 * @param options - `serveClient`: also serve `dist/` (production).
 * @returns The app.
 */
export function createApp(store: Store, options: { serveClient?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  // Security headers. The CSP allows only this origin: no inline scripts, no third-party hosts
  // (fonts are bundled), no framing. Charts and PDFs are generated locally.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': null,
        },
      },
      // Plain HTTP on 127.0.0.1: HSTS would only get in the way.
      strictTransportSecurity: false,
    }),
  );

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(sameOriginOnly);
  api.use(attachUser(store.db));
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(apiRouter(store));
  api.use(notFound);
  api.use(errorHandler);
  app.use('/api', api);

  if (options.serveClient) {
    const index = path.join(config.clientDist, 'index.html');
    if (!fs.existsSync(index))
      console.warn('[onboard] dist/ not found. Run `npm run build` to serve the UI.');
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    // SPA fallback: React Router owns every non-API path.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(index));
  }
  return app;
}

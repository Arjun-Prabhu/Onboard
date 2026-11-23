/**
 * @file Onboard server entry point (`npm start`, `npm run dev`).
 *
 * Opens the SQLite database through Prisma, seeds the demo data on first run, and listens on
 * 127.0.0.1 only. If the preferred port is taken, it tries the next few so the demo never fails
 * on a busy laptop. Ctrl+C closes the HTTP server and the database cleanly.
 */
import type { Server } from 'node:http';
import { config } from './config';
import { createApp } from './app';
import { createDb } from './prisma/db';
import { seedIfEmpty } from './prisma/seed';
import { deleteExpiredSessions } from './repositories/authRepository';
import { Store } from './store';

/** How many ports after the preferred one to try. */
const PORT_ATTEMPTS = 10;

/**
 * Listens on the first free port from `config.port` upward.
 * @param app - Express app.
 * @returns The listening server and its port.
 */
function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const attempt = (port: number, left: number) => {
      const server = app.listen(port, config.host);
      server.once('listening', () => resolve({ server, port }));
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && left > 0) attempt(port + 1, left - 1);
        else reject(err);
      });
    };
    attempt(config.port, PORT_ATTEMPTS);
  });
}

const db = createDb(config.databasePath);
try {
  if (await seedIfEmpty(db)) console.log('[onboard] First run: loaded the demo data.');
} catch (err) {
  console.error(
    '[onboard] Could not open the database. Run `npm run db:migrate` first.\n',
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
}
await deleteExpiredSessions(db);

const store = new Store(db);
await store.current(); // warm the cache so the first request is fast
const app = createApp(store, { serveClient: config.production });
const { server, port } = await listen(app);
console.log(
  `[onboard] API ready at http://localhost:${port}/api` +
    (config.production ? `. Open http://localhost:${port}` : ''),
);

/** Stops accepting requests, then closes the database. */
async function shutdown(signal: string) {
  console.log(`[onboard] ${signal} received, shutting down.`);
  server.close();
  await db.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

/**
 * @file Server settings, read once from the environment (see `.env.example`).
 *
 * Onboard runs on the presenter's laptop, so every default is chosen to work with no setup:
 * port 3000 on 127.0.0.1 only (never exposed to the network), the database in `./data`.
 */
import path from 'node:path';

/** Parses a boolean environment flag. */
const flag = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : ['1', 'true', 'yes'].includes(value.toLowerCase());

/** Resolved server configuration. */
export const config = {
  /** Preferred HTTP port; the server tries the next few if it is busy. */
  port: Number(process.env.PORT ?? 3000),
  /** Loopback only: the demo machine is the only client. */
  host: '127.0.0.1',
  /** Absolute path to the SQLite file. */
  databasePath: path.resolve(process.env.DATABASE_PATH ?? './data/onboard.db'),
  /** Enables `POST /api/meta/reset-demo` (on by default for the competition demo). */
  demoMode: flag(process.env.DEMO_MODE, true),
  /** Built UI served by Express in `npm start`. */
  clientDist: path.resolve('dist'),
  /** A sign-in ends after this many hours without activity (NFR-7). */
  sessionIdleHours: 8,
  /** …and never lasts longer than this many days, however active (NFR-7). */
  sessionMaxDays: 30,
  /** Activity extends a sign-in at most this often, so clicks don't each write to the database. */
  sessionTouchMinutes: 15,
  /** bcrypt cost factor (NFR-6). */
  bcryptRounds: 10,
  /** Production run (`npm start` passes `--production`): also serve the built UI. */
  production: process.env.NODE_ENV === 'production' || process.argv.includes('--production'),
} as const;

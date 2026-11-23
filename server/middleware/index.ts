/**
 * @file Express middleware: who is signed in, same-origin protection, rate limits and the
 * centralized error handler (§2.7).
 */
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError, GENERIC_ERROR_MESSAGE, type AppErrorCode } from '@shared/errors';
import type { Db } from '../prisma/db';
import { lookupSession } from '../repositories/authRepository';

declare module 'express-serve-static-core' {
  interface Request {
    /** The signed-in person's id, set by {@link attachUser}. */
    userId?: string;
    /** The raw session token from the cookie, if any. */
    sessionToken?: string;
  }
}

/** Name of the httpOnly session cookie. */
export const SESSION_COOKIE = 'onboard_session';

/**
 * Reads one cookie from the `Cookie` header (no extra dependency needed for a single cookie).
 * @param req - Request.
 * @param name - Cookie name.
 * @returns The decoded value, or undefined.
 */
function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Resolves the session cookie to `req.userId`. Never rejects a request on its own; routes that
 * need a person call `currentUser`, which answers 401.
 * @param db - Prisma client.
 * @returns Middleware.
 */
export function attachUser(db: Db): RequestHandler {
  return async (req, res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      req.sessionToken = token;
      const found = await lookupSession(db, token);
      req.userId = found?.userId;
      // The sign-in slid forward: keep the browser's cookie in step with it.
      if (found?.renewedUntil) setSessionCookie(res, token, found.renewedUntil);
    }
    next();
  };
}

/**
 * Sets the session cookie: httpOnly (no JavaScript access), SameSite=Strict (never sent on
 * cross-site requests) and scoped to the API. `Secure` is left off because the demo serves plain
 * HTTP on 127.0.0.1, where browsers treat the origin as secure anyway.
 * @param res - Response.
 * @param token - Raw token.
 * @param expiresAt - Expiry.
 */
export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/api',
    expires: expiresAt,
  });
}

/**
 * Clears the session cookie.
 * @param res - Response.
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', path: '/api' });
}

/**
 * Cross-site request protection for state-changing requests: a body must be JSON (an HTML form
 * on another site can't send that without a CORS preflight, which this API never grants), and an
 * `Origin` header, when present, must be this server.
 * @param req - Request.
 * @param _res - Response.
 * @param next - Next.
 */
export function sameOriginOnly(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host)
    return next(new AppError('FORBIDDEN', 'Requests must come from the Onboard app.'));
  const hasBody =
    Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'];
  if (hasBody && !req.is('application/json'))
    return next(new AppError('VALIDATION', 'Send the request body as JSON.'));
  next();
}

/**
 * Brute-force protection for sign-in: 10 attempts per 15 minutes per address (NFR-6).
 * A factory, so every app instance (and every test) counts separately.
 * @returns Middleware.
 */
export const loginLimiter = () =>
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError('FORBIDDEN', 'Too many sign-in attempts. Wait 15 minutes and try again.')),
  });

/**
 * Spam protection for the public application form: 20 per hour per address.
 * @returns Middleware.
 */
export const applyLimiter = () =>
  rateLimit({
    windowMs: 60 * 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError('FORBIDDEN', 'Too many applications from this device. Try again later.')),
  });

/** HTTP status for each error code. */
const STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  RULE_VIOLATION: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNKNOWN: 500,
};

/**
 * Maps database errors that a race could still produce (two requests passing the same check)
 * onto friendly AppErrors.
 * @param err - Unknown error.
 * @returns An AppError, or undefined if it isn't a known database error.
 */
function fromDatabaseError(err: unknown): AppError | undefined {
  const message = err instanceof Error ? err.message : String(err);
  if (/UNIQUE constraint failed/i.test(message))
    return new AppError('CONFLICT', 'That already exists. Refresh and try again.');
  if (/FOREIGN KEY constraint failed/i.test(message))
    return new AppError(
      'CONFLICT',
      'Something this depends on was changed. Refresh and try again.',
    );
  return undefined;
}

/** Unknown routes under /api. */
export const notFound: RequestHandler = (_req, _res, next) =>
  next(new AppError('NOT_FOUND', "That API endpoint doesn't exist."));

/**
 * Centralized error handler (§2.7 step 4). Expected errors become `{ code, message, field? }`
 * with the matching status; anything unexpected is logged on the server and the client gets a
 * generic message with no stack trace or internals.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  let appError = err instanceof AppError ? err : fromDatabaseError(err);
  if (!appError && (err as { type?: string })?.type === 'entity.parse.failed')
    appError = new AppError('VALIDATION', 'The request body is not valid JSON.');
  if (!appError && (err as { type?: string })?.type === 'entity.too.large')
    appError = new AppError('VALIDATION', 'The request is too large.');
  if (!appError) {
    console.error(`[onboard] ${req.method} ${req.originalUrl} failed:`, err);
    appError = new AppError('UNKNOWN', GENERIC_ERROR_MESSAGE);
  }
  res.status(STATUS[appError.code]).json(appError.toJSON());
};

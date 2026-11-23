/**
 * @file Small adapters that turn service functions into Express handlers, plus query-string
 * parsing.
 *
 * Every route is one line: `get('/path', read((data, me, req) => service(data, me, …)))`.
 * `read` runs against the cached snapshot; `write` runs on a draft that the store commits in one
 * transaction. Both resolve the signed-in person first, so a route can't forget authentication.
 */
import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { HourStatus, SessionType, VolunteerStatus } from '@shared/enums';
import type { DataSnapshot } from '@shared/domain/snapshot';
import type { SessionFilters, User } from '@shared/types';
import { currentUser, validate } from '../services/context';
import type { Store } from '../store';

/** A service call that needs the signed-in person. */
type Handler<T> = (data: DataSnapshot, me: User, req: Request) => T | Promise<T>;

/**
 * Sends a handler result: JSON, or 204 No Content for `undefined`.
 * @param res - Response.
 * @param result - Value to send.
 * @param status - Success status.
 */
function send(res: Response, result: unknown, status = 200): void {
  if (result === undefined) res.status(204).end();
  else res.status(status).json(result);
}

/** Route builders bound to one store. */
export function handlers(store: Store) {
  return {
    /**
     * A signed-in, read-only route.
     * @param fn - Service call.
     * @returns Express handler.
     */
    read:
      <T>(fn: Handler<T>): RequestHandler =>
      async (req, res) =>
        send(res, await store.read((data) => fn(data, currentUser(data, req.userId), req))),

    /**
     * A signed-in route that changes data.
     * @param fn - Service call (mutates the draft).
     * @param status - Success status (201 for creates).
     * @returns Express handler.
     */
    write:
      <T>(fn: Handler<T>, status = 200): RequestHandler =>
      async (req, res) =>
        send(
          res,
          await store.write((draft) => fn(draft, currentUser(draft, req.userId), req)),
          status,
        ),
  };
}

/** Accepts `"true"`/`"1"` as true and anything else as false. */
const queryBool = z
  .union([z.string(), z.boolean()])
  .transform((v) => v === true || v === 'true' || v === '1')
  .optional();
const queryInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max).optional();
const queryText = z.string().trim().max(100).optional();

/** Session list filters from the query string (FR-25). */
const sessionFiltersSchema = z.object({
  search: queryText,
  priorityOnly: queryBool,
  dayOfWeek: queryInt(0, 6),
  skill: queryText,
  type: z.enum([SessionType.SHIFT, SessionType.EVENT, SessionType.TRAINING]).optional(),
  withinDays: queryInt(1, 366),
  needsVolunteersOnly: queryBool,
  siteId: queryText,
  orgId: queryText,
  guestsOnly: queryBool,
  includePast: queryBool,
});

/**
 * Parses session filters from `?search=…&priorityOnly=true…`.
 * @param req - Request.
 * @returns Filters.
 */
export const sessionFilters = (req: Request): SessionFilters =>
  validate(sessionFiltersSchema, req.query) as SessionFilters;

/** Volunteer list query (FR-8). */
const volunteerQuerySchema = z.object({
  search: queryText,
  status: z.enum(VolunteerStatus).optional(),
  skill: queryText,
});

/**
 * Parses `?search=&status=&skill=`.
 * @param req - Request.
 * @returns Query.
 */
export const volunteerQuery = (req: Request) => validate(volunteerQuerySchema, req.query);

/** Hour review queue query (FR-19). */
const hourQuerySchema = z.object({ status: z.enum(HourStatus).optional(), userId: queryText });

/**
 * Parses `?status=&userId=`.
 * @param req - Request.
 * @returns Query.
 */
export const hourQuery = (req: Request) => validate(hourQuerySchema, req.query);

/**
 * Reads `?includeArchived=true`.
 * @param req - Request.
 * @returns Whether archived rows are wanted.
 */
export const includeArchived = (req: Request): boolean =>
  req.query.includeArchived === 'true' || req.query.includeArchived === '1';

/**
 * Reads an optional `?limit=` number.
 * @param req - Request.
 * @returns The limit, or undefined.
 */
export const limitOf = (req: Request): number | undefined =>
  req.query.limit === undefined ? undefined : Number(req.query.limit);

/**
 * A route parameter, as a string (Express 5 types allow arrays for wildcard params).
 * @param req - Request.
 * @param name - Parameter name.
 * @returns Its value.
 */
export const param = (req: Request, name: string): string => String(req.params[name]);

/**
 * The JSON body as a plain object (never undefined).
 * @param req - Request.
 * @returns Body.
 */
export const body = (req: Request): Record<string, unknown> =>
  req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

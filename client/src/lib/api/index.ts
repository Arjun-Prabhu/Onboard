/**
 * @file The one API instance every page imports: the HTTP client for the local Express + Prisma
 * server (same origin, `/api`).
 */
import type { ApiClient } from './contract';
import { httpApi } from './httpApi';

/** The active API client. */
export const api: ApiClient = httpApi;

export type { ApiClient } from './contract';

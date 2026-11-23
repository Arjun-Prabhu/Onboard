/**
 * @file Helpers every service uses: identity, org-scoped authorization, validation, rule
 * enforcement, ownership lookups and id generation.
 *
 * Services are plain functions over a {@link DataSnapshot}. Read services receive the cached
 * snapshot; write services receive a draft that the {@link Store} persists afterwards. Neither
 * knows about HTTP or Prisma, which keeps the business logic easy to test.
 */
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import type { OrgRole } from '@shared/enums';
import { AppError } from '@shared/errors';
import { can, type Permission } from '@shared/permissions';
import * as rules from '@shared/rules';
import { toFieldErrors } from '@shared/schemas';
import type { DataSnapshot, StoredUser } from '@shared/domain/snapshot';
import { termsOf, type Terms } from '@shared/terms';
import type { Organization, User } from '@shared/types';

/**
 * Generates a new primary key such as `ses_m3k9x2a7f1qz`: a readable prefix, a time part (so
 * ids sort roughly by creation) and 48 random bits (so two writes never collide).
 * @param prefix - Entity prefix.
 * @returns A unique id.
 */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
}

/**
 * Strips the password hash from a stored user.
 * @param u - Stored user.
 * @returns The user without secrets.
 */
export function safeUser(u: StoredUser): User {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = u;
  return rest;
}

/**
 * Whether a stored person is a contact: someone who helped once as a guest without an account
 * (FR-4c). Contacts have no password and can never sign in.
 * @param u - Stored person.
 * @returns `true` when they have no password.
 */
export const isContact = (u: StoredUser) => !u.passwordHash;

/**
 * Resolves the signed-in person in the snapshot.
 * @param data - Snapshot.
 * @param userId - Id from the session cookie (undefined when signed out).
 * @returns The person.
 * @throws AppError UNAUTHORIZED when nobody is signed in.
 */
export function currentUser(data: DataSnapshot, userId: string | undefined): User {
  const stored = userId ? data.users.find((u) => u.id === userId) : undefined;
  if (!stored) throw new AppError('UNAUTHORIZED', 'Please sign in to continue.');
  return safeUser(stored);
}

/**
 * The person's management role in an org, if any.
 * @param data - Snapshot.
 * @param orgId - Org.
 * @param userId - Person.
 * @returns Role or null.
 */
export function roleIn(data: DataSnapshot, orgId: string, userId: string): OrgRole | null {
  return data.memberships.find((m) => m.orgId === orgId && m.userId === userId)?.orgRole ?? null;
}

/**
 * Org-scoped authorization (FR-2): the person's Membership in `orgId` must grant `permission`.
 * Being an Owner elsewhere grants nothing here.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Target org.
 * @param permission - Required capability.
 * @returns The person's role in the org.
 * @throws AppError NOT_FOUND for an unknown org, FORBIDDEN without enough rank.
 */
export function requireOrg(
  data: DataSnapshot,
  me: User,
  orgId: string,
  permission: Permission,
): OrgRole {
  if (!data.organizations.some((o) => o.id === orgId))
    throw new AppError('NOT_FOUND', 'That organization no longer exists.');
  const role = roleIn(data, orgId, me.id);
  if (!can(role, permission))
    throw new AppError('FORBIDDEN', "Your role in this organization doesn't allow that.");
  return role as OrgRole;
}

/**
 * Validates input with a shared Zod schema (the same one the form uses). Never trust the client.
 * @param schema - Zod schema.
 * @param input - Raw request input.
 * @returns Parsed, typed data.
 * @throws AppError VALIDATION with per-field messages.
 */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    const first = Object.entries(fieldErrors)[0];
    throw new AppError(
      'VALIDATION',
      first?.[1] ?? 'Please check the form.',
      first?.[0],
      fieldErrors,
    );
  }
  return parsed.data;
}

/**
 * Throws a RULE_VIOLATION for the first failed semantic rule (V-S1…V-S14).
 * @param results - Rule results in priority order.
 */
export function enforce(...results: rules.RuleResult[]): void {
  const r = rules.firstFailure(...results);
  if (!r.ok) throw new AppError('RULE_VIOLATION', r.message, r.field, { [r.field]: r.message });
}

/**
 * Returns an entity or throws NOT_FOUND.
 * @param item - Possibly-missing entity.
 * @param label - Entity name for the message.
 * @returns The entity.
 */
export function found<T>(item: T | undefined | null, label: string): T {
  if (!item) throw new AppError('NOT_FOUND', `That ${label} no longer exists.`);
  return item;
}

/** @returns The org a site belongs to. */
export const orgOfSite = (data: DataSnapshot, siteId: string): string =>
  found(
    data.sites.find((s) => s.id === siteId),
    'site',
  ).orgId;

/** @returns The org a program belongs to (through its site). */
export const orgOfProgram = (data: DataSnapshot, programId: string): string =>
  orgOfSite(
    data,
    found(
      data.programs.find((p) => p.id === programId),
      'program',
    ).siteId,
  );

/** @returns The org a session belongs to (through its program and site). */
export const orgOfSession = (data: DataSnapshot, sessionId: string): string =>
  orgOfProgram(
    data,
    found(
      data.sessions.find((s) => s.id === sessionId),
      'session',
    ).programId,
  );

/** A short "First Last" for audit fields such as `changedBy` and `reviewedBy`. */
export const fullName = (u: User): string => `${u.firstName} ${u.lastName}`;

/** @returns The org with this id, or NOT_FOUND. */
export const orgById = (data: DataSnapshot, orgId: string): Organization =>
  found(
    data.organizations.find((o) => o.id === orgId),
    'organization',
  );

/** @returns The org's own words (site, participants, equipment…) for messages. */
export const termsIn = (data: DataSnapshot, orgId: string): Terms =>
  termsOf(data.organizations.find((o) => o.id === orgId));

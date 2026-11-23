/**
 * @file Org-scoped permission rules (FR-2, §2.5 "Permission rule").
 *
 * A management action is allowed only if the acting person has a Membership in the target org
 * whose role ranks at least the action's minimum (OWNER > ADMIN > COORDINATOR). The same table
 * drives both the API checks and which navigation items the UI shows, so they can never drift.
 */
import { ORG_ROLE_RANK, OrgRole } from './enums';

/** Every management capability in Onboard. */
export type Permission =
  | 'org.edit'
  | 'org.settings'
  | 'members.manage'
  | 'sites.edit'
  | 'equipment.manage'
  | 'reports.view'
  | 'volunteers.view'
  | 'volunteers.pipeline'
  | 'sessions.edit'
  | 'roster.manage'
  | 'hours.review';

/**
 * Minimum role for each capability. Coordinators run day-to-day sessions (roster, check-in,
 * hours); Admins manage the program itself; only Owners change the organization's identity.
 */
export const MIN_ROLE: Record<Permission, OrgRole> = {
  'org.edit': OrgRole.OWNER,
  'org.settings': OrgRole.ADMIN,
  'members.manage': OrgRole.ADMIN,
  'sites.edit': OrgRole.ADMIN,
  'equipment.manage': OrgRole.ADMIN,
  'reports.view': OrgRole.ADMIN,
  'volunteers.pipeline': OrgRole.ADMIN,
  'volunteers.view': OrgRole.COORDINATOR,
  'sessions.edit': OrgRole.COORDINATOR,
  'roster.manage': OrgRole.COORDINATOR,
  'hours.review': OrgRole.COORDINATOR,
};

/**
 * Whether a role satisfies a minimum role.
 * @param role - The person's role in the org (null = no membership).
 * @param min - Minimum required role.
 * @returns `true` when `role` ranks at or above `min`.
 */
export function atLeast(role: OrgRole | null | undefined, min: OrgRole): boolean {
  return !!role && ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[min];
}

/**
 * Whether a role grants a permission.
 * @param role - The person's role in the org (null = no membership).
 * @param permission - Capability to check.
 * @returns `true` if allowed.
 */
export function can(role: OrgRole | null | undefined, permission: Permission): boolean {
  return atLeast(role, MIN_ROLE[permission]);
}

/**
 * Roles an actor may appoint or change others to directly. Owners appoint Admins and
 * Coordinators; Admins appoint Coordinators; Coordinators appoint no one. Nobody is made an Owner
 * directly: an Owner offers it and the person accepts (FR-3f).
 * @param actor - The appointing person's role.
 * @returns Assignable roles, highest first.
 */
export function assignableRoles(actor: OrgRole | null | undefined): OrgRole[] {
  // Owner isn't here: becoming an Owner takes an offer the person accepts (FR-3f).
  if (actor === OrgRole.OWNER) return [OrgRole.ADMIN, OrgRole.COORDINATOR];
  if (actor === OrgRole.ADMIN) return [OrgRole.COORDINATOR];
  return [];
}

/**
 * Whether an actor may change or remove a member who currently holds `target`.
 * You may only manage people ranked strictly below you — except Owners, who manage co-owners.
 * @param actor - Acting person's role.
 * @param target - Target member's current role.
 * @returns `true` if allowed.
 */
export function canManageMember(actor: OrgRole | null | undefined, target: OrgRole): boolean {
  if (actor === OrgRole.OWNER) return true;
  return !!actor && ORG_ROLE_RANK[actor] > ORG_ROLE_RANK[target] && can(actor, 'members.manage');
}

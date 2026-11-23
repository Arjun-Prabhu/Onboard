/**
 * @file Organizations and management Memberships (FR-2, FR-3c): the org switcher, the
 * directory, creating an org (creator becomes Owner), joining as a volunteer, and appointing,
 * re-ranking or removing Owners, Admins and Coordinators.
 */
import { OrgRole, VolunteerStatus } from '@shared/enums';
import { AppError } from '@shared/errors';
import { assignableRoles, canManageMember } from '@shared/permissions';
import * as rules from '@shared/rules';
import { appointMemberSchema, newOrganizationSchema } from '@shared/schemas';
import { defaultSettings } from '@shared/terms';
import { tidySettings } from './settingsService';
import { todayIso } from '@shared/time';
import type { DataSnapshot } from '@shared/domain/snapshot';
import type {
  MemberView,
  OrgAffiliation,
  OrgDirectoryEntry,
  Organization,
  OrgVolunteer,
  User,
} from '@shared/types';
import { newStanding } from './accountService';
import { enforce, found, newId, requireOrg, roleIn, safeUser, validate } from './context';

/**
 * The person's volunteer status in an org, if any.
 * @param data - Snapshot.
 * @param orgId - Org.
 * @param userId - Person.
 * @returns Status or null.
 */
const statusIn = (data: DataSnapshot, orgId: string, userId: string) =>
  data.orgVolunteers.find((o) => o.orgId === orgId && o.userId === userId)?.status ?? null;

/**
 * The org switcher: every org the person is part of (a Membership OR an ongoing volunteer
 * standing; one-time guest sign-ups don't count, FR-3d). Managed orgs come first.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @returns Affiliations.
 */
export function myOrgs(data: DataSnapshot, me: User): OrgAffiliation[] {
  return data.organizations
    .map((org) => ({
      org,
      role: roleIn(data, org.id, me.id),
      volunteerStatus: statusIn(data, org.id, me.id),
    }))
    .filter((a) => a.role || a.volunteerStatus)
    .sort((a, b) => Number(!!b.role) - Number(!!a.role) || a.org.name.localeCompare(b.org.name));
}

/**
 * Directory of all orgs with the viewer's relationship to each.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @returns Directory entries by name.
 */
export function directory(data: DataSnapshot, me: User): OrgDirectoryEntry[] {
  return data.organizations
    .map((org) => ({
      org,
      role: roleIn(data, org.id, me.id),
      volunteerStatus: statusIn(data, org.id, me.id),
      volunteerCount: data.orgVolunteers.filter(
        (o) => o.orgId === org.id && o.status === VolunteerStatus.ACTIVE,
      ).length,
    }))
    .sort((a, b) => a.org.name.localeCompare(b.org.name));
}

/**
 * Creates an org; the creator becomes its first Owner.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param input - Raw org fields.
 * @returns The org.
 */
export function createOrg(draft: DataSnapshot, me: User, input: unknown): Organization {
  const { sector, settings, ...data } = validate(newOrganizationSchema, input);
  enforce(rules.uniqueOrgName(data.name, draft.organizations));
  const org: Organization = {
    id: newId('org'),
    ...data,
    createdAt: todayIso(),
    // Settings chosen in the wizard; their sector always matches the org's.
    settings: settings ? tidySettings({ ...settings, sector }) : defaultSettings(sector),
  };
  draft.organizations.push(org);
  draft.memberships.push({
    id: newId('mem'),
    orgId: org.id,
    userId: me.id,
    orgRole: OrgRole.OWNER,
    createdAt: todayIso(),
  });
  return org;
}

/**
 * Applies to volunteer with another org, reusing the existing profile.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org to join.
 * @returns The new APPLIED standing.
 */
export function joinAsVolunteer(draft: DataSnapshot, me: User, orgId: string): OrgVolunteer {
  found(
    draft.organizations.find((o) => o.id === orgId),
    'organization',
  );
  if (draft.orgVolunteers.some((o) => o.orgId === orgId && o.userId === me.id))
    throw new AppError('CONFLICT', 'You already volunteer with this organization.');
  const standing = newStanding(orgId, me.id, 'Self-service application');
  draft.orgVolunteers.push(standing);
  return standing;
}

/**
 * An org's management team.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @returns Members, highest rank first.
 */
export function members(data: DataSnapshot, me: User, orgId: string): MemberView[] {
  requireOrg(data, me, orgId, 'volunteers.view');
  const users = new Map(data.users.map((u) => [u.id, u]));
  return data.memberships
    .filter((m) => m.orgId === orgId && users.has(m.userId))
    .map((membership) => ({ membership, user: safeUser(users.get(membership.userId)!) }))
    .sort(
      (a, b) =>
        b.membership.orgRole.localeCompare(a.membership.orgRole) ||
        a.user.lastName.localeCompare(b.user.lastName),
    );
}

/**
 * The refusal for making someone an Owner directly: it takes an offer they accept.
 * @returns The error.
 */
const ownerNeedsOffer = () =>
  new AppError(
    'RULE_VIOLATION',
    'Becoming an Owner needs their OK: offer ownership from Team & roles, and they accept it.',
    'orgRole',
  );

/**
 * Appoints an existing person (by email) as Admin or Coordinator.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param input - Raw `{ email, orgRole }`.
 * @returns The new member.
 */
export function appoint(draft: DataSnapshot, me: User, orgId: string, input: unknown): MemberView {
  const role = requireOrg(draft, me, orgId, 'members.manage');
  const data = validate(appointMemberSchema, input);
  if (data.orgRole === OrgRole.OWNER) throw ownerNeedsOffer();
  if (!assignableRoles(role).includes(data.orgRole))
    throw new AppError(
      'FORBIDDEN',
      `As ${role === OrgRole.ADMIN ? 'an Admin' : 'a Coordinator'}, you can't appoint ${data.orgRole === OrgRole.ADMIN ? 'Admins' : 'Owners'}.`,
      'orgRole',
    );
  const person = draft.users.find((u) => u.email.toLowerCase() === data.email.toLowerCase());
  if (!person)
    throw new AppError(
      'RULE_VIOLATION',
      'No Onboard account uses that email. Ask them to apply or sign up first.',
      'email',
    );
  if (draft.memberships.some((m) => m.orgId === orgId && m.userId === person.id))
    throw new AppError(
      'CONFLICT',
      `${person.firstName} is already a member. Change their role in the list instead.`,
      'email',
    );
  const membership = {
    id: newId('mem'),
    orgId,
    userId: person.id,
    orgRole: data.orgRole,
    createdAt: todayIso(),
  };
  draft.memberships.push(membership);
  return { membership, user: safeUser(person) };
}

/**
 * Changes a member's rank. Every org keeps at least one Owner.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param membershipId - Membership to change.
 * @param newRole - Requested role.
 * @returns The updated member.
 */
export function changeRole(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  membershipId: string,
  newRole: unknown,
): MemberView {
  const role = requireOrg(draft, me, orgId, 'members.manage');
  if (!Object.values(OrgRole).includes(newRole as OrgRole))
    throw new AppError('VALIDATION', 'Choose Owner, Admin or Coordinator.', 'orgRole');
  const target = newRole as OrgRole;
  if (target === OrgRole.OWNER) throw ownerNeedsOffer();
  const m = found(
    draft.memberships.find((x) => x.id === membershipId && x.orgId === orgId),
    'member',
  );
  if (!canManageMember(role, m.orgRole) || !assignableRoles(role).includes(target))
    throw new AppError('FORBIDDEN', "Your role can't make that change.");
  enforce(
    rules.keepsAnOwner(
      draft.memberships.filter((x) => x.orgId === orgId),
      membershipId,
    ),
  );
  m.orgRole = target;
  return {
    membership: m,
    user: safeUser(
      found(
        draft.users.find((u) => u.id === m.userId),
        'person',
      ),
    ),
  };
}

/**
 * Removes a member. Anyone may step down themselves; removing others needs rank. Every org
 * keeps at least one Owner.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param membershipId - Membership to remove.
 */
export function removeMember(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  membershipId: string,
): void {
  const role = requireOrg(draft, me, orgId, 'volunteers.view');
  const m = found(
    draft.memberships.find((x) => x.id === membershipId && x.orgId === orgId),
    'member',
  );
  if (m.userId !== me.id && !canManageMember(role, m.orgRole))
    throw new AppError('FORBIDDEN', "Your role can't remove that member.");
  enforce(
    rules.keepsAnOwner(
      draft.memberships.filter((x) => x.orgId === orgId),
      membershipId,
    ),
  );
  draft.memberships = draft.memberships.filter((x) => x.id !== membershipId);
}

/**
 * Steps the signed-in person down from an org. Its last Owner can't: they offer ownership to
 * someone first (`ownershipService`), and step down when that person accepts.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @throws AppError for the last Owner.
 */
export function stepDown(draft: DataSnapshot, me: User, orgId: string): void {
  const mine = found(
    draft.memberships.find((m) => m.orgId === orgId && m.userId === me.id),
    'role here',
  );
  const lastOwner =
    mine.orgRole === OrgRole.OWNER &&
    !draft.memberships.some(
      (m) => m.orgId === orgId && m.orgRole === OrgRole.OWNER && m.id !== mine.id,
    );
  if (lastOwner)
    throw new AppError(
      'RULE_VIOLATION',
      'You’re the only Owner. Offer ownership to someone first; you step down when they accept.',
    );
  draft.memberships = draft.memberships.filter((m) => m.id !== mine.id);
}

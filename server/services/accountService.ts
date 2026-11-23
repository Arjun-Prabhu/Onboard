/**
 * @file Accounts: login checks, the public volunteer application (FR-4), the guided tour flag
 * (FR-30) and the person's own reusable profile (FR-7).
 *
 * Sign-in *sessions* (the cookie) are handled by `authRepository`; this service only decides
 * whether credentials are correct.
 */
import bcrypt from 'bcrypt';
import { VolunteerStatus } from '@shared/enums';
import { AppError } from '@shared/errors';
import * as rules from '@shared/rules';
import { loginSchema, volunteerApplicationSchema, volunteerProfileSchema } from '@shared/schemas';
import { todayIso } from '@shared/time';
import type { DataSnapshot, StoredUser } from '@shared/domain/snapshot';
import type { MyProfile, Organization, OrgVolunteer, User } from '@shared/types';
import { config } from '../config';
import { enforce, found, isContact, newId, safeUser, validate } from './context';

/** A bcrypt hash of a random string, compared against when the email is unknown. */
const DUMMY_HASH = bcrypt.hashSync('onboard-no-such-user', config.bcryptRounds);

/**
 * Checks an email + password (FR-1).
 * @param data - Snapshot.
 * @param input - Raw `{ email, password }`.
 * @returns The person.
 * @throws AppError UNAUTHORIZED with one message for both unknown email and wrong password, so
 *   accounts can't be enumerated. The unknown-email path still runs bcrypt, so the response time
 *   doesn't give it away either.
 */
export async function verifyLogin(data: DataSnapshot, input: unknown): Promise<User> {
  const { email, password } = validate(loginSchema, input);
  const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  // A guest contact has no password, so it can never sign in.
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user?.passwordHash || !ok)
    throw new AppError(
      'UNAUTHORIZED',
      'That email and password combination is not correct.',
      'password',
    );
  return safeUser(user);
}

/**
 * Creates a volunteer standing at APPLIED with its first history entry.
 * @param orgId - Org.
 * @param userId - Person.
 * @param via - What created it (shown in the history).
 * @returns The new standing.
 */
export function newStanding(orgId: string, userId: string, via: string): OrgVolunteer {
  return {
    id: newId('ov'),
    orgId,
    userId,
    status: VolunteerStatus.APPLIED,
    createdAt: todayIso(),
    requirements: [],
    statusHistory: [
      {
        id: newId('sc'),
        fromStatus: null,
        toStatus: VolunteerStatus.APPLIED,
        changedBy: via,
        changedAt: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Orgs an applicant may choose on the public form.
 * @param data - Snapshot.
 * @returns Every org, by name.
 */
export function publicOrgs(data: DataSnapshot): Organization[] {
  return [...data.organizations].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Creating an account (FR-4): the person, their reusable profile and — when they chose one — an
 * APPLIED standing at an org, in one write. Someone who already helped once as a guest with this
 * email has a contact record; the account takes it over, so their past events and hours stay
 * theirs.
 * @param draft - Draft snapshot.
 * @param input - Raw application.
 * @returns The new person.
 */
export async function apply(draft: DataSnapshot, input: unknown): Promise<User> {
  const data = validate(volunteerApplicationSchema, input);
  const orgId = data.orgId || undefined;
  if (orgId)
    found(
      draft.organizations.find((o) => o.id === orgId),
      'organization',
    );
  for (const a of data.availability) enforce(rules.endAfterStart(a.startTime, a.endTime));
  const accounts = draft.users.filter((u) => !isContact(u));
  enforce(rules.uniqueEmail(data.email, accounts)); // V-S12
  const contact = draft.users.find((u) => u.email.toLowerCase() === data.email.toLowerCase());
  const fields = {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email.toLowerCase(),
    phone: data.phone,
    zip: data.zip,
    passwordHash: await bcrypt.hash(data.password, config.bcryptRounds),
  };
  const user: StoredUser = contact
    ? Object.assign(contact, fields)
    : { id: newId('usr'), createdAt: todayIso(), tourCompleted: false, ...fields };
  if (!contact) draft.users.push(user);
  // A contact never has a profile, but guard anyway: one profile per person.
  draft.profiles = draft.profiles.filter((p) => p.userId !== user.id);
  draft.profiles.push({
    id: newId('vp'),
    userId: user.id,
    affiliation: data.affiliation,
    experienceLevel: data.experienceLevel,
    hasTransportation: data.hasTransportation,
    bio: data.bio,
    skills: data.skills,
    availability: data.availability.map((a) => ({ ...a, id: newId('av') })),
  });
  if (orgId) draft.orgVolunteers.push(newStanding(orgId, user.id, 'Public form'));
  return safeUser(user);
}

/**
 * Marks the guided tour as seen (FR-30).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @returns The updated person.
 */
export function completeTour(draft: DataSnapshot, me: User): User {
  const u = found(
    draft.users.find((x) => x.id === me.id),
    'person',
  );
  u.tourCompleted = true;
  return safeUser(u);
}

/**
 * The person's identity plus reusable volunteer profile.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @returns The profile.
 */
export function myProfile(data: DataSnapshot, me: User): MyProfile {
  const u = found(
    data.users.find((x) => x.id === me.id),
    'person',
  );
  return {
    ...safeUser(u),
    profile: found(
      data.profiles.find((p) => p.userId === me.id),
      'profile',
    ),
  };
}

/**
 * Updates the person's profile (FR-7). It is shared, so it applies to every org they serve.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param input - Raw profile.
 * @returns The updated profile.
 */
export function updateProfile(draft: DataSnapshot, me: User, input: unknown): MyProfile {
  const data = validate(volunteerProfileSchema, input);
  for (const a of data.availability) enforce(rules.endAfterStart(a.startTime, a.endTime));
  const u = found(
    draft.users.find((x) => x.id === me.id),
    'person',
  );
  Object.assign(u, {
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    zip: data.zip,
  });
  const p = found(
    draft.profiles.find((x) => x.userId === me.id),
    'profile',
  );
  Object.assign(p, {
    affiliation: data.affiliation,
    experienceLevel: data.experienceLevel,
    hasTransportation: data.hasTransportation,
    bio: data.bio,
    skills: data.skills,
    availability: data.availability.map((a) => ({ ...a, id: newId('av') })),
  });
  return myProfile(draft, me);
}

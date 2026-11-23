/**
 * @file An org's volunteers (FR-5, FR-6, FR-8): the searchable list, one volunteer's record,
 * the recruitment pipeline and each volunteer's requirements checklist.
 *
 * Standing is per org (OrgVolunteer); the profile fields come from the person's shared profile.
 */
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { ExperienceLevel, SignUpStatus, VolunteerStatus } from '@shared/enums';
import { AppError } from '@shared/errors';
import { addVolunteerSchema, completionSchema } from '@shared/schemas';
import { todayIso } from '@shared/time';
import { activeRequirements, expiryFor, outstandingText } from '@shared/domain/requirements';
import {
  buildIndexes,
  orgVolunteerViews,
  toVolunteer,
  volunteerGridRows,
} from '@shared/domain/views';
import type { DataSnapshot } from '@shared/domain/snapshot';
import type { LeaveResult, OrgVolunteer, User, Volunteer, VolunteerGridRow } from '@shared/types';
import { config } from '../config';
import { newStanding } from './accountService';
import { releaseSignUp } from './sessionService';
import { found, fullName, isContact, newId, requireOrg, validate } from './context';

/** Query parameters for the volunteer list. */
export interface VolunteerQuery {
  search?: string;
  status?: VolunteerStatus;
  skill?: string;
}

/**
 * Finds a person's standing in an org or throws NOT_FOUND.
 * @param data - Snapshot.
 * @param orgId - Org.
 * @param userId - Person.
 * @returns The standing.
 */
function standingOf(data: DataSnapshot, orgId: string, userId: string): OrgVolunteer {
  return found(
    data.orgVolunteers.find((o) => o.orgId === orgId && o.userId === userId),
    'volunteer',
  );
}

/**
 * Lists an org's volunteers with search and filters (FR-8).
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param query - Filters.
 * @returns Volunteers by last name.
 */
export function listVolunteers(
  data: DataSnapshot,
  me: User,
  orgId: string,
  query: VolunteerQuery = {},
): Volunteer[] {
  requireOrg(data, me, orgId, 'volunteers.view');
  const q = query.search?.trim().toLowerCase();
  return orgVolunteerViews(data, buildIndexes(data), orgId)
    .filter((v) => !query.status || v.status === query.status)
    .filter((v) => !query.skill || v.skills.includes(query.skill))
    .filter(
      (v) =>
        !q || `${v.firstName} ${v.lastName} ${v.email} ${v.affiliation}`.toLowerCase().includes(q),
    )
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

/**
 * Data-grid rows for an org's volunteers, with hours and attendance metrics.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @returns Grid rows.
 */
export function volunteerMetrics(data: DataSnapshot, me: User, orgId: string): VolunteerGridRow[] {
  requireOrg(data, me, orgId, 'volunteers.view');
  return volunteerGridRows(data, buildIndexes(data), orgId);
}

/**
 * One volunteer's record in an org.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param userId - Volunteer.
 * @returns The volunteer.
 */
export function getVolunteer(data: DataSnapshot, me: User, orgId: string, userId: string) {
  requireOrg(data, me, orgId, 'volunteers.view');
  standingOf(data, orgId, userId);
  return toVolunteer(buildIndexes(data), orgId, userId);
}

/**
 * Moves a volunteer through the pipeline (FR-5). ACTIVE requires every requirement on the org's checklist (FR-6).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param userId - Volunteer.
 * @param status - New status.
 * @param note - Optional note for the history.
 * @returns The updated volunteer.
 */
export function setStatus(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  userId: string,
  status: unknown,
  note?: unknown,
): Volunteer {
  requireOrg(draft, me, orgId, 'volunteers.pipeline');
  if (!Object.values(VolunteerStatus).includes(status as VolunteerStatus))
    throw new AppError('VALIDATION', 'Choose a pipeline stage.', 'status');
  if (note !== undefined && (typeof note !== 'string' || note.length > 200))
    throw new AppError('VALIDATION', 'Keep the note under 200 characters.', 'note');
  const next = status as VolunteerStatus;
  const ov = standingOf(draft, orgId, userId);
  if (ov.status !== next) {
    if (next === VolunteerStatus.ACTIVE) {
      const outstanding = outstandingText(
        toVolunteer(buildIndexes(draft), orgId, userId).requirements,
      );
      if (outstanding)
        throw new AppError(
          'RULE_VIOLATION',
          `Record ${outstanding} before marking this volunteer Ready to serve.`,
          'status',
        );
    }
    ov.statusHistory.push({
      id: newId('sc'),
      fromStatus: ov.status,
      toStatus: next,
      changedBy: fullName(me),
      changedAt: new Date().toISOString(),
      note: (note as string | undefined)?.trim() || undefined,
    });
    ov.status = next;
  }
  return toVolunteer(buildIndexes(draft), orgId, userId);
}

/**
 * Records that a volunteer completed one of the org's requirements (Phase 3). The expiry is
 * worked out from the requirement's validity, so renewing just records a newer date.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param userId - Volunteer.
 * @param requirementId - Requirement.
 * @param input - Raw `{ completedAt }`.
 * @returns The updated volunteer.
 */
export function recordCompletion(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  userId: string,
  requirementId: string,
  input: unknown,
): Volunteer {
  requireOrg(draft, me, orgId, 'volunteers.pipeline');
  const { completedAt } = validate(completionSchema, input);
  if (completedAt > todayIso())
    throw new AppError('VALIDATION', "The completion date can't be in the future.", 'completedAt');
  const requirement = found(
    draft.requirements.find((r) => r.id === requirementId && r.orgId === orgId && !r.archived),
    'requirement',
  );
  const ov = standingOf(draft, orgId, userId);
  const completion = {
    requirementId,
    completedAt,
    expiresAt: expiryFor(completedAt, requirement.validMonths),
    recordedBy: fullName(me),
  };
  const at = ov.requirements.findIndex((c) => c.requirementId === requirementId);
  if (at >= 0) ov.requirements[at] = completion;
  else ov.requirements.push(completion);
  return toVolunteer(buildIndexes(draft), orgId, userId);
}

/**
 * Removes a recorded completion (e.g. entered on the wrong person).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param userId - Volunteer.
 * @param requirementId - Requirement.
 * @returns The updated volunteer.
 */
export function clearCompletion(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  userId: string,
  requirementId: string,
): Volunteer {
  requireOrg(draft, me, orgId, 'volunteers.pipeline');
  const ov = standingOf(draft, orgId, userId);
  ov.requirements = ov.requirements.filter((c) => c.requirementId !== requirementId);
  return toVolunteer(buildIndexes(draft), orgId, userId);
}

/** Result of adding a volunteer directly. */
export interface AddVolunteerResult {
  volunteer: Volunteer;
  /** Set only when a new account was created: pass it on so they can sign in and change it. */
  tempPassword?: string;
  /** What happened, in plain words. */
  message: string;
}

/**
 * A readable temporary password that meets the password rule, e.g. "Join-k7p2xq4".
 * @returns The password.
 */
function temporaryPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(7);
  const body = [...bytes].map((b) => chars[b % chars.length]).join('');
  return `Join-${body}${(bytes[0] % 8) + 2}`;
}

/**
 * An organizer adds a volunteer directly (Volunteers → Add volunteer). Someone who already has
 * an Onboard account is simply added to this org; anyone else gets an account with a temporary
 * password the organizer passes on. "Ready to serve" is used only when the org's checklist is
 * empty; otherwise the person starts at Trained until their requirements are recorded (FR-6).
 * @param draft - Draft snapshot.
 * @param me - Signed-in organizer.
 * @param orgId - Org.
 * @param input - Raw {@link addVolunteerSchema} payload.
 * @returns The volunteer, a temporary password for new accounts, and a message.
 */
export async function addVolunteer(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  input: unknown,
): Promise<AddVolunteerResult> {
  requireOrg(draft, me, orgId, 'volunteers.pipeline');
  const data = validate(addVolunteerSchema, input);
  const email = data.email.toLowerCase();
  let user = draft.users.find((u) => u.email.toLowerCase() === email);
  let tempPassword: string | undefined;
  if (user && draft.orgVolunteers.some((o) => o.orgId === orgId && o.userId === user!.id))
    throw new AppError(
      'CONFLICT',
      `${user.firstName} ${user.lastName} already volunteers here.`,
      'email',
    );
  // New people, and guests who helped once without an account, get an account now.
  if (!user || isContact(user)) {
    tempPassword = temporaryPassword();
    const passwordHash = await bcrypt.hash(tempPassword, config.bcryptRounds);
    if (user) user.passwordHash = passwordHash;
    else {
      user = {
        id: newId('usr'),
        firstName: data.firstName,
        lastName: data.lastName,
        email,
        phone: data.phone || undefined,
        createdAt: todayIso(),
        tourCompleted: false,
        passwordHash,
      };
      draft.users.push(user);
    }
  }
  const person = user;
  if (!draft.profiles.some((p) => p.userId === person.id))
    draft.profiles.push({
      id: newId('vp'),
      userId: person.id,
      affiliation: '',
      experienceLevel: ExperienceLevel.NEW,
      hasTransportation: false,
      bio: '',
      skills: data.skills,
      availability: [],
    });
  const standing = newStanding(orgId, user.id, `Added by ${fullName(me)}`);
  draft.orgVolunteers.push(standing);

  let message = `${user.firstName} was added as a new application.`;
  if (data.status === VolunteerStatus.ACTIVE) {
    const hasChecklist = activeRequirements(draft.requirements, orgId).length > 0;
    const target = hasChecklist ? VolunteerStatus.TRAINED : VolunteerStatus.ACTIVE;
    standing.statusHistory.push({
      id: newId('sc'),
      fromStatus: standing.status,
      toStatus: target,
      changedBy: fullName(me),
      changedAt: new Date().toISOString(),
    });
    standing.status = target;
    message = hasChecklist
      ? `${user.firstName} was added as Trained. Record their checklist to make them Ready to serve.`
      : `${user.firstName} was added and is Ready to serve.`;
  }
  return {
    volunteer: toVolunteer(buildIndexes(draft), orgId, user.id),
    tempPassword,
    message,
  };
}

/**
 * Ends a person's volunteer place at an org. Their standing, pipeline history and checklist go;
 * their upcoming sign-ups there are cancelled (waitlists move up); any ownership offer to them
 * from the org is withdrawn. Their past sign-ups and hours stay, so reports and their
 * certificate stay right, and a role in the org is untouched (that's Step down).
 * @param draft - Draft snapshot.
 * @param orgId - Org.
 * @param userId - Person.
 * @returns What changed.
 */
function endStanding(draft: DataSnapshot, orgId: string, userId: string): LeaveResult {
  const standing = standingOf(draft, orgId, userId);
  const idx = buildIndexes(draft);
  const today = todayIso();
  const upcoming = draft.signUps.filter(
    (s) =>
      s.userId === userId &&
      (s.status === SignUpStatus.SIGNED_UP || s.status === SignUpStatus.WAITLISTED) &&
      idx.sessionOrg.get(s.sessionId) === orgId &&
      (idx.sessions.get(s.sessionId)?.date ?? '') >= today,
  );
  for (const su of upcoming) releaseSignUp(draft, su);
  draft.orgVolunteers = draft.orgVolunteers.filter((o) => o.id !== standing.id);
  draft.offers = draft.offers.filter((o) => !(o.orgId === orgId && o.toUserId === userId));
  return {
    cancelledSignUps: upcoming.length,
    keepsRole: draft.memberships.some((m) => m.orgId === orgId && m.userId === userId),
  };
}

/**
 * An organizer removes a volunteer from their org (see {@link endStanding}). Admins and Owners
 * may, the same people who move volunteers through the pipeline.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param userId - Volunteer to remove.
 * @returns What changed.
 */
export function removeVolunteer(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  userId: string,
): LeaveResult {
  requireOrg(draft, me, orgId, 'volunteers.pipeline');
  return endStanding(draft, orgId, userId);
}

/**
 * A volunteer leaves an org (see {@link endStanding}). They can apply again later.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @returns What changed.
 */
export function leaveOrg(draft: DataSnapshot, me: User, orgId: string): LeaveResult {
  return endStanding(draft, orgId, me.id);
}

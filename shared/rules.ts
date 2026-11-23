/**
 * @file Semantic (meaning) validation rules V-S1 … V-S14 (§1.6, §2.7 step 3).
 *
 * Each rule is a small PURE function returning a {@link RuleResult}, so it can be unit-tested
 * in isolation. The Express services call them before every write, and the domain algorithms
 * (matching, the assistant) call the same functions, so a rule is written once.
 *
 * Messages use each org's own words (its site, participant and equipment terms), so a clinic's
 * volunteer reads "patients", not "students".
 */
import { OrgRole, RangeKind, SessionType, SignUpStatus, VolunteerStatus } from './enums';
import { outstandingText } from './domain/requirements';
import {
  durationHours,
  formatTime,
  formatTimeRange,
  parseDate,
  rangesOverlap,
  toMinutes,
  todayIso,
} from './time';
import type {
  HourLog,
  Equipment,
  Membership,
  Organization,
  OrgVolunteer,
  Program,
  RequirementCheck,
  Site,
  Session,
  SignUp,
  User,
  Volunteer,
} from './types';

/** Result of a semantic rule. */
export type RuleResult = { ok: true } | { ok: false; field: string; message: string };

/** Shorthand success value. */
export const OK: RuleResult = { ok: true };

/**
 * Builds a failed rule result.
 * @param field - Field to highlight.
 * @param message - Friendly explanation.
 * @returns A failed result.
 */
function fail(field: string, message: string): RuleResult {
  return { ok: false, field, message };
}

/** Max manual hours per volunteer per day (V-S7). */
export const MAX_HOURS_PER_DAY = 12;
/** Plausible bounds for a served range (V-S11): school grades K(0)–12, ages 0–120. */
export const RANGE_BOUNDS: Record<'GRADE' | 'AGE', { min: number; max: number }> = {
  GRADE: { min: 0, max: 12 },
  AGE: { min: 0, max: 120 },
};

/**
 * V-S1 — Session end time is after start time.
 * @param startTime - `HH:mm`.
 * @param endTime - `HH:mm`.
 * @returns Rule result.
 */
export function endAfterStart(startTime: string, endTime: string): RuleResult {
  return toMinutes(endTime) > toMinutes(startTime)
    ? OK
    : fail('endTime', `End time must be after ${formatTime(startTime)}.`);
}

/**
 * V-S2 — Session date falls inside its program's date range.
 * @param date - Session date.
 * @param program - Owning program.
 * @returns Rule result.
 */
export function sessionWithinProgram(date: string, program: Program): RuleResult {
  return date >= program.startDate && date <= program.endDate
    ? OK
    : fail(
        'date',
        `Pick a date between ${program.startDate} and ${program.endDate} (the program's dates).`,
      );
}

/**
 * V-S3 — Program end date is after its start date.
 * @param startDate - Program start.
 * @param endDate - Program end.
 * @returns Rule result.
 */
export function programDatesValid(startDate: string, endDate: string): RuleResult {
  return endDate > startDate ? OK : fail('endDate', 'The program must end after it starts.');
}

/**
 * V-S4 — A person cannot be double-booked in overlapping sessions — across ALL orgs.
 * @param volunteer - The person.
 * @param target - Session being joined.
 * @param otherSessions - Other sessions the volunteer is actively signed up for, with site names.
 * @returns Rule result.
 */
export function noDoubleBooking(
  volunteer: Pick<Volunteer, 'firstName'>,
  target: Session,
  otherSessions: Array<{ session: Session; siteName: string }>,
): RuleResult {
  const clash = otherSessions.find(
    ({ session }) =>
      session.id !== target.id &&
      session.date === target.date &&
      rangesOverlap(session.startTime, session.endTime, target.startTime, target.endTime),
  );
  if (!clash) return OK;
  return fail(
    'volunteerId',
    `${volunteer.firstName} is already booked at ${clash.siteName} from ${formatTimeRange(
      clash.session.startTime,
      clash.session.endTime,
    )} that day.`,
  );
}

/**
 * Whether a session type puts the volunteer in front of participants (students, patients,
 * players…), so the org's requirements apply.
 * @param type - Session type.
 * @returns `true` for regular shifts and events; `false` for volunteer trainings.
 */
export function isParticipantFacing(type: SessionType): boolean {
  return type === SessionType.SHIFT || type === SessionType.EVENT;
}

/** How a person may join a session, decided by {@link volunteerEligible}. */
export type JoinMode = 'member' | 'guest';

/** A person's standing in one org, as the eligibility rule needs it. */
export interface StandingCheck {
  /** Pipeline status, or null with no standing (a would-be guest). */
  status: VolunteerStatus | null;
  /** The org's requirements checklist for this person. */
  requirements: RequirementCheck[];
}

/**
 * V-S5 / FR-6 / FR-3d — org-scoped eligibility.
 *
 * A person may join a regular shift or event only with ACTIVE standing IN THE ORG THAT OWNS IT
 * and every one of that org's requirements complete and current (not expired). Sessions flagged
 * `openToGuests` also accept a one-time guest sign-up from anyone without that standing (a
 * lighter check). Training sessions are open to anyone with non-inactive standing so new
 * volunteers can finish onboarding.
 * @param firstName - Person's first name (for the message).
 * @param standing - Their standing and checklist in the session's org, if any.
 * @param session - Target session.
 * @param orgName - Owning org's name (for the message).
 * @returns Rule result.
 */
export function volunteerEligible(
  firstName: string,
  standing: StandingCheck | undefined,
  session: Session,
  orgName = 'this organization',
): RuleResult {
  const status = standing?.status ?? null;
  const outstanding = standing ? outstandingText(standing.requirements) : '';
  if (status === VolunteerStatus.ACTIVE && !outstanding) return OK;
  if (session.openToGuests) return OK; // one-time guest sign-up
  if (!status)
    return fail(
      'volunteerId',
      `${firstName} isn't a registered volunteer with ${orgName} yet. Apply to volunteer there first.`,
    );
  if (status === VolunteerStatus.INACTIVE)
    return fail(
      'volunteerId',
      `${firstName} is taking a break from ${orgName}. Mark them Ready to serve first.`,
    );
  if (!isParticipantFacing(session.type)) return OK;
  if (outstanding)
    return fail(
      'volunteerId',
      `${firstName} still needs ${outstanding} at ${orgName} before joining shifts and events.`,
    );
  return fail(
    'volunteerId',
    `${firstName} isn’t Ready to serve at ${orgName} yet, so they can’t join shifts and events.`,
  );
}

/**
 * Which way a person would join a session: as a registered member volunteer or as a guest.
 * @param standing - Their standing in the session's org, if any.
 * @returns `'member'` with ACTIVE standing, otherwise `'guest'`.
 */
export function joinModeFor(standing: Pick<OrgVolunteer, 'status'> | undefined): JoinMode {
  return standing?.status === VolunteerStatus.ACTIVE ? 'member' : 'guest';
}

/**
 * V-S6 — Logged hours cannot exceed the session length or be in the future.
 * @param hours - Hours claimed.
 * @param date - Date worked.
 * @param session - Linked session, if any.
 * @param today - Today's date (injectable for tests).
 * @returns Rule result.
 */
export function hoursPlausible(
  hours: number,
  date: string,
  session?: Session,
  today = todayIso(),
): RuleResult {
  if (date > today) return fail('date', "You can't log hours for a future date.");
  if (session) {
    const max = durationHours(session.startTime, session.endTime) + 0.5; // 30-min setup/cleanup grace
    if (hours > max) {
      return fail(
        'hours',
        `That session was ${durationHours(session.startTime, session.endTime)} hours long, so you can log at most ${max} hours.`,
      );
    }
    if (session.date !== date) return fail('date', `That session was on ${session.date}.`);
  }
  return OK;
}

/**
 * V-S7 — Manual hour logs total ≤ 12 per day.
 * @param hours - New hours.
 * @param date - Date.
 * @param existing - The volunteer's existing non-rejected logs.
 * @returns Rule result.
 */
export function dailyHoursCap(hours: number, date: string, existing: HourLog[]): RuleResult {
  const already = existing
    .filter((l) => l.date === date && l.status !== 'REJECTED')
    .reduce((s, l) => s + l.hours, 0);
  return already + hours <= MAX_HOURS_PER_DAY
    ? OK
    : fail(
        'hours',
        `You already have ${already} hours on that day. The daily maximum is ${MAX_HOURS_PER_DAY}.`,
      );
}

/**
 * V-S8 — Volunteers needed meets the program's volunteer-to-participant ratio, when the program
 * has one (ratios are optional: a food pantry shift has none).
 * @param volunteersNeeded - Volunteers planned for the session.
 * @param program - Owning program.
 * @param participantTerm - The org's word for participants, e.g. "Students".
 * @returns Rule result.
 */
export function ratioMet(
  volunteersNeeded: number,
  program: Program,
  participantTerm = 'Participants',
): RuleResult {
  if (!program.targetRatio) return OK;
  const minimum = Math.ceil(program.participantCount / program.targetRatio);
  return volunteersNeeded >= minimum
    ? OK
    : fail(
        'volunteersNeeded',
        `${program.participantCount} ${participantTerm.toLowerCase()} at 1:${program.targetRatio} needs at least ${minimum} volunteers.`,
      );
}

/**
 * V-S9 — Sign-up blocked when the session is full (caller offers the waitlist instead).
 * @param signedUpCount - Current active sign-ups.
 * @param volunteersNeeded - Capacity.
 * @returns Rule result.
 */
export function hasCapacity(signedUpCount: number, volunteersNeeded: number): RuleResult {
  return signedUpCount < volunteersNeeded
    ? OK
    : fail('_form', 'This session is full. You can join the waitlist instead.');
}

/**
 * V-S10 — An equipment item cannot be checked out to two programs at once.
 * @param item - The item.
 * @param term - The org's word for an item, e.g. "Kit".
 * @returns Rule result.
 */
export function equipmentAvailable(item: Equipment, term = 'Item'): RuleResult {
  if (item.condition === 'RETIRED')
    return fail('equipmentId', `${term} ${item.assetTag} is retired.`);
  return item.programId
    ? fail('equipmentId', `${term} ${item.assetTag} is already checked out. Return it first.`)
    : OK;
}

/**
 * V-S11 — A site's served range is plausible for the org's range kind (grades K–12 or ages
 * 0–120) and the highest value is at least the lowest. Orgs that keep no range skip this.
 * @param kind - The org's range kind.
 * @param rangeMin - Lowest grade/age served.
 * @param rangeMax - Highest grade/age served.
 * @returns Rule result.
 */
export function rangeValid(
  kind: RangeKind,
  rangeMin: number | undefined,
  rangeMax: number | undefined,
): RuleResult {
  if (kind === RangeKind.NONE) return OK;
  const unit = kind === RangeKind.GRADE ? 'grade' : 'age';
  if (rangeMin === undefined) return fail('rangeMin', `Enter the lowest ${unit} served.`);
  if (rangeMax === undefined) return fail('rangeMax', `Enter the highest ${unit} served.`);
  const { min, max } = RANGE_BOUNDS[kind];
  const shown = (n: number) => (kind === RangeKind.GRADE && n === 0 ? 'K' : String(n));
  if (rangeMin < min || rangeMin > max)
    return fail('rangeMin', `The lowest ${unit} must be between ${shown(min)} and ${shown(max)}.`);
  if (rangeMax < min || rangeMax > max)
    return fail('rangeMax', `The highest ${unit} must be between ${shown(min)} and ${shown(max)}.`);
  if (rangeMax < rangeMin)
    return fail('rangeMax', `The highest ${unit} must be at least the lowest ${unit}.`);
  return OK;
}

/**
 * V-S12 — Login emails are unique across all people (case-insensitive).
 * @param email - Candidate email.
 * @param users - Existing people.
 * @param selfId - Id to ignore when editing.
 * @returns Rule result.
 */
export function uniqueEmail(
  email: string,
  users: Pick<User, 'id' | 'email'>[],
  selfId?: string,
): RuleResult {
  const taken = users.some(
    (u) => u.id !== selfId && u.email.toLowerCase() === email.trim().toLowerCase(),
  );
  return taken ? fail('email', 'An account with this email already exists. Sign in instead.') : OK;
}

/**
 * V-S12 (orgs) — Organization names are unique (case-insensitive).
 * @param name - Candidate name.
 * @param orgs - Existing organizations.
 * @returns Rule result.
 */
export function uniqueOrgName(name: string, orgs: Organization[]): RuleResult {
  const taken = orgs.some((o) => o.name.toLowerCase() === name.trim().toLowerCase());
  return taken ? fail('name', 'An organization with this name already exists.') : OK;
}

/**
 * Membership rule — an organization must always keep at least one Owner.
 * @param memberships - The org's memberships.
 * @param changingId - Membership being demoted or removed.
 * @returns Rule result.
 */
export function keepsAnOwner(memberships: Membership[], changingId: string): RuleResult {
  const owners = memberships.filter((m) => m.orgRole === OrgRole.OWNER);
  const isOwner = owners.some((m) => m.id === changingId);
  return isOwner && owners.length === 1
    ? fail('orgRole', 'Every organization needs an owner. Make someone else an owner first.')
    : OK;
}

/**
 * V-S12 — Site names are unique within an org (case-insensitive).
 * @param name - Candidate name.
 * @param sites - The org's existing sites.
 * @param term - The org's word for a site, e.g. "School".
 * @param selfId - Id to ignore when editing.
 * @returns Rule result.
 */
export function uniqueSiteName(
  name: string,
  sites: Site[],
  selfId?: string,
  term = 'Site',
): RuleResult {
  const taken = sites.some(
    (s) => s.id !== selfId && s.name.toLowerCase() === name.trim().toLowerCase(),
  );
  return taken ? fail('name', `A ${term.toLowerCase()} with this name already exists.`) : OK;
}

/**
 * V-S13 — Volunteer availability must cover the session time.
 * @param volunteer - The volunteer.
 * @param session - Target session.
 * @returns Rule result.
 */
export function availabilityCovers(
  volunteer: Pick<Volunteer, 'firstName' | 'availability'>,
  session: Session,
): RuleResult {
  const day = parseDate(session.date).getDay();
  const covers = volunteer.availability.some(
    (a) =>
      a.dayOfWeek === day &&
      toMinutes(a.startTime) <= toMinutes(session.startTime) &&
      toMinutes(a.endTime) >= toMinutes(session.endTime),
  );
  return covers
    ? OK
    : fail(
        'availability',
        `${volunteer.firstName}'s availability doesn't cover ${formatTimeRange(session.startTime, session.endTime)} on that day.`,
      );
}

/**
 * V-S14 — Cannot delete a site/program whose sessions have logged hours (archive instead).
 * @param entityLabel - "site" or "program".
 * @param loggedHourCount - Number of hour logs tied to its sessions.
 * @returns Rule result.
 */
export function canDelete(entityLabel: string, loggedHourCount: number): RuleResult {
  return loggedHourCount === 0
    ? OK
    : fail(
        '_form',
        `This ${entityLabel} has ${loggedHourCount} logged hour records, so it can't be deleted. Archive it instead.`,
      );
}

/**
 * Whether a sign-up status still occupies a seat.
 * @param s - Sign-up.
 * @returns `true` for signed-up, checked-in and completed.
 */
export function occupiesSeat(s: SignUp): boolean {
  return (
    s.status === SignUpStatus.SIGNED_UP ||
    s.status === SignUpStatus.CHECKED_IN ||
    s.status === SignUpStatus.COMPLETED
  );
}

/**
 * Runs several rules and returns the first failure, or OK.
 * @param results - Rule results in priority order.
 * @returns First failure or OK.
 */
export function firstFailure(...results: RuleResult[]): RuleResult {
  return results.find((r) => !r.ok) ?? OK;
}

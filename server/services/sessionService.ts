/**
 * @file Sessions (FR-11, FR-12, FR-25) and sign-ups (FR-13–FR-16, FR-3d).
 *
 * Sign-up rules, in order: the session must be open and in the future; the person must not
 * already be on it; they must be eligible in the session's org or the session must accept
 * guests (V-S5); their availability must cover it (V-S13); and they must not be double-booked
 * at ANY org (V-S4). A full session (V-S9) puts them on the waitlist instead of failing, and a
 * cancelled seat promotes the first person waiting for the same role (FR-14).
 */
import {
  DEFAULT_ROLE,
  HourStatus,
  ProgramType,
  SessionStatus,
  SessionType,
  SignUpStatus,
  VolunteerStatus,
} from '@shared/enums';
import { AppError } from '@shared/errors';
import { can } from '@shared/permissions';
import * as rules from '@shared/rules';
import { MAX_REPEAT_SESSIONS, repeatSchema, sessionSchema } from '@shared/schemas';
import { addDays, durationHours, formatDate, parseDate, todayIso } from '@shared/time';
import { personBookings } from '@shared/domain/matching';
import {
  buildIndexes,
  orgSessions,
  standingKey,
  toSessionView,
  toVolunteer,
} from '@shared/domain/views';
import type { DataSnapshot } from '@shared/domain/snapshot';
import type {
  Program,
  Session,
  SessionFilters,
  SessionView,
  SignUp,
  User,
  Volunteer,
} from '@shared/types';
import {
  enforce,
  found,
  newId,
  orgById,
  orgOfProgram,
  orgOfSession,
  requireOrg,
  roleIn,
  validate,
} from './context';

/** Result of a sign-up attempt — may land on the waitlist. */
export interface SignUpOutcome {
  signUp: SignUp;
  waitlisted: boolean;
  message: string;
}

/** A sign-up joined with its session. */
export type MySignUp = SignUp & { session: SessionView };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Applies list filters to session views (FR-25).
 * @param views - Sessions.
 * @param f - Filters.
 * @returns Matching sessions, soonest first.
 */
function applyFilters(views: SessionView[], f: SessionFilters): SessionView[] {
  const today = todayIso();
  const q = f.search?.trim().toLowerCase();
  return views
    .filter((s) => f.includePast || (s.date >= today && s.status === SessionStatus.SCHEDULED))
    .filter((s) => f.dayOfWeek === undefined || parseDate(s.date).getDay() === f.dayOfWeek)
    .filter((s) => !f.skill || s.requiredSkills.includes(f.skill))
    .filter((s) => !f.type || s.type === f.type)
    .filter((s) => !f.withinDays || (s.date >= today && s.date <= addDays(today, f.withinDays)))
    .filter((s) => !f.priorityOnly || s.site.priority)
    .filter((s) => !f.siteId || s.site.id === f.siteId)
    .filter((s) => !f.orgId || s.org.id === f.orgId)
    .filter((s) => !f.guestsOnly || s.openToGuests)
    .filter((s) => !f.needsVolunteersOnly || s.signedUpCount < s.volunteersNeeded)
    .filter(
      (s) =>
        !q || `${s.title} ${s.site.name} ${s.program.name} ${s.org.name}`.toLowerCase().includes(q),
    )
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

/**
 * Default event role slots (FR-12): the volunteers needed, spread evenly across the org's own
 * event roles in order (a robotics tournament gets judges and referees, a health fair
 * screeners and greeters). An org with no event roles gets general volunteer seats.
 * @param data - Snapshot.
 * @param orgId - Org.
 * @param total - Total volunteers needed.
 * @returns Role slots summing to `total`.
 */
function defaultRoleSlots(data: DataSnapshot, orgId: string, total: number) {
  const roles = orgById(data, orgId).settings.eventRoles;
  if (!roles.length) return [];
  const slots = roles.map((role) => ({ role, needed: 0 }));
  for (let i = 0; i < total; i++) slots[i % slots.length].needed++;
  return slots.filter((s) => s.needed > 0);
}

/**
 * Seats taken and available for a role (competition slots) or overall.
 * @param data - Snapshot.
 * @param session - Session.
 * @param role - Role.
 * @returns `{ taken, capacity }`.
 */
export function capacityFor(data: DataSnapshot, session: Session, role: string) {
  const seated = data.signUps.filter((s) => s.sessionId === session.id && rules.occupiesSeat(s));
  if (session.type === SessionType.EVENT && session.roleSlots.length)
    return {
      taken: seated.filter((s) => s.role === role).length,
      capacity: session.roleSlots.find((r) => r.role === role)?.needed ?? 0,
    };
  return { taken: seated.length, capacity: session.volunteersNeeded };
}

/**
 * Re-numbers a session's waitlist 1…n.
 * @param draft - Draft snapshot.
 * @param sessionId - Session.
 */
function renumberWaitlist(draft: DataSnapshot, sessionId: string): void {
  draft.signUps
    .filter((s) => s.sessionId === sessionId && s.status === SignUpStatus.WAITLISTED)
    .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))
    .forEach((s, i) => (s.waitlistPosition = i + 1));
}

/**
 * Checks the session-schema rules shared by create and update (V-S1, V-S2, V-S8).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param input - Raw session.
 * @returns The parsed session fields.
 */
function validSession(draft: DataSnapshot, me: User, input: unknown) {
  const { siteId, ...data } = validate(sessionSchema, input);
  if (!data.programId) data.programId = oneOffProgram(draft, me, siteId as string, data.date).id;
  const orgId = orgOfProgram(draft, data.programId);
  requireOrg(draft, me, orgId, 'sessions.edit');
  const program = found(
    draft.programs.find((p) => p.id === data.programId),
    'program',
  );
  const org = orgById(draft, orgId);
  enforce(
    rules.endAfterStart(data.startTime, data.endTime),
    rules.sessionWithinProgram(data.date, program),
    data.type === SessionType.TRAINING
      ? rules.OK
      : rules.ratioMet(data.volunteersNeeded, program, org.settings.participantTerm),
  );
  // Guest sign-ups are an org feature; with it off, no session is open to guests.
  return { ...data, openToGuests: org.settings.features.guests && data.openToGuests, orgId };
}

/**
 * The hidden "One-time events" program of a site, created on first use. Its dates stretch to
 * cover every one-off session, so the usual "inside the program's dates" rule always holds.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param siteId - Place of the one-time event.
 * @param date - Session date.
 * @returns The program.
 */
function oneOffProgram(draft: DataSnapshot, me: User, siteId: string, date: string): Program {
  const site = found(
    draft.sites.find((s) => s.id === siteId && !s.archived),
    'site',
  );
  requireOrg(draft, me, site.orgId, 'sessions.edit');
  let program = draft.programs.find((p) => p.siteId === siteId && p.oneOff);
  if (!program) {
    program = {
      id: newId('prg'),
      siteId,
      name: 'One-time events',
      type: ProgramType.SEASONAL,
      startDate: date,
      endDate: date,
      participantCount: 0,
      description: 'Events that happen once, like a fundraiser or a cleanup day.',
      archived: false,
      oneOff: true,
    };
    draft.programs.push(program);
  }
  if (date < program.startDate) program.startDate = date;
  if (date > program.endDate) program.endDate = date;
  program.archived = false;
  return program;
}

/**
 * Validates an event role from the request (checked against the session's slots later).
 * @param role - Raw role.
 * @returns The role, or the default "Volunteer" role when none was given.
 */
function parseRole(role: unknown): string {
  if (role === undefined || role === null || role === '') return DEFAULT_ROLE;
  if (typeof role !== 'string' || role.length > 40)
    throw new AppError('VALIDATION', 'Choose one of the listed roles.', 'role');
  return role;
}

/**
 * Joins sign-ups with their sessions, soonest first.
 * @param data - Snapshot.
 * @param signUps - Sign-ups.
 * @returns Joined rows.
 */
function withSessions(data: DataSnapshot, signUps: SignUp[]): MySignUp[] {
  const idx = buildIndexes(data);
  return signUps
    .filter((s) => idx.sessions.has(s.sessionId))
    .map((s) => ({ ...s, session: toSessionView(data, idx.sessions.get(s.sessionId)!, idx) }))
    .sort((a, b) =>
      (a.session.date + a.session.startTime).localeCompare(b.session.date + b.session.startTime),
    );
}

/**
 * The signed-in person's sign-up, or a manager acting on it.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param signUpId - Sign-up.
 * @returns The sign-up, its session and the session's org.
 */
function ownOrManaged(draft: DataSnapshot, me: User, signUpId: string) {
  const su = found(
    draft.signUps.find((s) => s.id === signUpId),
    'sign-up',
  );
  const orgId = orgOfSession(draft, su.sessionId);
  if (su.userId !== me.id) requireOrg(draft, me, orgId, 'roster.manage');
  const session = found(
    draft.sessions.find((s) => s.id === su.sessionId),
    'session',
  );
  return { su, session, orgId };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * An org's sessions for the manage views.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param filters - FR-25 filters.
 * @returns Session views.
 */
export function listSessions(
  data: DataSnapshot,
  me: User,
  orgId: string,
  filters: SessionFilters = {},
): SessionView[] {
  requireOrg(data, me, orgId, 'volunteers.view');
  const idx = buildIndexes(data);
  return applyFilters(
    orgSessions(data, idx, orgId).map((s) => toSessionView(data, s, idx)),
    filters,
  );
}

/**
 * Upcoming sessions the person may join, across every org: orgs where their standing isn't
 * Inactive, plus sessions open to one-time guests (FR-13, FR-3d).
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param filters - FR-25 filters.
 * @returns Session views.
 */
export function browseSessions(
  data: DataSnapshot,
  me: User,
  filters: SessionFilters = {},
): SessionView[] {
  const idx = buildIndexes(data);
  const leads = new Set(data.memberships.filter((m) => m.userId === me.id).map((m) => m.orgId));
  const visible = data.sessions.filter((s) => {
    const orgId = idx.sessionOrg.get(s.id) as string;
    const st = idx.standing.get(standingKey(orgId, me.id));
    if (st && st.status !== VolunteerStatus.INACTIVE) return true;
    // Guest-open sessions are for outsiders, not for people who help run the org.
    return s.openToGuests && !leads.has(orgId);
  });
  return applyFilters(
    visible.map((s) => toSessionView(data, s, idx)),
    { ...filters, includePast: false },
  );
}

/**
 * One session. Managers of its org see the full roster; anyone else sees other volunteers with
 * shortened surnames and no contact details.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param id - Session.
 * @returns The session view.
 */
export function getSession(data: DataSnapshot, me: User, id: string): SessionView {
  const idx = buildIndexes(data);
  const s = found(idx.sessions.get(id), 'session');
  const orgId = idx.sessionOrg.get(id) as string;
  const view = toSessionView(data, s, idx);
  if (can(roleIn(data, orgId, me.id), 'volunteers.view')) return view;
  return {
    ...view,
    roster: view.roster.map((r) =>
      r.userId === me.id
        ? r
        : {
            ...r,
            volunteer: {
              ...r.volunteer,
              lastName: `${r.volunteer.lastName[0] ?? ''}.`,
              email: '',
              phone: '',
            },
          },
    ),
  };
}

/**
 * Schedules a session (FR-11). Events get default role slots from the org's event roles (FR-12).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param input - Raw session.
 * @returns The session view.
 */
export function createSession(draft: DataSnapshot, me: User, input: unknown): SessionView {
  const { orgId, ...data } = validSession(draft, me, input);
  const session: Session = {
    ...data,
    id: newId('ses'),
    status: SessionStatus.SCHEDULED,
    roleSlots:
      data.type === SessionType.EVENT ? defaultRoleSlots(draft, orgId, data.volunteersNeeded) : [],
  };
  draft.sessions.push(session);
  return toSessionView(draft, session);
}

/**
 * "Repeat weekly": creates one session per chosen weekday from the first session's date up to
 * `until` (FR-11). Every date goes through the same checks as a single session, and all are
 * saved in one transaction — if any date fails, none are created.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param input - `{ session, repeat }`.
 * @returns The new sessions, soonest first.
 */
export function createRepeatingSessions(
  draft: DataSnapshot,
  me: User,
  input: unknown,
): SessionView[] {
  const body = (input ?? {}) as { session?: unknown; repeat?: unknown };
  const base = validate(sessionSchema, body.session);
  const repeat = validate(repeatSchema, body.repeat);
  if (repeat.until < base.date)
    throw new AppError('VALIDATION', 'The last date must be on or after the first date.', 'until');
  const days = new Set(repeat.weekdays);
  const dates: string[] = [];
  for (let d = base.date; d <= repeat.until; d = addDays(d, 1)) {
    if (days.has(parseDate(d).getDay())) dates.push(d);
    if (dates.length > MAX_REPEAT_SESSIONS)
      throw new AppError(
        'VALIDATION',
        `That would create more than ${MAX_REPEAT_SESSIONS} sessions. Pick an earlier last date.`,
        'until',
      );
  }
  if (!dates.length)
    throw new AppError(
      'VALIDATION',
      'None of the picked days fall in that date range.',
      'weekdays',
    );
  return dates.map((date) => {
    try {
      return createSession(draft, me, { ...base, date });
    } catch (err) {
      if (err instanceof AppError)
        throw new AppError(err.code, `${formatDate(date)}: ${err.message}`, err.field);
      throw err;
    }
  });
}

/**
 * Edits a session. It can't move to a program in another org.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param id - Session.
 * @param input - Raw session.
 * @returns The session view.
 */
export function updateSession(
  draft: DataSnapshot,
  me: User,
  id: string,
  input: unknown,
): SessionView {
  const orgId = orgOfSession(draft, id);
  requireOrg(draft, me, orgId, 'sessions.edit');
  const { orgId: target, ...data } = validSession(draft, me, input);
  if (target !== orgId)
    throw new AppError(
      'FORBIDDEN',
      'A session can only move to a program in the same organization.',
      'programId',
    );
  const s = found(
    draft.sessions.find((x) => x.id === id),
    'session',
  );
  Object.assign(s, data, {
    roleSlots:
      data.type === SessionType.EVENT
        ? s.roleSlots.length
          ? s.roleSlots
          : defaultRoleSlots(draft, orgId, data.volunteersNeeded)
        : [],
  });
  return toSessionView(draft, s);
}

/**
 * Cancels a session and every sign-up on it that hasn't been completed.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param id - Session.
 * @returns The session view.
 */
export function cancelSession(draft: DataSnapshot, me: User, id: string): SessionView {
  requireOrg(draft, me, orgOfSession(draft, id), 'sessions.edit');
  const s = found(
    draft.sessions.find((x) => x.id === id),
    'session',
  );
  s.status = SessionStatus.CANCELLED;
  for (const su of draft.signUps)
    if (su.sessionId === id && su.status !== SignUpStatus.COMPLETED) {
      su.status = SignUpStatus.CANCELLED;
      su.waitlistPosition = undefined;
    }
  return toSessionView(draft, s);
}

// ---------------------------------------------------------------------------
// Sign-ups
// ---------------------------------------------------------------------------

/**
 * Shared sign-up logic for self sign-up and manager assignment.
 * @param draft - Draft snapshot.
 * @param sessionId - Session.
 * @param userId - Person joining.
 * @param roleInput - Requested role (competitions).
 * @param selfService - True when the person signs themselves up (message wording).
 * @returns The outcome, possibly waitlisted.
 */
function doSignUp(
  draft: DataSnapshot,
  sessionId: string,
  userId: string,
  roleInput: unknown,
  selfService: boolean,
): SignUpOutcome {
  const role = parseRole(roleInput);
  const idx = buildIndexes(draft);
  const session = found(idx.sessions.get(sessionId), 'session');
  const orgId = idx.sessionOrg.get(sessionId) as string;
  found(idx.users.get(userId), 'person');
  const person = toVolunteer(idx, orgId, userId);
  if (session.status !== SessionStatus.SCHEDULED)
    throw new AppError('CONFLICT', 'This session is no longer open for sign-ups.');
  if (session.date < todayIso())
    throw new AppError('CONFLICT', 'This session has already happened.');
  if (
    draft.signUps.some(
      (s) =>
        s.sessionId === sessionId && s.userId === userId && s.status !== SignUpStatus.CANCELLED,
    )
  )
    throw new AppError(
      'CONFLICT',
      selfService
        ? 'You are already on this session.'
        : `${person.firstName} is already on this session.`,
    );
  const standing = idx.standing.get(standingKey(orgId, userId));
  const effectiveRole =
    session.type === SessionType.EVENT && session.roleSlots.length ? role : DEFAULT_ROLE;
  if (effectiveRole !== DEFAULT_ROLE && !session.roleSlots.some((r) => r.role === effectiveRole))
    throw new AppError('VALIDATION', 'This event has no slots for that role.', 'role');
  enforce(
    rules.volunteerEligible(person.firstName, person, session, idx.orgs.get(orgId)?.name), // V-S5
    rules.availabilityCovers(person, session), // V-S13
    rules.noDoubleBooking(person, session, personBookings(draft, idx, userId)), // V-S4, all orgs
  );
  const guest = rules.joinModeFor(standing) === 'guest';
  // People who help run the org don't sign up as one-time guests of it; they join as volunteers.
  if (guest && draft.memberships.some((m) => m.orgId === orgId && m.userId === userId))
    throw new AppError(
      'RULE_VIOLATION',
      selfService
        ? `You help run ${idx.orgs.get(orgId)?.name ?? 'this organization'}. To work its shifts yourself, join as a volunteer first (My organizations).`
        : `${person.firstName} helps run this organization. Ask them to join as a volunteer first.`,
    );
  const { taken, capacity } = capacityFor(draft, session, effectiveRole);
  const full = !rules.hasCapacity(taken, capacity).ok; // V-S9 → waitlist, not an error
  const position = full
    ? draft.signUps.filter((s) => s.sessionId === sessionId && s.status === SignUpStatus.WAITLISTED)
        .length + 1
    : undefined;

  // A person who cancelled earlier re-uses their row (one sign-up per person per session).
  const previous = draft.signUps.find((s) => s.sessionId === sessionId && s.userId === userId);
  const fields = {
    role: effectiveRole,
    status: full ? SignUpStatus.WAITLISTED : SignUpStatus.SIGNED_UP,
    guest,
    waitlistPosition: position,
    checkInAt: undefined,
    checkOutAt: undefined,
    createdAt: new Date().toISOString(),
  };
  const signUp: SignUp = previous
    ? Object.assign(previous, fields)
    : { id: newId('su'), sessionId, userId, ...fields };
  if (!previous) draft.signUps.push(signUp);

  const who = selfService ? 'You are' : `${person.firstName} is`;
  const asRole = effectiveRole !== DEFAULT_ROLE ? ` as ${effectiveRole}` : '';
  return {
    signUp,
    waitlisted: full,
    message: full
      ? `This session is full, so ${who.toLowerCase()} #${position} on the waitlist.`
      : `${who} signed up${asRole}${guest ? ' as a one-time guest' : ''}.`,
  };
}

/**
 * The signed-in person joins a session (as a member or one-time guest).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param sessionId - Session.
 * @param role - Requested role.
 * @returns The outcome.
 */
export function signUp(draft: DataSnapshot, me: User, sessionId: string, role?: unknown) {
  return doSignUp(draft, sessionId, me.id, role, true);
}

/**
 * A manager assigns someone to a session (FR-15).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param sessionId - Session.
 * @param userId - Person to assign.
 * @param role - Requested role.
 * @returns The outcome.
 */
export function assign(
  draft: DataSnapshot,
  me: User,
  sessionId: string,
  userId: unknown,
  role?: unknown,
): SignUpOutcome {
  requireOrg(draft, me, orgOfSession(draft, sessionId), 'roster.manage');
  if (typeof userId !== 'string' || !userId)
    throw new AppError('VALIDATION', 'Choose a volunteer.', 'userId');
  return doSignUp(draft, sessionId, userId, role, false);
}

/**
 * Cancels a sign-up. A freed seat goes to the first person waiting for the same role (FR-14).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person (the volunteer, or a manager of the session's org).
 * @param signUpId - Sign-up.
 * @returns The person promoted off the waitlist, if any.
 */
export function cancelSignUp(
  draft: DataSnapshot,
  me: User,
  signUpId: string,
): { promoted?: Volunteer } {
  const { su, orgId } = ownOrManaged(draft, me, signUpId);
  if (su.status !== SignUpStatus.SIGNED_UP && su.status !== SignUpStatus.WAITLISTED)
    throw new AppError('CONFLICT', 'Only upcoming sign-ups can be cancelled.');
  const promotedId = releaseSignUp(draft, su);
  return { promoted: promotedId ? toVolunteer(buildIndexes(draft), orgId, promotedId) : undefined };
}

/**
 * Cancels an upcoming sign-up and gives a freed seat to the first person waiting for the same
 * role (FR-14). Shared by cancelling and by a volunteer leaving or being removed.
 * @param draft - Draft snapshot.
 * @param su - A SIGNED_UP or WAITLISTED sign-up.
 * @returns The user id of the person promoted off the waitlist, if any.
 */
export function releaseSignUp(draft: DataSnapshot, su: SignUp): string | undefined {
  const heldSeat = su.status === SignUpStatus.SIGNED_UP;
  su.status = SignUpStatus.CANCELLED;
  su.waitlistPosition = undefined;
  let promoted: string | undefined;
  if (heldSeat) {
    const next = draft.signUps
      .filter(
        (s) =>
          s.sessionId === su.sessionId &&
          s.status === SignUpStatus.WAITLISTED &&
          s.role === su.role,
      )
      .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))[0];
    if (next) {
      next.status = SignUpStatus.SIGNED_UP;
      next.waitlistPosition = undefined;
      promoted = next.userId;
    }
  }
  renumberWaitlist(draft, su.sessionId);
  return promoted;
}

/**
 * Checks a volunteer in on the day (FR-16).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param signUpId - Sign-up.
 * @returns The sign-up.
 */
export function checkIn(draft: DataSnapshot, me: User, signUpId: string): SignUp {
  const { su, session } = ownOrManaged(draft, me, signUpId);
  if (su.status !== SignUpStatus.SIGNED_UP)
    throw new AppError('CONFLICT', 'Only signed-up volunteers can check in.');
  if (session.date > todayIso())
    throw new AppError('RULE_VIOLATION', 'Check-in opens on the day of the session.');
  su.status = SignUpStatus.CHECKED_IN;
  su.checkInAt = new Date().toISOString();
  return su;
}

/**
 * Checks a volunteer out and creates their PENDING hour log at the scheduled length, so an
 * early tap can't shortchange them and a leader still reviews it (FR-16, FR-18).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param signUpId - Sign-up.
 * @returns The sign-up.
 */
export function checkOut(draft: DataSnapshot, me: User, signUpId: string): SignUp {
  const { su, session, orgId } = ownOrManaged(draft, me, signUpId);
  if (su.status !== SignUpStatus.CHECKED_IN)
    throw new AppError('CONFLICT', 'Check in first, then check out.');
  su.status = SignUpStatus.COMPLETED;
  su.checkOutAt = new Date().toISOString();
  draft.hourLogs.push({
    id: newId('hl'),
    userId: su.userId,
    orgId,
    sessionId: session.id,
    date: session.date,
    hours: durationHours(session.startTime, session.endTime),
    description: session.title,
    status: HourStatus.PENDING,
    autoGenerated: true,
  });
  return su;
}

/**
 * Marks a no-show after the session (FR-16). Only managers may do this.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param signUpId - Sign-up.
 * @returns The sign-up.
 */
export function markNoShow(draft: DataSnapshot, me: User, signUpId: string): SignUp {
  const su = found(
    draft.signUps.find((s) => s.id === signUpId),
    'sign-up',
  );
  requireOrg(draft, me, orgOfSession(draft, su.sessionId), 'roster.manage');
  const session = found(
    draft.sessions.find((s) => s.id === su.sessionId),
    'session',
  );
  if (session.date > todayIso())
    throw new AppError('RULE_VIOLATION', "You can't mark a no-show before the session happens.");
  if (su.status !== SignUpStatus.SIGNED_UP)
    throw new AppError(
      'CONFLICT',
      'Only volunteers who never checked in can be marked as no-shows.',
    );
  su.status = SignUpStatus.NO_SHOW;
  return su;
}

/**
 * The signed-in person's sign-ups across every org.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @returns Sign-ups with sessions.
 */
export function mySignUps(data: DataSnapshot, me: User): MySignUp[] {
  return withSessions(
    data,
    data.signUps.filter((s) => s.userId === me.id && s.status !== SignUpStatus.CANCELLED),
  );
}

/**
 * One volunteer's sign-ups within an org (other orgs stay private).
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param userId - Volunteer.
 * @returns Sign-ups with sessions.
 */
export function signUpsForVolunteer(
  data: DataSnapshot,
  me: User,
  orgId: string,
  userId: string,
): MySignUp[] {
  requireOrg(data, me, orgId, 'volunteers.view');
  const idx = buildIndexes(data);
  return withSessions(
    data,
    data.signUps.filter(
      (s) =>
        s.userId === userId &&
        s.status !== SignUpStatus.CANCELLED &&
        idx.sessionOrg.get(s.sessionId) === orgId,
    ),
  );
}

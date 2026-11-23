/**
 * @file One-time help without an account (FR-4c): the public "Help at one event" page.
 *
 * An organization marks a session "Open to guests". Anyone can then sign up for it with a name,
 * email and phone, and no password. The person is stored as a **contact**: a `User` row with an
 * empty password hash, which can never sign in (`verifyLogin` refuses it). Organizers see them on
 * the roster like any volunteer, check them in and approve their hours. If they create an account
 * later with the same email, the account takes over the contact, so their history carries over
 * (`accountService.apply`).
 *
 * Rules: the session must be open to guests (and the org's guest feature on), scheduled and not
 * started; it must have a free spot (no waitlist, since a guest has no screen to see a promotion
 * on); the person must not already be on it or booked at an overlapping time (V-S4); and an email
 * that belongs to an account must sign in instead, so nobody can add sign-ups to someone else's
 * account.
 */
import { DEFAULT_ROLE, SessionStatus, SessionType, SignUpStatus } from '@shared/enums';
import { AppError } from '@shared/errors';
import * as rules from '@shared/rules';
import { guestSignUpSchema } from '@shared/schemas';
import { todayIso, toMinutes } from '@shared/time';
import { personBookings } from '@shared/domain/matching';
import { buildIndexes, type Indexes } from '@shared/domain/views';
import type { DataSnapshot, StoredUser } from '@shared/domain/snapshot';
import type { GuestConfirmation, GuestSession, Session } from '@shared/types';
import { enforce, found, isContact, newId, validate } from './context';
import { capacityFor } from './sessionService';

/**
 * Whether a session has already started (or happened).
 * @param s - Session.
 * @param now - The current moment.
 * @returns `true` once its start time has passed.
 */
function hasStarted(s: Session, now = new Date()): boolean {
  const today = todayIso();
  if (s.date !== today) return s.date < today;
  return toMinutes(s.startTime) <= now.getHours() * 60 + now.getMinutes();
}

/**
 * The public view of one session, or undefined when guests can't join it now.
 * @param data - Snapshot.
 * @param idx - Indexes.
 * @param s - Session.
 * @returns The guest view.
 */
function guestView(data: DataSnapshot, idx: Indexes, s: Session): GuestSession | undefined {
  const org = idx.orgs.get(idx.sessionOrg.get(s.id) ?? '');
  const site = idx.sites.get(idx.programs.get(s.programId)?.siteId ?? '');
  if (!org || !site || !s.openToGuests || !org.settings.features.guests) return undefined;
  if (s.status !== SessionStatus.SCHEDULED || hasStarted(s)) return undefined;
  const byRole = s.type === SessionType.EVENT && s.roleSlots.length > 0;
  const roles = byRole
    ? s.roleSlots.map(({ role }) => {
        const { taken, capacity } = capacityFor(data, s, role);
        return { role, spotsOpen: Math.max(0, capacity - taken) };
      })
    : [];
  const overall = capacityFor(data, s, DEFAULT_ROLE);
  const spotsOpen = byRole
    ? roles.reduce((n, r) => n + r.spotsOpen, 0)
    : Math.max(0, overall.capacity - overall.taken);
  return {
    id: s.id,
    title: s.title,
    type: s.type,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    orgName: org.name,
    orgDescription: org.description,
    siteName: site.name,
    address: site.address,
    spotsOpen,
    roles: roles.filter((r) => r.spotsOpen > 0),
  };
}

/**
 * Upcoming sessions open to guests that still have room, soonest first.
 * @param data - Snapshot.
 * @returns Public session views.
 */
export function guestSessions(data: DataSnapshot): GuestSession[] {
  const idx = buildIndexes(data);
  return data.sessions
    .map((s) => guestView(data, idx, s))
    .filter((g): g is GuestSession => !!g && g.spotsOpen > 0)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

/**
 * Signs someone up for one session without an account.
 * @param draft - Draft snapshot.
 * @param input - Raw {@link guestSignUpSchema} payload.
 * @returns What to show on the confirmation screen.
 * @throws AppError when a rule above is broken.
 */
export function guestSignUp(draft: DataSnapshot, input: unknown): GuestConfirmation {
  const data = validate(guestSignUpSchema, input);
  const idx = buildIndexes(draft);
  const session = found(idx.sessions.get(data.sessionId), 'event');
  const view = guestView(draft, idx, session);
  if (!view)
    throw new AppError(
      'RULE_VIOLATION',
      'This event isn’t taking guest sign-ups anymore. Choose another one.',
      'sessionId',
    );
  const role = view.roles.length || session.roleSlots.length ? (data.role ?? '') : DEFAULT_ROLE;
  if (role !== DEFAULT_ROLE && !view.roles.some((r) => r.role === role))
    throw new AppError('VALIDATION', 'Choose one of the roles that still has room.', 'role');
  const { taken, capacity } = capacityFor(draft, session, role);
  enforce(rules.hasCapacity(taken, capacity)); // V-S9: no waitlist for guests

  const email = data.email.toLowerCase();
  const existing = draft.users.find((u) => u.email.toLowerCase() === email);
  if (existing && !isContact(existing))
    throw new AppError(
      'CONFLICT',
      'This email already has an Onboard account. Sign in to sign up for this event.',
      'email',
    );
  const person: StoredUser = existing ?? {
    id: newId('usr'),
    firstName: data.firstName,
    lastName: data.lastName,
    email,
    phone: data.phone,
    createdAt: todayIso(),
    tourCompleted: false,
    passwordHash: '',
  };
  if (existing)
    Object.assign(existing, {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
    });
  else draft.users.push(person);

  if (
    draft.signUps.some(
      (s) =>
        s.sessionId === session.id && s.userId === person.id && s.status !== SignUpStatus.CANCELLED,
    )
  )
    throw new AppError('CONFLICT', 'You’re already signed up for this event.', 'email');
  enforce(rules.noDoubleBooking(person, session, personBookings(draft, idx, person.id))); // V-S4

  const fields = {
    role,
    status: SignUpStatus.SIGNED_UP,
    guest: true,
    waitlistPosition: undefined,
    checkInAt: undefined,
    checkOutAt: undefined,
    createdAt: new Date().toISOString(),
  };
  // Someone who cancelled earlier re-uses their row (one sign-up per person per session).
  const previous = draft.signUps.find((s) => s.sessionId === session.id && s.userId === person.id);
  if (previous) Object.assign(previous, fields);
  else draft.signUps.push({ id: newId('su'), sessionId: session.id, userId: person.id, ...fields });

  const site = idx.sites.get(idx.programs.get(session.programId)?.siteId ?? '');
  return {
    session: { ...view, spotsOpen: view.spotsOpen - 1 },
    role: role === DEFAULT_ROLE ? undefined : role,
    firstName: person.firstName,
    contactName: site?.contactName ?? '',
    contactEmail: site?.contactEmail ?? '',
  };
}

/**
 * @file Volunteer Matching engine (FR-22, §2.8).
 *
 * 1. Hard filters remove anyone who can't serve: ACTIVE + cleared IN THE SESSION'S ORG,
 *    available, and not double-booked anywhere (bookings at other orgs count too).
 * 2. A weighted 0–100 score ranks the rest.
 * 3. A priority queue returns the top K with a plain-language "why recommended".
 */
import { MATCH_WEIGHTS } from '@shared/constants';
import {
  ExperienceLevel,
  SessionStatus,
  SessionType,
  SignUpStatus,
  VolunteerStatus,
} from '@shared/enums';
import {
  availabilityCovers,
  joinModeFor,
  noDoubleBooking,
  occupiesSeat,
  volunteerEligible,
} from '@shared/rules';
import { addDays, todayIso } from '@shared/time';
import type {
  MatchFactor,
  MatchResult,
  Session,
  SessionSuggestion,
  SessionView,
  Volunteer,
} from '@shared/types';
import { MAX_REASONABLE_MILES, zipDistanceMiles } from '@shared/utils/geo';
import { PriorityQueue } from '@shared/utils/PriorityQueue';
import type { DataSnapshot } from './snapshot';
import {
  buildIndexes,
  NO_STATS,
  orgVolunteerViews,
  standingKey,
  toSessionView,
  toVolunteer,
  volunteerStats,
  type Indexes,
  type VolunteerStats,
} from './views';

export { MATCH_WEIGHTS };

/** Reliability assumed for volunteers with no history yet — optimistic but not perfect. */
const DEFAULT_RELIABILITY = 0.85;
/** Sessions in 30 days at which the fairness factor bottoms out. */
const FAIRNESS_CAP = 6;

/**
 * Every session a person currently holds a seat or waitlist spot in — across ALL orgs.
 * @param db - Database.
 * @param idx - Indexes.
 * @param userId - Person.
 * @returns Sessions with site names (for V-S4 messages).
 */
export function personBookings(
  db: DataSnapshot,
  idx: Indexes,
  userId: string,
): Array<{ session: Session; siteName: string }> {
  return db.signUps
    .filter(
      (s) =>
        s.userId === userId &&
        (s.status === SignUpStatus.SIGNED_UP ||
          s.status === SignUpStatus.CHECKED_IN ||
          s.status === SignUpStatus.WAITLISTED),
    )
    .map((s) => {
      const session = idx.sessions.get(s.sessionId) as Session;
      return {
        session,
        siteName:
          idx.sites.get(idx.programs.get(session.programId)?.siteId ?? '')?.name ?? 'another site',
      };
    });
}

/**
 * Hard filters for recommending a member volunteer (guests are never recommended).
 * @param db - Database.
 * @param idx - Indexes.
 * @param volunteer - Candidate (view in the session's org).
 * @param session - Target session.
 * @returns `true` if the volunteer may be recommended.
 */
export function passesHardFilters(
  db: DataSnapshot,
  idx: Indexes,
  volunteer: Volunteer,
  session: SessionView,
): boolean {
  const standing = idx.standing.get(standingKey(session.org.id, volunteer.id));
  if (joinModeFor(standing) !== 'member') return false;
  if (!volunteerEligible(volunteer.firstName, volunteer, { ...session, openToGuests: false }).ok)
    return false;
  if (!availabilityCovers(volunteer, session).ok) return false;
  if (session.roster.some((r) => r.userId === volunteer.id)) return false;
  return noDoubleBooking(volunteer, session, personBookings(db, idx, volunteer.id)).ok;
}

/**
 * Scores one volunteer for a session.
 * @param volunteer - Candidate (already past hard filters).
 * @param session - Target session.
 * @param stats - The candidate's attendance stats in this org.
 * @returns The ranked match with factor explanations.
 */
export function scoreVolunteer(
  volunteer: Volunteer,
  session: SessionView,
  stats: Pick<VolunteerStats, 'completed' | 'noShows' | 'recentSessions'>,
): MatchResult {
  const factors: MatchFactor[] = [];

  const have = new Set(volunteer.skills);
  const matched = session.requiredSkills.filter((s) => have.has(s));
  const skill =
    session.requiredSkills.length === 0 ? 1 : matched.length / session.requiredSkills.length;
  factors.push({
    key: 'skill',
    label: 'Skill match',
    value: skill,
    points: skill * MATCH_WEIGHTS.skill,
    explanation:
      session.requiredSkills.length === 0
        ? 'No special skills required'
        : matched.length
          ? `Has ${matched.join(' + ')}`
          : 'Missing required skills',
  });

  const total = stats.completed + stats.noShows;
  const reliability = total === 0 ? DEFAULT_RELIABILITY : stats.completed / total;
  factors.push({
    key: 'reliability',
    label: 'Reliability',
    value: reliability,
    points: reliability * MATCH_WEIGHTS.reliability,
    explanation:
      total === 0
        ? 'New — no attendance history yet'
        : `${Math.round(reliability * 100)}% attendance`,
  });

  // Proximity: linear falloff to zero at MAX_REASONABLE_MILES. Unknown ZIP → neutral 0.5.
  const miles = zipDistanceMiles(volunteer.zip, session.site.zip);
  const proximity = miles === null ? 0.5 : Math.max(0, 1 - miles / MAX_REASONABLE_MILES);
  factors.push({
    key: 'proximity',
    label: 'Proximity',
    value: proximity,
    points: proximity * MATCH_WEIGHTS.proximity,
    explanation:
      miles === null
        ? 'Distance unknown'
        : `${Math.max(1, Math.round(miles))} mi away${volunteer.hasTransportation ? '' : ' · no car'}`,
  });

  // Experience balance: pair veterans with new volunteers and vice versa.
  const levels = session.roster.filter(occupiesSeat).map((r) => r.volunteer.experienceLevel);
  const hasVeteran = levels.includes(ExperienceLevel.VETERAN);
  const onlyNew = levels.length > 0 && levels.every((l) => l === ExperienceLevel.NEW);
  let experience = 0.6;
  let expText = 'Adds to a balanced team';
  if (volunteer.experienceLevel === ExperienceLevel.VETERAN && (!hasVeteran || onlyNew))
    [experience, expText] = [1, 'Veteran — session has no veteran yet'];
  else if (volunteer.experienceLevel === ExperienceLevel.NEW && hasVeteran)
    [experience, expText] = [0.9, 'New volunteer paired with a veteran'];
  else if (volunteer.experienceLevel === ExperienceLevel.NEW)
    [experience, expText] = [0.3, 'New — no veteran on roster yet'];
  factors.push({
    key: 'experience',
    label: 'Experience balance',
    value: experience,
    points: experience * MATCH_WEIGHTS.experience,
    explanation: expText,
  });

  const fairness = Math.max(0, 1 - stats.recentSessions / FAIRNESS_CAP);
  factors.push({
    key: 'fairness',
    label: 'Fair distribution',
    value: fairness,
    points: fairness * MATCH_WEIGHTS.fairness,
    explanation: `${stats.recentSessions} session${stats.recentSessions === 1 ? '' : 's'} in last 30 days`,
  });

  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));
  const summary = factors
    .filter((f) => f.key !== 'experience' || f.value >= 0.9)
    .map((f) => f.explanation)
    .slice(0, 4)
    .join(' · ');
  return { volunteer, score, factors, summary };
}

/**
 * Ranked volunteer recommendations for a session, drawn from the session's org.
 * @param db - Database.
 * @param sessionId - Target session id.
 * @param limit - Max results (default 5).
 * @returns Top matches, best first.
 */
export function recommendForSession(db: DataSnapshot, sessionId: string, limit = 5): MatchResult[] {
  const idx = buildIndexes(db);
  const session = idx.sessions.get(sessionId);
  if (!session) return [];
  const view = toSessionView(db, session, idx);
  const today = todayIso();
  const stats = volunteerStats(db, idx, view.org.id, today, addDays(today, -30));
  const pq = new PriorityQueue<MatchResult>((a, b) => a.score - b.score);
  for (const v of orgVolunteerViews(db, idx, view.org.id)) {
    if (passesHardFilters(db, idx, v, view))
      pq.push(scoreVolunteer(v, view, stats.get(v.id) ?? NO_STATS));
  }
  return pq.takeTop(limit);
}

/**
 * "Recommended for you": best upcoming open sessions across every org the person can serve —
 * orgs where they are ACTIVE, plus sessions open to guests anywhere.
 * @param db - Database.
 * @param userId - Person.
 * @param limit - Max results.
 * @returns Suggestions, best first.
 */
export function recommendSessionsForPerson(
  db: DataSnapshot,
  userId: string,
  limit = 4,
): SessionSuggestion[] {
  const idx = buildIndexes(db);
  const today = todayIso();
  const bookings = personBookings(db, idx, userId);
  const statsByOrg = new Map<string, Map<string, VolunteerStats>>();
  const pq = new PriorityQueue<SessionSuggestion>((a, b) => a.score - b.score);
  for (const s of db.sessions) {
    if (s.status !== SessionStatus.SCHEDULED || s.date < today) continue;
    const orgId = idx.sessionOrg.get(s.id) as string;
    const standing = idx.standing.get(standingKey(orgId, userId));
    const mode = joinModeFor(standing);
    // Orientation days are for people still onboarding, not ACTIVE volunteers.
    if (s.type === SessionType.TRAINING && standing?.status === VolunteerStatus.ACTIVE) continue;
    if (mode === 'guest' && !s.openToGuests) continue;
    // People who help run an org aren't offered one-time guest spots in it.
    if (mode === 'guest' && db.memberships.some((m) => m.orgId === orgId && m.userId === userId))
      continue;
    const view = toSessionView(db, s, idx);
    if (view.signedUpCount >= view.volunteersNeeded || view.roster.some((r) => r.userId === userId))
      continue;
    const me = toVolunteer(idx, orgId, userId);
    if (
      !volunteerEligible(me.firstName, me, s).ok ||
      !availabilityCovers(me, s).ok ||
      !noDoubleBooking(me, s, bookings).ok
    )
      continue;
    if (!statsByOrg.has(orgId))
      statsByOrg.set(orgId, volunteerStats(db, idx, orgId, today, addDays(today, -30)));
    const m = scoreVolunteer(me, view, statsByOrg.get(orgId)?.get(userId) ?? NO_STATS);
    // Urgency bonus: emptier sessions float up so volunteers see where they're needed most.
    const openShare = 1 - view.signedUpCount / view.volunteersNeeded;
    pq.push({
      session: view,
      score: Math.round(m.score * 0.8 + openShare * 20),
      summary: m.factors[0].explanation,
      asGuest: mode === 'guest',
    });
  }
  return pq.takeTop(limit);
}

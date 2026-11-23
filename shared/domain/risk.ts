/**
 * @file Staffing-risk and inactivity alerts for one org (FR-24, §2.8).
 *
 * Risk blends three signals: how many seats are still open, how likely the people already
 * signed up are to no-show, and how soon the session is (less time = less chance to recruit).
 */
import {
  RiskLevel,
  SessionStatus,
  SessionType,
  SignUpStatus,
  VolunteerStatus,
} from '@shared/enums';
import { occupiesSeat } from '@shared/rules';
import { addDays, daysBetween, todayIso } from '@shared/time';
import type { InactivityAlert, SessionRisk } from '@shared/types';
import type { DataSnapshot } from './snapshot';
import {
  buildIndexes,
  orgSessions,
  orgVolunteerViews,
  toSessionView,
  volunteerStats,
} from './views';

/** Only sessions this many days out are scored. */
export const RISK_HORIZON_DAYS = 21;
/** Days without a session before an Active volunteer is flagged. */
export const INACTIVITY_DAYS = 30;
/** Score at or above which a session is High risk. */
const HIGH_THRESHOLD = 0.45;
/** Score at or above which a session is Medium risk. */
const MEDIUM_THRESHOLD = 0.2;
/** No-show rate assumed for someone with no history in this org (e.g. a guest). */
const DEFAULT_NO_SHOW = 0.1;

/**
 * Urgency multiplier — a gap 2 days out is far worse than the same gap 3 weeks out.
 * @param daysUntil - Days until the session.
 * @returns A multiplier in (0, 1].
 */
export function urgency(daysUntil: number): number {
  if (daysUntil <= 3) return 1;
  if (daysUntil <= 7) return 0.85;
  if (daysUntil <= 14) return 0.65;
  return 0.45;
}

/**
 * Scores an org's upcoming scheduled sessions, highest risk first.
 * Training days are for new volunteers, not participants, so they never count as a staffing risk.
 * @param db - Database.
 * @param orgId - Org.
 * @returns Risk entries for sessions within the horizon.
 */
export function sessionRisks(db: DataSnapshot, orgId: string): SessionRisk[] {
  const idx = buildIndexes(db);
  const today = todayIso();
  const stats = volunteerStats(db, idx, orgId, today, addDays(today, -30));
  const out: SessionRisk[] = [];
  for (const s of orgSessions(db, idx, orgId)) {
    if (
      s.type === SessionType.TRAINING ||
      s.status !== SessionStatus.SCHEDULED ||
      s.date < today ||
      s.date > addDays(today, RISK_HORIZON_DAYS)
    )
      continue;
    const view = toSessionView(db, s, idx);
    const seated = view.roster.filter(occupiesSeat);
    // Expected no-shows = sum of each signed-up person's historical no-show rate in this org.
    const expectedNoShows = seated.reduce((sum, r) => {
      const st = stats.get(r.userId);
      const total = (st?.completed ?? 0) + (st?.noShows ?? 0);
      return sum + (total === 0 ? DEFAULT_NO_SHOW : (st?.noShows ?? 0) / total);
    }, 0);
    const effectiveOpen = Math.max(0, s.volunteersNeeded - seated.length + expectedNoShows);
    const days = daysBetween(today, s.date);
    const score = Math.min(1, (effectiveOpen / s.volunteersNeeded) * urgency(days));
    const level =
      score >= HIGH_THRESHOLD
        ? RiskLevel.HIGH
        : score >= MEDIUM_THRESHOLD
          ? RiskLevel.MEDIUM
          : RiskLevel.LOW;
    const open = s.volunteersNeeded - seated.length;
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    const reason =
      open > 0
        ? `${open} of ${s.volunteersNeeded} seats open, ${when}`
        : expectedNoShows >= 0.5
          ? `Full, but ~${expectedNoShows.toFixed(1)} expected no-shows`
          : `Fully staffed, ${when}`;
    out.push({ session: view, level, score, reason });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * The org's ACTIVE volunteers with no completed or upcoming session there in 30+ days.
 * @param db - Database.
 * @param orgId - Org.
 * @returns Inactivity alerts, longest-idle first.
 */
export function inactivityAlerts(db: DataSnapshot, orgId: string): InactivityAlert[] {
  const idx = buildIndexes(db);
  const today = todayIso();
  const stats = volunteerStats(db, idx, orgId, today, addDays(today, -30));
  const hasUpcoming = new Set(
    db.signUps
      .filter(
        (su) =>
          su.status === SignUpStatus.SIGNED_UP &&
          idx.sessionOrg.get(su.sessionId) === orgId &&
          (idx.sessions.get(su.sessionId)?.date ?? '') >= today,
      )
      .map((su) => su.userId),
  );
  return orgVolunteerViews(db, idx, orgId)
    .filter((v) => v.status === VolunteerStatus.ACTIVE && !hasUpcoming.has(v.id))
    .map((v) => {
      const last = stats.get(v.id)?.lastSessionDate ?? null;
      return { volunteer: v, daysSinceLastSession: last ? daysBetween(last, today) : null };
    })
    .filter((a) => a.daysSinceLastSession === null || a.daysSinceLastSession >= INACTIVITY_DAYS)
    .sort((a, b) => (b.daysSinceLastSession ?? 999) - (a.daysSinceLastSession ?? 999));
}

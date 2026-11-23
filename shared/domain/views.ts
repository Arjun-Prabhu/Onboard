/**
 * @file Read-model helpers ("repository joins") shared by the services and the domain tests.
 *
 * Builds joined views — a person AS a volunteer of one org, sessions with their org/site and
 * roster — plus per-person statistics. Lookups use `Map`s for O(1) joins (§2.6).
 */
import { DAY_NAMES, HourStatus, SignUpStatus } from '@shared/enums';
import { occupiesSeat } from '@shared/rules';
import { activeRequirements, allCurrent, checklist, isCurrent } from './requirements';
import type {
  VolunteerGridRow,
  Organization,
  OrgVolunteer,
  Program,
  Requirement,
  Site,
  Session,
  SessionView,
  Volunteer,
  VolunteerProfile,
} from '@shared/types';
import type { DataSnapshot, StoredUser } from './snapshot';

/** Precomputed id → entity maps for fast joins. */
export interface Indexes {
  orgs: Map<string, Organization>;
  users: Map<string, StoredUser>;
  profiles: Map<string, VolunteerProfile>;
  /** Key: `${orgId}:${userId}`. */
  standing: Map<string, OrgVolunteer>;
  programs: Map<string, Program>;
  sites: Map<string, Site>;
  sessions: Map<string, Session>;
  /** Session id → owning org id (session → program → site → org). */
  sessionOrg: Map<string, string>;
  /** Org id → its active requirements, in order. */
  requirements: Map<string, Requirement[]>;
}

/**
 * Builds the standing-map key.
 * @param orgId - Org.
 * @param userId - Person.
 * @returns Composite key.
 */
export const standingKey = (orgId: string, userId: string) => `${orgId}:${userId}`;

/**
 * Builds lookup maps over the database.
 * @param db - The database.
 * @returns Id → entity maps.
 */
export function buildIndexes(db: DataSnapshot): Indexes {
  const programs = new Map(db.programs.map((p) => [p.id, p]));
  const sites = new Map(db.sites.map((s) => [s.id, s]));
  const sessionOrg = new Map<string, string>();
  for (const s of db.sessions)
    sessionOrg.set(s.id, sites.get(programs.get(s.programId)?.siteId ?? '')?.orgId ?? '');
  return {
    orgs: new Map(db.organizations.map((o) => [o.id, o])),
    users: new Map(db.users.map((u) => [u.id, u])),
    profiles: new Map(db.profiles.map((p) => [p.userId, p])),
    standing: new Map(db.orgVolunteers.map((o) => [standingKey(o.orgId, o.userId), o])),
    programs,
    sites,
    sessions: new Map(db.sessions.map((s) => [s.id, s])),
    sessionOrg,
    requirements: new Map(
      db.organizations.map((o) => [o.id, activeRequirements(db.requirements, o.id)]),
    ),
  };
}

/**
 * Joins a person into a {@link Volunteer} view for one org. `status` is null when the person has
 * no standing there (e.g. a guest on that org's roster).
 * @param idx - Indexes.
 * @param orgId - Org whose standing to use.
 * @param userId - Person.
 * @returns The volunteer view.
 */
export function toVolunteer(idx: Indexes, orgId: string, userId: string): Volunteer {
  const u = idx.users.get(userId) as StoredUser;
  const p = idx.profiles.get(userId);
  const st = idx.standing.get(standingKey(orgId, userId));
  const requirements = checklist(idx.requirements.get(orgId) ?? [], st?.requirements ?? []);
  return {
    id: u.id,
    orgId,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone ?? '',
    zip: u.zip ?? '',
    affiliation: p?.affiliation ?? '',
    hasTransportation: p?.hasTransportation ?? false,
    experienceLevel: p?.experienceLevel ?? 'NEW',
    skills: p?.skills ?? [],
    availability: p?.availability ?? [],
    bio: p?.bio,
    status: st?.status ?? null,
    statusHistory: st?.statusHistory ?? [],
    requirements,
    cleared: !!st && allCurrent(requirements),
    createdAt: st?.createdAt ?? u.createdAt,
  };
}

/**
 * Every person with volunteer standing in an org.
 * @param db - Database.
 * @param idx - Indexes.
 * @param orgId - Org.
 * @returns Volunteer views.
 */
export function orgVolunteerViews(db: DataSnapshot, idx: Indexes, orgId: string): Volunteer[] {
  return db.orgVolunteers
    .filter((o) => o.orgId === orgId)
    .map((o) => toVolunteer(idx, orgId, o.userId));
}

/**
 * Sessions owned by an org.
 * @param db - Database.
 * @param idx - Indexes.
 * @param orgId - Org.
 * @returns Sessions.
 */
export function orgSessions(db: DataSnapshot, idx: Indexes, orgId: string): Session[] {
  return db.sessions.filter((s) => idx.sessionOrg.get(s.id) === orgId);
}

/**
 * Joins a session with its org, program, site and roster.
 * @param db - The database.
 * @param session - The session.
 * @param idx - Optional prebuilt indexes.
 * @returns The joined session view.
 */
export function toSessionView(
  db: DataSnapshot,
  session: Session,
  idx: Indexes = buildIndexes(db),
): SessionView {
  const program = idx.programs.get(session.programId) as Program;
  const site = idx.sites.get(program.siteId) as Site;
  const org = idx.orgs.get(site.orgId) as Organization;
  const own = db.signUps.filter(
    (s) => s.sessionId === session.id && s.status !== SignUpStatus.CANCELLED,
  );
  return {
    ...session,
    org,
    program,
    site,
    signedUpCount: own.filter(occupiesSeat).length,
    waitlistCount: own.filter((s) => s.status === SignUpStatus.WAITLISTED).length,
    roster: own
      .map((s) => ({ ...s, volunteer: toVolunteer(idx, org.id, s.userId) }))
      .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0)),
  };
}

/** Attendance history for one person within one org. */
export interface VolunteerStats {
  completed: number;
  noShows: number;
  /** Sessions in the recent window (fair-distribution factor). */
  recentSessions: number;
  lastSessionDate: string | null;
}

/**
 * Computes attendance statistics per person, limited to one org's sessions.
 * @param db - The database.
 * @param idx - Prebuilt indexes.
 * @param orgId - Org whose sessions count.
 * @param today - Today's date.
 * @param recentFrom - Start of the "recent" window.
 * @returns Person id → stats.
 */
export function volunteerStats(
  db: DataSnapshot,
  idx: Indexes,
  orgId: string,
  today: string,
  recentFrom: string,
): Map<string, VolunteerStats> {
  const stats = new Map<string, VolunteerStats>();
  const get = (uid: string) => {
    let st = stats.get(uid);
    if (!st)
      stats.set(uid, (st = { completed: 0, noShows: 0, recentSessions: 0, lastSessionDate: null }));
    return st;
  };
  for (const su of db.signUps) {
    if (idx.sessionOrg.get(su.sessionId) !== orgId) continue;
    const s = idx.sessions.get(su.sessionId) as Session;
    const st = get(su.userId);
    if (su.status === SignUpStatus.COMPLETED) {
      st.completed++;
      if (!st.lastSessionDate || s.date > st.lastSessionDate) st.lastSessionDate = s.date;
    }
    if (su.status === SignUpStatus.NO_SHOW) st.noShows++;
    if (occupiesSeat(su) && s.date >= recentFrom && s.date <= today) st.recentSessions++;
  }
  return stats;
}

/** Empty stats for people with no history. */
export const NO_STATS: VolunteerStats = {
  completed: 0,
  noShows: 0,
  recentSessions: 0,
  lastSessionDate: null,
};

/**
 * Rows for the volunteers data grid: every volunteer standing in the org, with attendance and
 * hours metrics computed in one pass over sign-ups and hour logs (O(sign-ups + hour logs)).
 * @param db - The database.
 * @param idx - Prebuilt indexes.
 * @param orgId - Org.
 * @returns One row per volunteer.
 */
export function volunteerGridRows(
  db: DataSnapshot,
  idx: Indexes,
  orgId: string,
): VolunteerGridRow[] {
  const stats = volunteerStats(db, idx, orgId, '9999-12-31', '9999-12-31');
  const hours = new Map<string, { approved: number; pending: number }>();
  for (const h of db.hourLogs) {
    if (h.orgId !== orgId) continue;
    const t = hours.get(h.userId) ?? { approved: 0, pending: 0 };
    if (h.status === HourStatus.APPROVED) t.approved += h.hours;
    if (h.status === HourStatus.PENDING) t.pending += h.hours;
    hours.set(h.userId, t);
  }
  return orgVolunteerViews(db, idx, orgId).map((v) => {
    const st = stats.get(v.id) ?? NO_STATS;
    const attended = st.completed + st.noShows;
    const h = hours.get(v.id) ?? { approved: 0, pending: 0 };
    return {
      ...v,
      availableDays: [...new Set(v.availability.map((a) => a.dayOfWeek))]
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d]),
      requirementsDone: v.requirements.filter(isCurrent).length,
      requirementsTotal: v.requirements.length,
      sessionsCompleted: st.completed,
      noShows: st.noShows,
      attendancePct: attended ? Math.round((st.completed / attended) * 100) : null,
      approvedHours: h.approved,
      pendingHours: h.pending,
      lastSessionDate: st.lastSessionDate,
    };
  });
}

/**
 * @file Custom Report Builder aggregation (FR-26, FR-27, §2.9).
 *
 * Every metric is computed by first producing "facts" (one per hour log / sign-up / session),
 * each tagged with the group keys it belongs to, then folding them into a
 * `Record<GroupKey, Aggregate>` (§2.6). A fact may belong to several groups (e.g. a volunteer
 * with three skills), which is the correct behavior for "group by skill".
 */
import { HourStatus, SessionStatus, SignUpStatus } from '@shared/enums';
import { occupiesSeat } from '@shared/rules';
import { formatMonthKey, monthKey } from '@shared/time';
import { groupLabel, metricMeta } from '@shared/reportMeta';
import { termsOf, type Terms } from '@shared/terms';
import type {
  Program,
  ReportGroupBy,
  ReportParams,
  ReportResult,
  ReportRow,
  Site,
  Session,
  Volunteer,
} from '@shared/types';
import type { DataSnapshot } from './snapshot';
import { buildIndexes, toVolunteer, type Indexes } from './views';

/** One contribution toward a group's aggregate. */
interface Fact {
  groups: string[];
  /** For sums: the amount. For rates: numerator (0/1 or fraction). */
  value: number;
  /** For rates: denominator weight. For distinct: the distinct key. */
  weight: number;
  distinctKey?: string;
}

/** Context passed to group-key resolvers. */
interface GroupContext {
  volunteer?: Volunteer;
  session?: Session;
  program?: Program;
  site?: Site;
  date?: string;
}

/**
 * Resolves the group keys a fact belongs to.
 * @param groupBy - Dimension.
 * @param ctx - Related entities.
 * @param t - The org's terms (for the priority group names).
 * @returns Zero or more group labels.
 */
function groupKeys(groupBy: ReportGroupBy, ctx: GroupContext, t: Terms): string[] {
  switch (groupBy) {
    case 'volunteer':
      return ctx.volunteer ? [`${ctx.volunteer.firstName} ${ctx.volunteer.lastName}`] : [];
    case 'site':
      return ctx.site ? [ctx.site.name] : [];
    case 'program':
      return ctx.program ? [ctx.program.name] : [];
    case 'month':
      return ctx.date ? [monthKey(ctx.date)] : [];
    case 'skill':
      return ctx.volunteer?.skills ?? [];
    case 'priority':
      return ctx.site ? [ctx.site.priority ? `${t.priority} ${t.sites}` : `Other ${t.sites}`] : [];
  }
}

/**
 * Applies the shared filters (site, program type, volunteer status, skill).
 * @param p - Report params.
 * @param ctx - Related entities.
 * @returns `true` when the fact should be included.
 */
function passesFilters(p: ReportParams, ctx: GroupContext): boolean {
  if (p.siteId && ctx.site && ctx.site.id !== p.siteId) return false;
  if (p.programType && ctx.program && ctx.program.type !== p.programType) return false;
  if (p.volunteerStatus && ctx.volunteer && ctx.volunteer.status !== p.volunteerStatus)
    return false;
  if (p.skill && ctx.volunteer && !ctx.volunteer.skills.includes(p.skill)) return false;
  if (p.skill && !ctx.volunteer && ctx.session && !ctx.session.requiredSkills.includes(p.skill))
    return false;
  return true;
}

/**
 * Builds the session context (session → program → site).
 * @param idx - Indexes.
 * @param sessionId - Session id.
 * @returns The joined context.
 */
function sessionCtx(idx: Indexes, sessionId?: string): GroupContext {
  const session = sessionId ? idx.sessions.get(sessionId) : undefined;
  const program = session ? idx.programs.get(session.programId) : undefined;
  const site = program ? idx.sites.get(program.siteId) : undefined;
  return { session, program, site, date: session?.date };
}

/**
 * Produces facts for a metric.
 * @param db - Database.
 * @param idx - Indexes.
 * @param orgId - Org the report covers.
 * @param p - Params.
 * @returns Facts in range.
 */
function collectFacts(db: DataSnapshot, idx: Indexes, orgId: string, p: ReportParams): Fact[] {
  const t = termsOf(idx.orgs.get(orgId));
  // Everything below is limited to the one org the report is for.
  const inOrg = (sessionId?: string) => !!sessionId && idx.sessionOrg.get(sessionId) === orgId;
  const person = (userId: string) => toVolunteer(idx, orgId, userId);
  const inRange = (d?: string) => !!d && d >= p.from && d <= p.to;
  const facts: Fact[] = [];
  const push = (ctx: GroupContext, value: number, weight: number, distinctKey?: string) => {
    if (!passesFilters(p, ctx)) return;
    facts.push({ groups: groupKeys(p.groupBy, ctx, t), value, weight, distinctKey });
  };

  switch (p.metric) {
    case 'hours':
      for (const h of db.hourLogs.filter((x) => x.orgId === orgId)) {
        if (h.status !== HourStatus.APPROVED || !inRange(h.date)) continue;
        const ctx = {
          ...sessionCtx(idx, h.sessionId),
          volunteer: person(h.userId),
          date: h.date,
        };
        // Manual logs have no session; still count them, grouped as "Outreach / other".
        if (
          !ctx.site &&
          (p.groupBy === 'site' || p.groupBy === 'program' || p.groupBy === 'priority')
        ) {
          if (passesFilters(p, ctx))
            facts.push({ groups: ['Outreach / other'], value: h.hours, weight: 1 });
          continue;
        }
        push(ctx, h.hours, 1);
      }
      break;
    case 'staffedPct':
      for (const s of db.sessions.filter((x) => inOrg(x.id))) {
        if (s.status === SessionStatus.CANCELLED || !inRange(s.date)) continue;
        const seated = db.signUps.filter((su) => su.sessionId === s.id && occupiesSeat(su)).length;
        push(sessionCtx(idx, s.id), seated >= s.volunteersNeeded ? 1 : 0, 1);
      }
      break;
    case 'attendanceRate':
    case 'noShowRate':
      for (const su of db.signUps.filter((x) => inOrg(x.sessionId))) {
        if (su.status !== SignUpStatus.COMPLETED && su.status !== SignUpStatus.NO_SHOW) continue;
        const ctx = {
          ...sessionCtx(idx, su.sessionId),
          volunteer: person(su.userId),
        };
        if (!inRange(ctx.date)) continue;
        const attended = su.status === SignUpStatus.COMPLETED ? 1 : 0;
        push(ctx, p.metric === 'attendanceRate' ? attended : 1 - attended, 1);
      }
      break;
    case 'activeVolunteers':
      for (const su of db.signUps.filter((x) => inOrg(x.sessionId))) {
        if (su.status !== SignUpStatus.COMPLETED) continue;
        const ctx = {
          ...sessionCtx(idx, su.sessionId),
          volunteer: person(su.userId),
        };
        if (!inRange(ctx.date)) continue;
        push(ctx, 1, 1, su.userId);
      }
      break;
    case 'newRecruits':
      for (const ov of db.orgVolunteers.filter((x) => x.orgId === orgId)) {
        if (!inRange(ov.createdAt)) continue;
        push({ volunteer: person(ov.userId), date: ov.createdAt }, 1, 1, ov.userId);
      }
      break;
    case 'equipmentInUse':
      for (const k of db.equipment.filter((x) => x.orgId === orgId)) {
        if (!k.programId) continue;
        const program = idx.programs.get(k.programId);
        const site = program ? idx.sites.get(program.siteId) : undefined;
        push({ program, site }, 1, 1);
      }
      break;
  }
  return facts;
}

/**
 * Runs a report.
 * @param db - Database.
 * @param orgId - Org the report covers.
 * @param p - Report parameters.
 * @returns Aggregated rows plus a total, ready for table + chart.
 */
export function runReport(db: DataSnapshot, orgId: string, p: ReportParams): ReportResult {
  const idx = buildIndexes(db);
  const t = termsOf(idx.orgs.get(orgId));
  const meta = metricMeta(p.metric, t);
  const facts = collectFacts(db, idx, orgId, p);
  const agg: Record<
    string,
    { value: number; weight: number; distinct: Set<string>; count: number }
  > = {};
  for (const f of facts) {
    for (const g of f.groups) {
      const a = (agg[g] ??= { value: 0, weight: 0, distinct: new Set(), count: 0 });
      a.value += f.value;
      a.weight += f.weight;
      a.count++;
      if (f.distinctKey) a.distinct.add(f.distinctKey);
    }
  }
  const finalize = (a: { value: number; weight: number; distinct: Set<string> }) =>
    meta.kind === 'rate'
      ? a.weight
        ? (a.value / a.weight) * 100
        : 0
      : meta.kind === 'distinct'
        ? a.distinct.size
        : a.value;

  let rows: ReportRow[] = Object.entries(agg).map(([group, a]) => ({
    group: p.groupBy === 'month' ? formatMonthKey(group) : group,
    value: Math.round(finalize(a) * 10) / 10,
    count: a.count,
    sortKey: group,
  })) as Array<ReportRow & { sortKey: string }>;
  rows =
    p.groupBy === 'month'
      ? (rows as Array<ReportRow & { sortKey: string }>)
          .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
          .map(({ group, value, count }) => ({ group, value, count }))
      : rows
          .sort((a, b) => b.value - a.value)
          .map(({ group, value, count }) => ({ group, value, count }));

  // Totals: sums add up; rates are recomputed over all facts (not an average of averages).
  const allWeight = facts.reduce((s, f) => s + f.weight, 0);
  const total =
    meta.kind === 'rate'
      ? allWeight
        ? Math.round((facts.reduce((s, f) => s + f.value, 0) / allWeight) * 1000) / 10
        : 0
      : meta.kind === 'distinct'
        ? new Set(facts.map((f) => f.distinctKey)).size
        : Math.round(facts.reduce((s, f) => s + f.value, 0) * 10) / 10;

  return {
    title: `${meta.label} by ${groupLabel(p.groupBy, t).toLowerCase()}`,
    orgName: idx.orgs.get(orgId)?.name ?? '',
    params: p,
    rows,
    total,
    unit: meta.unit,
    generatedAt: new Date().toISOString(),
  };
}

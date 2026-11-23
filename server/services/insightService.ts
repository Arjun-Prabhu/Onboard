/**
 * @file The smart features and small per-person settings: matching (FR-22), staffing risk and
 * inactivity alerts (FR-24), reports (FR-26/27), the dashboard, the help assistant (FR-23),
 * saved filter presets (FR-25) and the skill catalog.
 *
 * The algorithms live in `shared/domain` and run unchanged on the server snapshot. This file adds
 * authorization and input checks around them.
 */
import {
  HourStatus,
  ProgramType,
  SessionStatus,
  SessionType,
  VolunteerStatus,
} from '@shared/enums';
import { AppError } from '@shared/errors';
import { needsRenewal } from '@shared/domain/requirements';
import { addDays, todayIso } from '@shared/time';
import { answer } from '@shared/domain/assistant';
import { recommendForSession, recommendSessionsForPerson } from '@shared/domain/matching';
import { runReport } from '@shared/domain/reports';
import { inactivityAlerts, sessionRisks } from '@shared/domain/risk';
import { buildIndexes, orgSessions, orgVolunteerViews, toSessionView } from '@shared/domain/views';
import type { DataSnapshot } from '@shared/domain/snapshot';
import type {
  AdminDashboardStats,
  FilterPreset,
  ReportMetric,
  ReportParams,
  SessionFilters,
  User,
} from '@shared/types';
import { z } from 'zod';
import { METRIC_GROUPS } from '@shared/reportMeta';
import { newId, orgOfSession, requireOrg, roleIn, validate } from './context';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');

/** Report-builder parameters (FR-26). The group-by must suit the metric (checked separately). */
const reportParamsSchema = z.object({
  metric: z.enum(Object.keys(METRIC_GROUPS) as [ReportMetric, ...ReportMetric[]]),
  groupBy: z.enum(['volunteer', 'site', 'program', 'month', 'skill', 'priority']),
  from: isoDate,
  to: isoDate,
  siteId: z.string().optional(),
  programType: z.enum(ProgramType).optional(),
  volunteerStatus: z.enum(VolunteerStatus).optional(),
  skill: z.string().max(60).optional(),
  chartType: z.enum(['bar', 'line', 'pie']),
});

/** Largest number of recommendations one request may ask for. */
const MAX_LIMIT = 50;

/**
 * Clamps an optional `limit` query value.
 * @param limit - Raw limit.
 * @returns A limit between 1 and {@link MAX_LIMIT}, or undefined for the default.
 */
const clampLimit = (limit?: number) =>
  limit === undefined || Number.isNaN(limit)
    ? undefined
    : Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));

/**
 * Ranked volunteers for a session, with the reason for each score (FR-22).
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param sessionId - Session.
 * @param limit - How many.
 * @returns Match results.
 */
export function recommend(data: DataSnapshot, me: User, sessionId: string, limit?: number) {
  requireOrg(data, me, orgOfSession(data, sessionId), 'roster.manage');
  return recommendForSession(data, sessionId, clampLimit(limit));
}

/**
 * "Recommended for you": sessions across orgs that fit the signed-in person.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param limit - How many.
 * @returns Session suggestions.
 */
export function recommendForMe(data: DataSnapshot, me: User, limit?: number) {
  return recommendSessionsForPerson(data, me.id, clampLimit(limit));
}

/**
 * Upcoming sessions at risk of being understaffed (FR-24).
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @returns Risks, most urgent first.
 */
export function staffingRisks(data: DataSnapshot, me: User, orgId: string) {
  requireOrg(data, me, orgId, 'roster.manage');
  return sessionRisks(data, orgId);
}

/**
 * Active volunteers who haven't served recently (FR-24).
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @returns Alerts.
 */
export function inactivity(data: DataSnapshot, me: User, orgId: string) {
  requireOrg(data, me, orgId, 'volunteers.view');
  return inactivityAlerts(data, orgId);
}

/**
 * Runs a report for an org and date range (FR-26).
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param params - Raw report parameters.
 * @returns The report.
 */
export function report(data: DataSnapshot, me: User, orgId: string, params: unknown) {
  requireOrg(data, me, orgId, 'reports.view');
  const p = validate(reportParamsSchema, params) as ReportParams;
  if (p.to < p.from)
    throw new AppError('VALIDATION', 'The end date must be on or after the start date.', 'to');
  if (!METRIC_GROUPS[p.metric].includes(p.groupBy))
    throw new AppError('VALIDATION', "That grouping isn't available for this measure.", 'groupBy');
  return runReport(data, orgId, p);
}

/**
 * Headline numbers for an org's dashboard.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @returns Dashboard stats.
 */
export function dashboard(data: DataSnapshot, me: User, orgId: string): AdminDashboardStats {
  requireOrg(data, me, orgId, 'volunteers.view');
  const today = todayIso();
  const idx = buildIndexes(data);
  const upcoming = orgSessions(data, idx, orgId).filter(
    (s) =>
      s.status === SessionStatus.SCHEDULED &&
      s.type !== SessionType.TRAINING &&
      s.date >= today &&
      s.date <= addDays(today, 14),
  );
  const staffed = upcoming.filter(
    (s) => toSessionView(data, s, idx).signedUpCount >= s.volunteersNeeded,
  ).length;
  const standing = data.orgVolunteers.filter((o) => o.orgId === orgId);
  const hours = data.hourLogs.filter((h) => h.orgId === orgId);
  return {
    activeVolunteers: standing.filter((o) => o.status === VolunteerStatus.ACTIVE).length,
    applicantsInPipeline: standing.filter(
      (o) =>
        o.status === VolunteerStatus.APPLIED ||
        o.status === VolunteerStatus.INTERVIEWED ||
        o.status === VolunteerStatus.TRAINED,
    ).length,
    upcomingSessions: upcoming.length,
    pendingHourLogs: hours.filter((h) => h.status === HourStatus.PENDING).length,
    hoursThisMonth: hours
      .filter((h) => h.status === HourStatus.APPROVED && h.date.startsWith(today.slice(0, 7)))
      .reduce((s, h) => s + h.hours, 0),
    staffedPct: upcoming.length ? Math.round((staffed / upcoming.length) * 100) : 100,
    requirementsDue: orgVolunteerViews(data, idx, orgId).filter(
      (v) => v.status !== VolunteerStatus.INACTIVE && needsRenewal(v.requirements),
    ).length,
  };
}

/**
 * Answers a help question (FR-23). `orgId` only counts if the person manages that org.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param question - Question text.
 * @param orgId - Org being managed, if any.
 * @returns The reply.
 */
export function ask(data: DataSnapshot, me: User, question: unknown, orgId: unknown) {
  if (typeof question !== 'string' || !question.trim())
    throw new AppError('VALIDATION', 'Type a question first.', 'question');
  if (question.length > 300)
    throw new AppError('VALIDATION', 'Please keep questions under 300 characters.', 'question');
  const org = typeof orgId === 'string' ? orgId : null;
  const role = org ? roleIn(data, org, me.id) : null;
  return answer(
    data,
    {
      user: me,
      orgId: role ? org : null,
      role,
      managesAnyOrg: data.memberships.some((m) => m.userId === me.id),
    },
    question,
  );
}

/**
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @returns The person's saved filter presets.
 */
export function listPresets(data: DataSnapshot, me: User): FilterPreset[] {
  return data.presets.filter((p) => p.userId === me.id);
}

/**
 * Saves a filter preset (FR-25).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param name - Preset name.
 * @param filters - Filters to save.
 * @returns The preset.
 */
export function savePreset(
  draft: DataSnapshot,
  me: User,
  name: unknown,
  filters: unknown,
): FilterPreset {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new AppError('VALIDATION', 'Give the preset a name.', 'name');
  if (trimmed.length > 50)
    throw new AppError('VALIDATION', 'Preset names must be 50 characters or fewer.', 'name');
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters))
    throw new AppError('VALIDATION', 'Choose some filters to save.', 'filters');
  if (JSON.stringify(filters).length > 2000)
    throw new AppError('VALIDATION', 'Those filters are too large to save.', 'filters');
  const preset: FilterPreset = {
    id: newId('fp'),
    userId: me.id,
    name: trimmed,
    filters: filters as SessionFilters,
  };
  draft.presets.push(preset);
  return preset;
}

/**
 * Deletes one of the person's presets.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param id - Preset.
 */
export function removePreset(draft: DataSnapshot, me: User, id: string): void {
  draft.presets = draft.presets.filter((p) => !(p.id === id && p.userId === me.id));
}

/**
 * Every skill any organization lists, for the person-level profile form (a profile is shared
 * across all the orgs someone serves).
 * @param data - Snapshot.
 * @returns Distinct skill names, A–Z.
 */
export const skills = (data: DataSnapshot): string[] =>
  [...new Set(data.organizations.flatMap((o) => o.settings.skills))].sort((a, b) =>
    a.localeCompare(b),
  );

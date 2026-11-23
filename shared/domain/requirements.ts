/**
 * @file Requirements checklist (Phase 3): what each org asks volunteers to complete before they
 * serve shifts and events, and where one volunteer stands on each item.
 *
 * Every org defines its own list (robotics: volunteer training + background check; a clinic: HIPAA
 * training + TB test; a sports league: concussion course + SafeSport). A completion can expire,
 * so the state is computed against today's date each time it is read, never stored.
 */
import { EXPIRING_WITHIN_DAYS, RequirementState } from '@shared/enums';
import { addDays, parseDate, toIsoDate, todayIso } from '@shared/time';
import type { Requirement, RequirementCheck, RequirementCompletion } from '@shared/types';

/**
 * An org's active requirements in display order.
 * @param all - Every requirement (any org).
 * @param orgId - Org.
 * @returns Active requirements of that org, sorted by position.
 */
export function activeRequirements(all: readonly Requirement[], orgId: string): Requirement[] {
  return all
    .filter((r) => r.orgId === orgId && !r.archived)
    .sort((a, b) => a.position - b.position);
}

/**
 * The date a completion lapses.
 * @param completedAt - Completion date (`YYYY-MM-DD`).
 * @param validMonths - Months it stays valid; undefined = never expires.
 * @returns Expiry date, or undefined when it never expires.
 */
export function expiryFor(
  completedAt: string,
  validMonths: number | undefined,
): string | undefined {
  if (!validMonths) return undefined;
  const d = parseDate(completedAt);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + validMonths);
  // Clamp to the last day of the target month (Jan 31 + 1 month = Feb 28/29).
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toIsoDate(d);
}

/**
 * Where one completion stands today.
 * @param completion - The recorded completion, if any.
 * @param today - Today's date (`YYYY-MM-DD`).
 * @returns COMPLETE, EXPIRING (lapses within 30 days), EXPIRED or MISSING.
 */
export function stateOf(
  completion: RequirementCompletion | undefined,
  today: string = todayIso(),
): RequirementState {
  if (!completion) return RequirementState.MISSING;
  if (!completion.expiresAt) return RequirementState.COMPLETE;
  if (completion.expiresAt < today) return RequirementState.EXPIRED;
  if (completion.expiresAt <= addDays(today, EXPIRING_WITHIN_DAYS))
    return RequirementState.EXPIRING;
  return RequirementState.COMPLETE;
}

/**
 * Builds a volunteer's checklist: every active requirement with their standing on it.
 * @param requirements - The org's active requirements, in order.
 * @param completions - The volunteer's recorded completions.
 * @param today - Today's date.
 * @returns One check per requirement.
 */
export function checklist(
  requirements: readonly Requirement[],
  completions: readonly RequirementCompletion[],
  today: string = todayIso(),
): RequirementCheck[] {
  const byId = new Map(completions.map((c) => [c.requirementId, c]));
  return requirements.map((requirement) => {
    const c = byId.get(requirement.id);
    return {
      requirement,
      state: stateOf(c, today),
      completedAt: c?.completedAt,
      expiresAt: c?.expiresAt,
      recordedBy: c?.recordedBy,
    };
  });
}

/**
 * Whether a check counts as current (complete, or complete but expiring soon).
 * @param check - One checklist row.
 * @returns `true` when the volunteer may serve on it.
 */
export const isCurrent = (check: RequirementCheck): boolean =>
  check.state === RequirementState.COMPLETE || check.state === RequirementState.EXPIRING;

/**
 * Whether a checklist is fully current.
 * @param checks - Checklist.
 * @returns `true` when every requirement is complete and not expired.
 */
export const allCurrent = (checks: readonly RequirementCheck[]): boolean => checks.every(isCurrent);

/**
 * Whether a checklist needs attention soon: something expiring or already expired.
 * @param checks - Checklist.
 * @returns `true` when any item is EXPIRING or EXPIRED.
 */
export const needsRenewal = (checks: readonly RequirementCheck[]): boolean =>
  checks.some((c) => c.state === RequirementState.EXPIRING || c.state === RequirementState.EXPIRED);

/**
 * Plain-language list of what is missing or expired, e.g. "Background check (expired) and TB test".
 * @param checks - Checklist.
 * @returns Readable list, or an empty string when everything is current.
 */
export function outstandingText(checks: readonly RequirementCheck[]): string {
  const items = checks
    .filter((c) => !isCurrent(c))
    .map((c) =>
      c.state === RequirementState.EXPIRED ? `${c.requirement.name} (expired)` : c.requirement.name,
    );
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

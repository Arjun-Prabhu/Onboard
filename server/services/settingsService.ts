/**
 * @file Organization settings and requirements (Phases 2 and 3).
 *
 * Settings decide how Onboard talks to an org: its sector, the words it uses for sites,
 * participants and equipment, whether sites keep a grade or age range, which optional features
 * are on, its skill catalog and its event roles. Requirements are the checklist a volunteer must
 * complete before serving shifts and events. Both need Admin rank or higher (`org.settings`);
 * reading them is open to anyone signed in, because forms and the apply page need the words.
 */
import { AppError } from '@shared/errors';
import { orgSettingsSchema, requirementSchema } from '@shared/schemas';
import { activeRequirements } from '@shared/domain/requirements';
import type { DataSnapshot } from '@shared/domain/snapshot';
import type { Organization, OrgSettings, Requirement, User } from '@shared/types';
import { found, newId, orgById, requireOrg, validate } from './context';

/**
 * Keeps only descriptions of skills still on the list, and drops blank ones.
 * @param parsed - Validated settings.
 * @returns Settings ready to store.
 */
export function tidySettings(parsed: OrgSettings): OrgSettings {
  return {
    ...parsed,
    skillNotes: Object.fromEntries(
      Object.entries(parsed.skillNotes).filter(([k, v]) => v && parsed.skills.includes(k)),
    ),
  };
}

/**
 * Replaces an org's settings.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param input - Raw {@link OrgSettings}.
 * @returns The updated org.
 */
export function updateSettings(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  input: unknown,
): Organization {
  requireOrg(draft, me, orgId, 'org.settings');
  const settings = tidySettings(validate(orgSettingsSchema, input));
  const org = orgById(draft, orgId);
  org.settings = settings;
  // Guest sign-ups off: no session of this org may stay open to guests.
  if (!settings.features.guests) {
    const programIds = new Set(
      draft.programs
        .filter((p) => draft.sites.some((s) => s.id === p.siteId && s.orgId === orgId))
        .map((p) => p.id),
    );
    for (const s of draft.sessions) if (programIds.has(s.programId)) s.openToGuests = false;
  }
  return org;
}

/**
 * An org's active requirements, in order.
 * @param data - Snapshot.
 * @param orgId - Org.
 * @returns Requirements.
 */
export function listRequirements(data: DataSnapshot, orgId: string): Requirement[] {
  orgById(data, orgId);
  return activeRequirements(data.requirements, orgId);
}

/**
 * Adds a requirement at the end of the list.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param input - Raw requirement fields.
 * @returns The new requirement.
 */
export function createRequirement(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  input: unknown,
): Requirement {
  requireOrg(draft, me, orgId, 'org.settings');
  const data = validate(requirementSchema, input);
  assertUniqueName(draft, orgId, data.name);
  const position =
    Math.max(-1, ...draft.requirements.filter((r) => r.orgId === orgId).map((r) => r.position)) + 1;
  const requirement: Requirement = {
    id: newId('req'),
    orgId,
    ...data,
    description: data.description ?? '',
    position,
    archived: false,
  };
  draft.requirements.push(requirement);
  return requirement;
}

/**
 * Edits a requirement's name, description or validity. Existing completions keep the expiry
 * they were recorded with; the new validity applies to completions recorded from now on.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param requirementId - Requirement.
 * @param input - Raw requirement fields.
 * @returns The updated requirement.
 */
export function updateRequirement(
  draft: DataSnapshot,
  me: User,
  requirementId: string,
  input: unknown,
): Requirement {
  const requirement = findRequirement(draft, requirementId);
  requireOrg(draft, me, requirement.orgId, 'org.settings');
  const data = validate(requirementSchema, input);
  assertUniqueName(draft, requirement.orgId, data.name, requirement.id);
  requirement.name = data.name;
  requirement.description = data.description;
  requirement.validMonths = data.validMonths;
  return requirement;
}

/**
 * Archives a requirement: it leaves every checklist and stops gating sign-ups, but recorded
 * completions are kept for the record.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param requirementId - Requirement.
 */
export function archiveRequirement(draft: DataSnapshot, me: User, requirementId: string): void {
  const requirement = findRequirement(draft, requirementId);
  requireOrg(draft, me, requirement.orgId, 'org.settings');
  requirement.archived = true;
}

/**
 * Moves a requirement one place up or down the list.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param requirementId - Requirement.
 * @param direction - `-1` for up, `1` for down.
 * @returns The org's requirements in their new order.
 */
export function moveRequirement(
  draft: DataSnapshot,
  me: User,
  requirementId: string,
  direction: unknown,
): Requirement[] {
  const requirement = findRequirement(draft, requirementId);
  requireOrg(draft, me, requirement.orgId, 'org.settings');
  if (direction !== -1 && direction !== 1)
    throw new AppError('VALIDATION', 'Move up (-1) or down (1).', 'direction');
  const list = activeRequirements(draft.requirements, requirement.orgId);
  const from = list.indexOf(requirement);
  const to = from + direction;
  if (to >= 0 && to < list.length) {
    [list[from], list[to]] = [list[to], list[from]];
    list.forEach((r, i) => (r.position = i));
  }
  return list;
}

/**
 * Finds an active requirement or throws NOT_FOUND.
 * @param data - Snapshot.
 * @param requirementId - Requirement id.
 * @returns The requirement.
 */
function findRequirement(data: DataSnapshot, requirementId: string): Requirement {
  return found(
    data.requirements.find((r) => r.id === requirementId && !r.archived),
    'requirement',
  );
}

/**
 * Requirement names are unique within an org (case-insensitive), like site names (V-S12).
 * @param data - Snapshot.
 * @param orgId - Org.
 * @param name - Candidate name.
 * @param selfId - Requirement being edited, if any.
 */
function assertUniqueName(data: DataSnapshot, orgId: string, name: string, selfId?: string): void {
  const taken = data.requirements.some(
    (r) =>
      r.orgId === orgId &&
      !r.archived &&
      r.id !== selfId &&
      r.name.toLowerCase() === name.trim().toLowerCase(),
  );
  if (taken)
    throw new AppError('CONFLICT', 'A requirement with this name already exists.', 'name', {
      name: 'A requirement with this name already exists.',
    });
}

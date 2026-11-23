/**
 * @file An org's catalog: sites (FR-9), programs (FR-10) and equipment (V-S10).
 *
 * A program's org is its site's org, so moving a program to a site in another org is
 * refused. Deleting a site or program with logged hours is refused (V-S14, archive instead).
 */
import { RangeKind } from '@shared/enums';
import { AppError } from '@shared/errors';
import * as rules from '@shared/rules';
import { equipmentSchema, programSchema, siteSchema } from '@shared/schemas';
import { todayIso } from '@shared/time';
import type { DataSnapshot } from '@shared/domain/snapshot';
import type { Equipment, Program, Site, User } from '@shared/types';
import {
  enforce,
  found,
  newId,
  orgById,
  orgOfProgram,
  orgOfSite,
  requireOrg,
  termsIn,
  validate,
} from './context';

/**
 * Counts hour logs attached to sessions of the given programs (V-S14).
 * @param data - Snapshot.
 * @param programIds - Programs.
 * @returns Number of hour logs.
 */
function loggedHoursFor(data: DataSnapshot, programIds: string[]): number {
  const ids = new Set(programIds);
  const sessionIds = new Set(data.sessions.filter((s) => ids.has(s.programId)).map((s) => s.id));
  return data.hourLogs.filter((h) => h.sessionId && sessionIds.has(h.sessionId)).length;
}

/**
 * Deletes programs together with their sessions and sign-ups, and returns any items that were
 * checked out to them (so no item is left pointing at a deleted program).
 * @param draft - Draft snapshot.
 * @param programIds - Programs to delete.
 */
function deletePrograms(draft: DataSnapshot, programIds: string[]): void {
  const ids = new Set(programIds);
  const sessionIds = new Set(draft.sessions.filter((s) => ids.has(s.programId)).map((s) => s.id));
  draft.signUps = draft.signUps.filter((s) => !sessionIds.has(s.sessionId));
  draft.sessions = draft.sessions.filter((s) => !sessionIds.has(s.id));
  for (const item of draft.equipment)
    if (item.programId && ids.has(item.programId)) {
      item.programId = undefined;
      item.checkedOutAt = undefined;
    }
  draft.programs = draft.programs.filter((p) => !ids.has(p.id));
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

/**
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param includeArchived - Include archived sites.
 * @returns The org's sites by name.
 */
export function listSites(data: DataSnapshot, me: User, orgId: string, includeArchived = false) {
  requireOrg(data, me, orgId, 'volunteers.view');
  return data.sites
    .filter((s) => s.orgId === orgId && (includeArchived || !s.archived))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Validates site fields against the org's settings: the served range is kept only when the org
 * tracks one (V-S11), and the priority flag only when priority sites are switched on.
 * @param data - Snapshot.
 * @param orgId - Org.
 * @param input - Raw site.
 * @returns Clean site fields.
 */
function siteInput(data: DataSnapshot, orgId: string, input: unknown) {
  const parsed = validate(siteSchema, input);
  const { rangeKind, features } = orgById(data, orgId).settings;
  const keepRange = rangeKind !== RangeKind.NONE;
  if (keepRange) enforce(rules.rangeValid(rangeKind, parsed.rangeMin, parsed.rangeMax)); // V-S11
  return {
    ...parsed,
    priority: features.prioritySites && parsed.priority,
    rangeMin: keepRange ? parsed.rangeMin : undefined,
    rangeMax: keepRange ? parsed.rangeMax : undefined,
  };
}

/**
 * Adds a site (FR-9).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param input - Raw site.
 * @returns The site.
 */
export function createSite(draft: DataSnapshot, me: User, orgId: string, input: unknown): Site {
  requireOrg(draft, me, orgId, 'sites.edit');
  const data = siteInput(draft, orgId, input);
  enforce(
    rules.uniqueSiteName(
      data.name,
      draft.sites.filter((s) => s.orgId === orgId),
      undefined,
      termsIn(draft, orgId).Site,
    ), // V-S12
  );
  const site: Site = { ...data, id: newId('site'), orgId, archived: false };
  draft.sites.push(site);
  return site;
}

/**
 * Edits a site.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param id - Site.
 * @param input - Raw site.
 * @returns The site.
 */
export function updateSite(draft: DataSnapshot, me: User, id: string, input: unknown): Site {
  const orgId = orgOfSite(draft, id);
  requireOrg(draft, me, orgId, 'sites.edit');
  const data = siteInput(draft, orgId, input);
  enforce(
    rules.uniqueSiteName(
      data.name,
      draft.sites.filter((s) => s.orgId === orgId),
      id,
      termsIn(draft, orgId).Site,
    ),
  );
  const s = found(
    draft.sites.find((x) => x.id === id),
    'site',
  );
  Object.assign(s, data);
  return s;
}

/**
 * Deletes a site and everything under it, unless hours were logged there (V-S14).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param id - Site.
 */
export function removeSite(draft: DataSnapshot, me: User, id: string): void {
  requireOrg(draft, me, orgOfSite(draft, id), 'sites.edit');
  const programIds = draft.programs.filter((p) => p.siteId === id).map((p) => p.id);
  enforce(rules.canDelete('site', loggedHoursFor(draft, programIds)));
  deletePrograms(draft, programIds);
  draft.sites = draft.sites.filter((s) => s.id !== id);
}

/**
 * Archives or restores a site.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param id - Site.
 * @returns The site.
 */
export function toggleSiteArchive(draft: DataSnapshot, me: User, id: string): Site {
  requireOrg(draft, me, orgOfSite(draft, id), 'sites.edit');
  const s = found(
    draft.sites.find((x) => x.id === id),
    'site',
  );
  s.archived = !s.archived;
  return s;
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

/**
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param includeArchived - Include archived programs.
 * @returns The org's programs, newest first.
 */
export function listPrograms(
  data: DataSnapshot,
  me: User,
  orgId: string,
  includeArchived = false,
): Program[] {
  requireOrg(data, me, orgId, 'volunteers.view');
  const siteIds = new Set(data.sites.filter((s) => s.orgId === orgId).map((s) => s.id));
  return data.programs
    .filter((p) => siteIds.has(p.siteId) && (includeArchived || !p.archived))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * Creates a program at a site (FR-10); the site decides the org.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param input - Raw program.
 * @returns The program.
 */
export function createProgram(draft: DataSnapshot, me: User, input: unknown): Program {
  const data = validate(programSchema, input);
  requireOrg(draft, me, orgOfSite(draft, data.siteId), 'sites.edit');
  enforce(rules.programDatesValid(data.startDate, data.endDate)); // V-S3
  const program: Program = { ...data, id: newId('prg'), archived: false, oneOff: false };
  draft.programs.push(program);
  return program;
}

/**
 * Edits a program. It can't move to a site in another org.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param id - Program.
 * @param input - Raw program.
 * @returns The program.
 */
export function updateProgram(draft: DataSnapshot, me: User, id: string, input: unknown): Program {
  const orgId = orgOfProgram(draft, id);
  requireOrg(draft, me, orgId, 'sites.edit');
  const data = validate(programSchema, input);
  if (orgOfSite(draft, data.siteId) !== orgId)
    throw new AppError(
      'FORBIDDEN',
      'A program can only move to a site in the same organization.',
      'siteId',
    );
  enforce(rules.programDatesValid(data.startDate, data.endDate));
  const p = found(
    draft.programs.find((x) => x.id === id),
    'program',
  );
  if (p.oneOff)
    throw new AppError(
      'CONFLICT',
      'One-time events aren’t a program, so there is nothing to edit.',
    );
  Object.assign(p, data);
  return p;
}

/**
 * Deletes a program and its sessions, unless hours were logged (V-S14).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param id - Program.
 */
export function removeProgram(draft: DataSnapshot, me: User, id: string): void {
  requireOrg(draft, me, orgOfProgram(draft, id), 'sites.edit');
  enforce(rules.canDelete('program', loggedHoursFor(draft, [id])));
  deletePrograms(draft, [id]);
}

/**
 * Archives or restores a program.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param id - Program.
 * @returns The program.
 */
export function toggleProgramArchive(draft: DataSnapshot, me: User, id: string): Program {
  requireOrg(draft, me, orgOfProgram(draft, id), 'sites.edit');
  const p = found(
    draft.programs.find((x) => x.id === id),
    'program',
  );
  p.archived = !p.archived;
  return p;
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/**
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @returns The org's items by asset tag.
 */
export function listEquipment(data: DataSnapshot, me: User, orgId: string): Equipment[] {
  requireOrg(data, me, orgId, 'equipment.manage');
  return data.equipment
    .filter((k) => k.orgId === orgId)
    .sort((a, b) => a.assetTag.localeCompare(b.assetTag));
}

/**
 * Adds an equipment item. Asset tags are unique within an org.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @param input - Raw item.
 * @returns The item.
 */
export function createEquipment(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  input: unknown,
): Equipment {
  requireOrg(draft, me, orgId, 'equipment.manage');
  const data = validate(equipmentSchema, input);
  if (draft.equipment.some((k) => k.orgId === orgId && k.assetTag === data.assetTag))
    throw new AppError('CONFLICT', 'That asset tag is already in use.', 'assetTag');
  const item: Equipment = { ...data, id: newId('eq'), orgId };
  draft.equipment.push(item);
  return item;
}

/**
 * Checks an item out to a program in the same org (V-S10).
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param equipmentId - Equipment.
 * @param programId - Program.
 * @returns The item.
 */
export function checkOutEquipment(
  draft: DataSnapshot,
  me: User,
  equipmentId: string,
  programId: unknown,
): Equipment {
  const item = found(
    draft.equipment.find((k) => k.id === equipmentId),
    'item',
  );
  requireOrg(draft, me, item.orgId, 'equipment.manage');
  if (typeof programId !== 'string' || !programId)
    throw new AppError('VALIDATION', 'Choose a program.', 'programId');
  if (orgOfProgram(draft, programId) !== item.orgId)
    throw new AppError('FORBIDDEN', 'Items can only go to programs in the same organization.');
  enforce(rules.equipmentAvailable(item, termsIn(draft, item.orgId).Equipment));
  item.programId = programId;
  item.checkedOutAt = todayIso();
  return item;
}

/**
 * Returns an item to inventory.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param equipmentId - Equipment.
 * @returns The item.
 */
export function returnEquipment(draft: DataSnapshot, me: User, equipmentId: string): Equipment {
  const item = found(
    draft.equipment.find((k) => k.id === equipmentId),
    'item',
  );
  requireOrg(draft, me, item.orgId, 'equipment.manage');
  item.programId = undefined;
  item.checkedOutAt = undefined;
  return item;
}

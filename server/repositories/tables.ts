/**
 * @file Table mapping between Prisma rows and Onboard's domain objects (§2.5).
 *
 * The domain (shared/) works with *aggregates*: a VolunteerProfile carries its skills and
 * availability, an OrgVolunteer its status history, a Session its required skills and role slots.
 * In SQLite each of those is a parent row plus child rows. This file is the one place that knows
 * both shapes. Each {@link TableSpec} says how to turn an aggregate into rows and back, and the
 * snapshot loader, the unit of work and the seeder all read the same list ({@link TABLES}).
 *
 * Storage conventions:
 * - Booleans are `Int` 0/1 (Prisma 8's SQLite target has no boolean column).
 * - Optional values are SQL NULL in the database and `undefined` in the domain.
 * - Skills are referenced by a deterministic id derived from the name ({@link skillId}).
 */
import type {
  Availability,
  Equipment,
  FilterPreset,
  OfferStatus,
  OwnershipOffer,
  HourLog,
  Membership,
  Organization,
  OrgVolunteer,
  Program,
  Requirement,
  RequirementCompletion,
  Session,
  Site,
  SignUp,
  StatusChange,
  VolunteerProfile,
} from '@shared/types';
import type { DataSnapshot, StoredUser } from '@shared/domain/snapshot';
import type {
  EquipmentCondition,
  ExperienceLevel,
  HourStatus,
  OrgRole,
  OrgSector,
  ProgramType,
  RangeKind,
  SessionStatus,
  SessionType,
  SignUpStatus,
  VolunteerStatus,
} from '@shared/enums';

/** A database row as the ORM reads and writes it. */
export type Row = Record<string, unknown>;

/** Child rows stored in another table and owned by one aggregate. */
export interface ChildSpec {
  /** Prisma model name of the child table. */
  model: string;
  /** Column holding the parent's id. */
  parentKey: string;
}

/**
 * How one snapshot collection maps to a parent table (and optional child tables).
 * @typeParam T - Domain aggregate type.
 */
export interface TableSpec<T extends { id: string }> {
  /** Collection in {@link DataSnapshot}. */
  key: keyof DataSnapshot;
  /** Prisma model name of the parent table. */
  model: string;
  /** Child tables, in insert order. */
  children: ChildSpec[];
  /** Aggregate → parent row. */
  toRow(entity: T): Row;
  /** Aggregate → child rows, keyed by child model. */
  childRows?(entity: T): Record<string, Row[]>;
  /** Parent row + its child rows → aggregate. */
  fromRow(row: Row, children: Record<string, Row[]>, skillNames: Map<string, string>): T;
}

// ---------------------------------------------------------------------------
// Value conversions
// ---------------------------------------------------------------------------

/** Domain boolean → stored `Int` 0/1. */
export const toInt = (b: boolean): number => (b ? 1 : 0);
/** Stored `Int` → domain boolean. */
export const toBool = (v: unknown): boolean => v === 1 || v === true;
/** Domain optional → SQL NULL. */
const nul = <V>(v: V | undefined): V | null => (v === undefined ? null : v);
/** SQL NULL → domain optional. */
const opt = <V>(v: unknown): V | undefined =>
  v === null || v === undefined ? undefined : (v as V);
/** Reads a text column. */
const str = (v: unknown): string => String(v);
/** Reads a numeric column. */
const num = (v: unknown): number => Number(v);

/**
 * Deterministic primary key for a skill name, e.g. `"Block coding"` → `skl_block-coding`.
 * @param name - Skill name.
 * @returns Its `Skill.id`.
 */
export function skillId(name: string): string {
  return `skl_${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`;
}

/**
 * Sorts child rows by a numeric column, for children whose order matters.
 * @param rows - Child rows.
 * @param col - Column to sort by.
 * @returns A sorted copy.
 */
const byNum = (rows: Row[], col: string) => [...rows].sort((a, b) => num(a[col]) - num(b[col]));

// ---------------------------------------------------------------------------
// Specs, in foreign-key order (parents before the tables that reference them)
// ---------------------------------------------------------------------------

const organizations: TableSpec<Organization> = {
  key: 'organizations',
  model: 'Organization',
  children: [
    { model: 'OrgSkill', parentKey: 'orgId' },
    { model: 'OrgEventRole', parentKey: 'orgId' },
  ],
  toRow: (o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    timezone: o.timezone,
    createdAt: o.createdAt,
    sector: o.settings.sector,
    siteTerm: o.settings.siteTerm,
    participantTerm: o.settings.participantTerm,
    equipmentTerm: o.settings.equipmentTerm,
    priorityLabel: o.settings.priorityLabel,
    rangeKind: o.settings.rangeKind,
    featureEquipment: toInt(o.settings.features.equipment),
    featurePriority: toInt(o.settings.features.prioritySites),
    featureGuests: toInt(o.settings.features.guests),
  }),
  childRows: (o) => ({
    OrgSkill: [...new Set(o.settings.skills)].map((name, i) => ({
      orgId: o.id,
      skillId: skillId(name),
      position: i,
      description: nul(o.settings.skillNotes[name] || undefined),
    })),
    OrgEventRole: o.settings.eventRoles.map((name, i) => ({
      id: `${o.id}_role${i}`,
      orgId: o.id,
      name,
      position: i,
    })),
  }),
  fromRow: (r, c, skillNames) => ({
    id: str(r.id),
    name: str(r.name),
    description: str(r.description),
    timezone: str(r.timezone),
    createdAt: str(r.createdAt),
    settings: {
      sector: r.sector as OrgSector,
      siteTerm: str(r.siteTerm),
      participantTerm: str(r.participantTerm),
      equipmentTerm: str(r.equipmentTerm),
      priorityLabel: str(r.priorityLabel),
      rangeKind: r.rangeKind as RangeKind,
      features: {
        equipment: toBool(r.featureEquipment),
        prioritySites: toBool(r.featurePriority),
        guests: toBool(r.featureGuests),
      },
      skills: byNum(c.OrgSkill ?? [], 'position')
        .map((s) => skillNames.get(str(s.skillId)) ?? '')
        .filter(Boolean),
      skillNotes: Object.fromEntries(
        (c.OrgSkill ?? [])
          .filter((s) => s.description && skillNames.has(str(s.skillId)))
          .map((s) => [skillNames.get(str(s.skillId)) as string, str(s.description)]),
      ),
      eventRoles: byNum(c.OrgEventRole ?? [], 'position').map((role) => str(role.name)),
    },
  }),
};

const requirements: TableSpec<Requirement> = {
  key: 'requirements',
  model: 'Requirement',
  children: [],
  toRow: (q) => ({
    id: q.id,
    orgId: q.orgId,
    name: q.name,
    description: q.description,
    validMonths: nul(q.validMonths),
    position: q.position,
    archived: toInt(q.archived),
  }),
  fromRow: (r) => ({
    id: str(r.id),
    orgId: str(r.orgId),
    name: str(r.name),
    description: str(r.description),
    validMonths: opt<number>(r.validMonths),
    position: num(r.position),
    archived: toBool(r.archived),
  }),
};

const users: TableSpec<StoredUser> = {
  key: 'users',
  model: 'User',
  children: [],
  toRow: (u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: nul(u.phone),
    zip: nul(u.zip),
    passwordHash: u.passwordHash,
    tourCompleted: toInt(u.tourCompleted),
    createdAt: u.createdAt,
  }),
  fromRow: (r) => ({
    id: str(r.id),
    firstName: str(r.firstName),
    lastName: str(r.lastName),
    email: str(r.email),
    phone: opt(r.phone),
    zip: opt(r.zip),
    passwordHash: str(r.passwordHash),
    tourCompleted: toBool(r.tourCompleted),
    createdAt: str(r.createdAt),
  }),
};

const profiles: TableSpec<VolunteerProfile> = {
  key: 'profiles',
  model: 'VolunteerProfile',
  children: [
    { model: 'VolunteerSkill', parentKey: 'profileId' },
    { model: 'Availability', parentKey: 'profileId' },
  ],
  toRow: (p) => ({
    id: p.id,
    userId: p.userId,
    affiliation: p.affiliation,
    experienceLevel: p.experienceLevel,
    hasTransportation: toInt(p.hasTransportation),
    bio: nul(p.bio),
  }),
  childRows: (p) => ({
    VolunteerSkill: [...new Set(p.skills)].map((name) => ({
      profileId: p.id,
      skillId: skillId(name),
    })),
    Availability: p.availability.map((a) => ({
      id: a.id,
      profileId: p.id,
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime,
      endTime: a.endTime,
    })),
  }),
  fromRow: (r, c, skillNames) => ({
    id: str(r.id),
    userId: str(r.userId),
    affiliation: str(r.affiliation),
    experienceLevel: r.experienceLevel as ExperienceLevel,
    hasTransportation: toBool(r.hasTransportation),
    bio: opt(r.bio),
    skills: (c.VolunteerSkill ?? [])
      .map((s) => skillNames.get(str(s.skillId)) ?? '')
      .filter(Boolean)
      .sort(),
    availability: (c.Availability ?? [])
      .map((a): Availability => ({
        id: str(a.id),
        dayOfWeek: num(a.dayOfWeek),
        startTime: str(a.startTime),
        endTime: str(a.endTime),
      }))
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)),
  }),
};

const memberships: TableSpec<Membership> = {
  key: 'memberships',
  model: 'Membership',
  children: [],
  toRow: (m) => ({
    id: m.id,
    orgId: m.orgId,
    userId: m.userId,
    orgRole: m.orgRole,
    createdAt: m.createdAt,
  }),
  fromRow: (r) => ({
    id: str(r.id),
    orgId: str(r.orgId),
    userId: str(r.userId),
    orgRole: r.orgRole as OrgRole,
    createdAt: str(r.createdAt),
  }),
};

const orgVolunteers: TableSpec<OrgVolunteer> = {
  key: 'orgVolunteers',
  model: 'OrgVolunteer',
  children: [
    { model: 'StatusChange', parentKey: 'orgVolunteerId' },
    { model: 'VolunteerRequirement', parentKey: 'orgVolunteerId' },
  ],
  toRow: (o) => ({
    id: o.id,
    orgId: o.orgId,
    userId: o.userId,
    status: o.status,
    createdAt: o.createdAt,
  }),
  childRows: (o) => ({
    StatusChange: o.statusHistory.map((h) => ({
      id: h.id,
      orgVolunteerId: o.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      changedBy: h.changedBy,
      changedAt: h.changedAt,
      note: nul(h.note),
    })),
    VolunteerRequirement: o.requirements.map((q) => ({
      orgVolunteerId: o.id,
      requirementId: q.requirementId,
      completedAt: q.completedAt,
      expiresAt: nul(q.expiresAt),
      recordedBy: q.recordedBy,
    })),
  }),
  fromRow: (r, c) => ({
    id: str(r.id),
    orgId: str(r.orgId),
    userId: str(r.userId),
    status: r.status as VolunteerStatus,
    createdAt: str(r.createdAt),
    requirements: (c.VolunteerRequirement ?? []).map((q): RequirementCompletion => ({
      requirementId: str(q.requirementId),
      completedAt: str(q.completedAt),
      expiresAt: opt(q.expiresAt),
      recordedBy: str(q.recordedBy),
    })),
    statusHistory: (c.StatusChange ?? [])
      .map((h): StatusChange => ({
        id: str(h.id),
        fromStatus: (h.fromStatus ?? null) as VolunteerStatus | null,
        toStatus: h.toStatus as VolunteerStatus,
        changedBy: str(h.changedBy),
        changedAt: str(h.changedAt),
        note: opt(h.note),
      }))
      .sort((a, b) => a.changedAt.localeCompare(b.changedAt)),
  }),
};

const sites: TableSpec<Site> = {
  key: 'sites',
  model: 'Site',
  children: [],
  toRow: (s) => ({
    id: s.id,
    orgId: s.orgId,
    name: s.name,
    address: s.address,
    zip: s.zip,
    priority: toInt(s.priority),
    rangeMin: nul(s.rangeMin),
    rangeMax: nul(s.rangeMax),
    contactName: s.contactName,
    contactEmail: s.contactEmail,
    archived: toInt(s.archived),
  }),
  fromRow: (r) => ({
    id: str(r.id),
    orgId: str(r.orgId),
    name: str(r.name),
    address: str(r.address),
    zip: str(r.zip),
    priority: toBool(r.priority),
    rangeMin: opt<number>(r.rangeMin),
    rangeMax: opt<number>(r.rangeMax),
    contactName: str(r.contactName),
    contactEmail: str(r.contactEmail),
    archived: toBool(r.archived),
  }),
};

const programs: TableSpec<Program> = {
  key: 'programs',
  model: 'Program',
  children: [],
  toRow: (p) => ({
    id: p.id,
    siteId: p.siteId,
    name: p.name,
    type: p.type,
    startDate: p.startDate,
    endDate: p.endDate,
    participantCount: p.participantCount,
    targetRatio: nul(p.targetRatio),
    description: p.description,
    archived: toInt(p.archived),
    oneOff: toInt(p.oneOff),
  }),
  fromRow: (r) => ({
    id: str(r.id),
    siteId: str(r.siteId),
    name: str(r.name),
    type: r.type as ProgramType,
    startDate: str(r.startDate),
    endDate: str(r.endDate),
    participantCount: num(r.participantCount),
    targetRatio: opt<number>(r.targetRatio),
    description: str(r.description),
    archived: toBool(r.archived),
    oneOff: toBool(r.oneOff),
  }),
};

const sessions: TableSpec<Session> = {
  key: 'sessions',
  model: 'Session',
  children: [
    { model: 'SessionSkill', parentKey: 'sessionId' },
    { model: 'RoleSlot', parentKey: 'sessionId' },
  ],
  toRow: (s) => ({
    id: s.id,
    programId: s.programId,
    type: s.type,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    title: s.title,
    volunteersNeeded: s.volunteersNeeded,
    status: s.status,
    openToGuests: toInt(s.openToGuests),
  }),
  childRows: (s) => ({
    SessionSkill: [...new Set(s.requiredSkills)].map((name) => ({
      sessionId: s.id,
      skillId: skillId(name),
    })),
    RoleSlot: s.roleSlots.map((slot, i) => ({
      id: `${s.id}_slot${i}`,
      sessionId: s.id,
      role: slot.role,
      needed: slot.needed,
      position: i,
    })),
  }),
  fromRow: (r, c, skillNames) => ({
    id: str(r.id),
    programId: str(r.programId),
    type: r.type as SessionType,
    date: str(r.date),
    startTime: str(r.startTime),
    endTime: str(r.endTime),
    title: str(r.title),
    volunteersNeeded: num(r.volunteersNeeded),
    status: r.status as SessionStatus,
    openToGuests: toBool(r.openToGuests),
    requiredSkills: (c.SessionSkill ?? [])
      .map((s) => skillNames.get(str(s.skillId)) ?? '')
      .filter(Boolean)
      .sort(),
    roleSlots: byNum(c.RoleSlot ?? [], 'position').map((slot) => ({
      role: str(slot.role),
      needed: num(slot.needed),
    })),
  }),
};

const signUps: TableSpec<SignUp> = {
  key: 'signUps',
  model: 'SignUp',
  children: [],
  toRow: (s) => ({
    id: s.id,
    sessionId: s.sessionId,
    userId: s.userId,
    role: s.role,
    status: s.status,
    guest: toInt(s.guest),
    waitlistPosition: nul(s.waitlistPosition),
    checkInAt: nul(s.checkInAt),
    checkOutAt: nul(s.checkOutAt),
    createdAt: s.createdAt,
  }),
  fromRow: (r) => ({
    id: str(r.id),
    sessionId: str(r.sessionId),
    userId: str(r.userId),
    role: str(r.role),
    status: r.status as SignUpStatus,
    guest: toBool(r.guest),
    waitlistPosition: opt<number>(r.waitlistPosition),
    checkInAt: opt(r.checkInAt),
    checkOutAt: opt(r.checkOutAt),
    createdAt: str(r.createdAt),
  }),
};

const hourLogs: TableSpec<HourLog> = {
  key: 'hourLogs',
  model: 'HourLog',
  children: [],
  toRow: (h) => ({
    id: h.id,
    userId: h.userId,
    orgId: h.orgId,
    sessionId: nul(h.sessionId),
    date: h.date,
    hours: h.hours,
    description: h.description,
    status: h.status,
    autoGenerated: toInt(h.autoGenerated),
    reviewedBy: nul(h.reviewedBy),
    reviewNote: nul(h.reviewNote),
  }),
  fromRow: (r) => ({
    id: str(r.id),
    userId: str(r.userId),
    orgId: str(r.orgId),
    sessionId: opt(r.sessionId),
    date: str(r.date),
    hours: num(r.hours),
    description: str(r.description),
    status: r.status as HourStatus,
    autoGenerated: toBool(r.autoGenerated),
    reviewedBy: opt(r.reviewedBy),
    reviewNote: opt(r.reviewNote),
  }),
};

const equipment: TableSpec<Equipment> = {
  key: 'equipment',
  model: 'Equipment',
  children: [],
  toRow: (k) => ({
    id: k.id,
    orgId: k.orgId,
    assetTag: k.assetTag,
    name: k.name,
    condition: k.condition,
    programId: nul(k.programId),
    checkedOutAt: nul(k.checkedOutAt),
  }),
  fromRow: (r) => ({
    id: str(r.id),
    orgId: str(r.orgId),
    assetTag: str(r.assetTag),
    name: str(r.name),
    condition: r.condition as EquipmentCondition,
    programId: opt(r.programId),
    checkedOutAt: opt(r.checkedOutAt),
  }),
};

const presets: TableSpec<FilterPreset> = {
  key: 'presets',
  model: 'FilterPreset',
  children: [],
  toRow: (p) => ({ id: p.id, userId: p.userId, name: p.name, filters: JSON.stringify(p.filters) }),
  fromRow: (r) => ({
    id: str(r.id),
    userId: str(r.userId),
    name: str(r.name),
    filters: JSON.parse(str(r.filters)) as FilterPreset['filters'],
  }),
};

const offers: TableSpec<OwnershipOffer> = {
  key: 'offers',
  model: 'OwnershipOffer',
  children: [],
  toRow: (o) => ({ ...o, stepDown: toInt(o.stepDown) }),
  fromRow: (r) => ({
    id: str(r.id),
    orgId: str(r.orgId),
    fromUserId: str(r.fromUserId),
    toUserId: str(r.toUserId),
    stepDown: toBool(r.stepDown),
    status: str(r.status) as OfferStatus,
    createdAt: str(r.createdAt),
  }),
};

/**
 * Every snapshot collection, parents first. Inserts and updates run in this order and deletes
 * in reverse, so foreign keys always point at rows that exist.
 */
export const TABLES: TableSpec<{ id: string }>[] = [
  organizations,
  requirements,
  users,
  profiles,
  memberships,
  orgVolunteers,
  sites,
  programs,
  sessions,
  signUps,
  hourLogs,
  equipment,
  presets,
  offers,
] as unknown as TableSpec<{ id: string }>[];

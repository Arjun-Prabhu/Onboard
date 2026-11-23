/**
 * @file Shared enumerations used by both the React client and the Express API.
 *
 * These are declared as `const` objects plus derived union types instead of TS `enum`s so
 * they serialize as plain strings over HTTP/JSON and line up 1:1 with Prisma enums.
 * No magic strings anywhere else in the codebase — always import from here.
 */

/**
 * Management roles a person can hold IN AN ORGANIZATION (via a Membership). Roles are not
 * account types: one person can be Owner of one org, Coordinator of another, and a volunteer
 * anywhere, all with the same login (§1.3).
 */
export const OrgRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  COORDINATOR: 'COORDINATOR',
} as const;
/** Union of {@link OrgRole} values. */
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

/** Authority ranking: OWNER > ADMIN > COORDINATOR. Higher number = more rights. */
export const ORG_ROLE_RANK: Record<OrgRole, number> = { OWNER: 3, ADMIN: 2, COORDINATOR: 1 };

/** Recruitment pipeline stages (FR-5). Order matters: it is the pipeline order. */
export const VolunteerStatus = {
  APPLIED: 'APPLIED',
  INTERVIEWED: 'INTERVIEWED',
  TRAINED: 'TRAINED',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
/** Union of {@link VolunteerStatus} values. */
export type VolunteerStatus = (typeof VolunteerStatus)[keyof typeof VolunteerStatus];

/** Pipeline stages in display order. */
export const PIPELINE_ORDER: readonly VolunteerStatus[] = [
  VolunteerStatus.APPLIED,
  VolunteerStatus.INTERVIEWED,
  VolunteerStatus.TRAINED,
  VolunteerStatus.ACTIVE,
  VolunteerStatus.INACTIVE,
];

/** Kind of organization; picks sensible default terms for a new org. */
export const OrgSector = {
  STEM: 'STEM',
  HEALTH: 'HEALTH',
  SPORTS: 'SPORTS',
  COMMUNITY: 'COMMUNITY',
  OTHER: 'OTHER',
} as const;
/** Union of {@link OrgSector} values. */
export type OrgSector = (typeof OrgSector)[keyof typeof OrgSector];

/** What a site's served range counts: school grades, ages, or nothing (no range kept). */
export const RangeKind = { GRADE: 'GRADE', AGE: 'AGE', NONE: 'NONE' } as const;
/** Union of {@link RangeKind} values. */
export type RangeKind = (typeof RangeKind)[keyof typeof RangeKind];

/** Program schedule types (FR-10): runs all year, or for one season. */
export const ProgramType = { ONGOING: 'ONGOING', SEASONAL: 'SEASONAL' } as const;
/** Union of {@link ProgramType} values. */
export type ProgramType = (typeof ProgramType)[keyof typeof ProgramType];

/**
 * Session types (FR-11): a regular shift (the weekly lesson, clinic shift, practice…), an event
 * with named roles (a tournament, health fair, race day…), or a training for volunteers.
 */
export const SessionType = {
  SHIFT: 'SHIFT',
  EVENT: 'EVENT',
  TRAINING: 'TRAINING',
} as const;
/** Union of {@link SessionType} values. */
export type SessionType = (typeof SessionType)[keyof typeof SessionType];

/** Session lifecycle status. */
export const SessionStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
/** Union of {@link SessionStatus} values. */
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

/** Sign-up lifecycle (FR-13, FR-14, FR-16). */
export const SignUpStatus = {
  SIGNED_UP: 'SIGNED_UP',
  WAITLISTED: 'WAITLISTED',
  CHECKED_IN: 'CHECKED_IN',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO_SHOW',
  CANCELLED: 'CANCELLED',
} as const;
/** Union of {@link SignUpStatus} values. */
export type SignUpStatus = (typeof SignUpStatus)[keyof typeof SignUpStatus];

/** Hour-log review status (FR-19). */
export const HourStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
/** Union of {@link HourStatus} values. */
export type HourStatus = (typeof HourStatus)[keyof typeof HourStatus];

/** Physical condition of an equipment item (FR-21). */
export const EquipmentCondition = {
  GOOD: 'GOOD',
  NEEDS_REPAIR: 'NEEDS_REPAIR',
  MISSING_PARTS: 'MISSING_PARTS',
  RETIRED: 'RETIRED',
} as const;
/** Union of {@link EquipmentCondition} values. */
export type EquipmentCondition = (typeof EquipmentCondition)[keyof typeof EquipmentCondition];

/** Volunteer experience level used by the experience-balance matching factor. */
export const ExperienceLevel = {
  NEW: 'NEW',
  INTERMEDIATE: 'INTERMEDIATE',
  VETERAN: 'VETERAN',
} as const;
/** Union of {@link ExperienceLevel} values. */
export type ExperienceLevel = (typeof ExperienceLevel)[keyof typeof ExperienceLevel];

/**
 * Role every sign-up gets unless the person picked one of an event's named roles. Event roles
 * themselves are set per org in Organization settings (FR-12).
 */
export const DEFAULT_ROLE = 'Volunteer';

/** Where a volunteer stands on one requirement (Phase 3 checklist). */
export const RequirementState = {
  COMPLETE: 'COMPLETE',
  EXPIRING: 'EXPIRING',
  EXPIRED: 'EXPIRED',
  MISSING: 'MISSING',
} as const;
/** Union of {@link RequirementState} values. */
export type RequirementState = (typeof RequirementState)[keyof typeof RequirementState];

/** A completed requirement counts as "expiring" this many days before it lapses. */
export const EXPIRING_WITHIN_DAYS = 30;

/** Staffing-risk levels (FR-24). */
export const RiskLevel = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' } as const;
/** Union of {@link RiskLevel} values. */
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

/** Days of the week, 0 = Sunday, matching `Date.prototype.getDay()`. */
export const DAY_NAMES: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Human-readable labels for enum values shown in the UI, in everyday words a first-time user
 * understands ("Ready to serve" rather than "Active"). Stored values never change.
 */
export const LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  COORDINATOR: 'Coordinator',
  VOLUNTEER: 'Volunteer',
  GUEST: 'Guest',
  APPLIED: 'New application',
  INTERVIEWED: 'Interviewed',
  TRAINED: 'Trained',
  ACTIVE: 'Ready to serve',
  INACTIVE: 'Taking a break',
  ONGOING: 'Year-round',
  SEASONAL: 'Seasonal',
  SHIFT: 'Regular shift',
  EVENT: 'Event',
  TRAINING: 'Training',
  STEM: 'STEM & education',
  HEALTH: 'Health',
  SPORTS: 'Sports & recreation',
  COMMUNITY: 'Community service',
  OTHER: 'Other',
  GRADE: 'School grades',
  AGE: 'Ages',
  NONE: 'No range',
  COMPLETE: 'Complete',
  EXPIRING: 'Expiring soon',
  EXPIRED: 'Expired',
  MISSING: 'Missing',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  SIGNED_UP: 'Signed up',
  WAITLISTED: 'On waiting list',
  CHECKED_IN: 'Checked in',
  NO_SHOW: 'Didn’t come',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  GOOD: 'Good',
  NEEDS_REPAIR: 'Needs repair',
  MISSING_PARTS: 'Missing parts',
  RETIRED: 'Retired',
  NEW: 'New',
  INTERMEDIATE: 'Intermediate',
  VETERAN: 'Veteran',
  HIGH: 'Urgent',
  MEDIUM: 'Needs help',
  LOW: 'On track',
};

/**
 * Returns the display label for an enum value.
 * @param value - Any enum value from this module.
 * @returns The human-readable label, or the raw value if none is registered.
 */
export function labelOf(value: string): string {
  return LABELS[value] ?? value;
}

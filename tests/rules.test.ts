/**
 * @file Unit tests for semantic validation rules V-S1 … V-S14 and format schemas V-F1 … V-F8.
 */
import { describe, expect, it } from 'vitest';
import {
  ExperienceLevel,
  HourStatus,
  EquipmentCondition,
  OrgRole,
  OrgSector,
  ProgramType,
  RangeKind,
  RequirementState,
  SessionStatus,
  SessionType,
  VolunteerStatus,
} from '@shared/enums';
import { assignableRoles, can, canManageMember } from '@shared/permissions';
import * as rules from '@shared/rules';
import { defaultSettings, pluralize, rangeText, termsOf } from '@shared/terms';
import { checklist, expiryFor, stateOf } from '@shared/domain/requirements';
import {
  emailSchema,
  hourLogSchema,
  passwordSchema,
  phoneSchema,
  zipSchema,
  dateSchema,
} from '@shared/schemas';
import type { Program, Session, Volunteer } from '@shared/types';

const program: Program = {
  id: 'p1',
  siteId: 's1',
  name: 'Club',
  type: ProgramType.ONGOING,
  startDate: '2026-09-01',
  endDate: '2027-05-31',
  participantCount: 20,
  targetRatio: 6,
  description: 'VEX',
  archived: false,
};
const session: Session = {
  id: 'x1',
  programId: 'p1',
  type: SessionType.SHIFT,
  date: '2026-11-24',
  startTime: '15:00',
  endTime: '16:30',
  title: 'Gears',
  requiredSkills: [],
  volunteersNeeded: 4,
  status: SessionStatus.SCHEDULED,
  roleSlots: [],
  openToGuests: false,
};
const volunteer: Volunteer = {
  id: 'v1',
  orgId: 'o1',
  firstName: 'Jordan',
  lastName: 'Rivera',
  email: 'j@example.com',
  phone: '7045550100',
  affiliation: 'UNCC',
  zip: '28205',
  hasTransportation: true,
  experienceLevel: ExperienceLevel.INTERMEDIATE,
  status: VolunteerStatus.ACTIVE,
  skills: ['VEX Build'],
  availability: [{ id: 'a', dayOfWeek: 2, startTime: '14:00', endTime: '18:00' }], // Tuesday
  statusHistory: [],
  trainingCompletedAt: '2026-01-01',
  clearanceCompletedAt: '2026-01-02',
  createdAt: '2025-12-01',
};

describe('semantic rules', () => {
  it('V-S1 end after start', () => {
    expect(rules.endAfterStart('15:00', '16:00').ok).toBe(true);
    const r = rules.endAfterStart('15:30', '15:30');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('End time must be after 3:30 PM.');
  });
  it('V-S2 session inside program dates', () => {
    expect(rules.sessionWithinProgram('2026-10-01', program).ok).toBe(true);
    expect(rules.sessionWithinProgram('2027-06-01', program).ok).toBe(false);
  });
  it('V-S3 program end after start', () => {
    expect(rules.programDatesValid('2026-01-01', '2026-01-01').ok).toBe(false);
  });
  it('V-S4 no double booking (overlap, not touching)', () => {
    const other = { ...session, id: 'x2', startTime: '16:00', endTime: '17:00' };
    expect(
      rules.noDoubleBooking(volunteer, session, [{ session: other, siteName: 'Eastway' }]).ok,
    ).toBe(false);
    const touching = { ...session, id: 'x3', startTime: '16:30', endTime: '17:30' };
    expect(
      rules.noDoubleBooking(volunteer, session, [{ session: touching, siteName: 'Eastway' }]).ok,
    ).toBe(true);
  });
  it('V-S5 requires ACTIVE standing and a current checklist in the session’s own org', () => {
    const req = (id: string, name: string) => ({
      id,
      orgId: 'o1',
      name,
      description: '',
      position: 0,
      archived: false,
    });
    const check = (name: string, state: RequirementState) => ({
      requirement: req(name, name),
      state,
    });
    const cleared = {
      status: VolunteerStatus.ACTIVE,
      requirements: [
        check('Training', RequirementState.COMPLETE),
        check('Background check', RequirementState.EXPIRING),
      ],
    };
    expect(rules.volunteerEligible('Jordan', cleared, session).ok).toBe(true);
    const missing = {
      ...cleared,
      requirements: [check('Background check', RequirementState.MISSING)],
    };
    expect(rules.volunteerEligible('Jordan', missing, session).ok).toBe(false);
    const expired = {
      ...cleared,
      requirements: [check('TB test', RequirementState.EXPIRED)],
    };
    const result = rules.volunteerEligible('Jordan', expired, session, 'Eastside Clinic');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('TB test (expired)');
    expect(
      rules.volunteerEligible('Jordan', { ...cleared, status: VolunteerStatus.TRAINED }, session)
        .ok,
    ).toBe(false);
    expect(
      rules.volunteerEligible(
        'Jordan',
        { ...cleared, status: VolunteerStatus.TRAINED },
        { ...session, type: SessionType.TRAINING },
      ).ok,
    ).toBe(true);
    // An org with no requirements at all only needs ACTIVE standing.
    expect(
      rules.volunteerEligible(
        'Jordan',
        { status: VolunteerStatus.ACTIVE, requirements: [] },
        session,
      ).ok,
    ).toBe(true);
    // No standing in this org (e.g. only volunteers elsewhere) → blocked …
    expect(rules.volunteerEligible('Jordan', undefined, session).ok).toBe(false);
  });
  it('V-S5 lets anyone join a session that is open to guests, as a guest', () => {
    const guestSession = { ...session, openToGuests: true };
    expect(rules.volunteerEligible('Jordan', undefined, guestSession).ok).toBe(true);
    expect(rules.joinModeFor(undefined)).toBe('guest');
    expect(rules.joinModeFor({ status: VolunteerStatus.APPLIED })).toBe('guest');
    expect(rules.joinModeFor({ status: VolunteerStatus.ACTIVE })).toBe('member');
  });
  it('V-S6 hours cannot exceed session or be in the future', () => {
    expect(rules.hoursPlausible(1.5, '2026-11-24', session, '2026-11-25').ok).toBe(true);
    expect(rules.hoursPlausible(4, '2026-11-24', session, '2026-11-25').ok).toBe(false);
    expect(rules.hoursPlausible(1, '2026-12-01', undefined, '2026-11-25').ok).toBe(false);
  });
  it('V-S7 daily cap of 12 hours', () => {
    const existing = [
      {
        id: 'h',
        volunteerId: 'v1',
        date: '2026-11-20',
        hours: 10,
        description: '',
        status: HourStatus.APPROVED,
        autoGenerated: false,
      },
    ];
    expect(rules.dailyHoursCap(2, '2026-11-20', existing).ok).toBe(true);
    expect(rules.dailyHoursCap(2.25, '2026-11-20', existing).ok).toBe(false);
  });
  it('V-S8 ratio met', () => {
    expect(rules.ratioMet(4, program).ok).toBe(true); // ceil(20/6) = 4
    expect(rules.ratioMet(3, program).ok).toBe(false);
  });
  it('V-S9 capacity', () => {
    expect(rules.hasCapacity(3, 4).ok).toBe(true);
    expect(rules.hasCapacity(4, 4).ok).toBe(false);
  });
  it('V-S10 item availability', () => {
    expect(
      rules.equipmentAvailable({
        id: 'k',
        assetTag: 'RC-0001',
        orgId: 'o1',
        name: 'IQ',
        condition: EquipmentCondition.GOOD,
      }).ok,
    ).toBe(true);
    expect(
      rules.equipmentAvailable({
        id: 'k',
        assetTag: 'RC-0001',
        orgId: 'o1',
        name: 'IQ',
        condition: EquipmentCondition.GOOD,
        programId: 'p1',
      }).ok,
    ).toBe(false);
  });
  it('V-S11 served range fits the org’s range kind', () => {
    expect(rules.rangeValid(RangeKind.GRADE, 0, 5).ok).toBe(true); // K–5
    expect(rules.rangeValid(RangeKind.GRADE, 4, 13).ok).toBe(false);
    expect(rules.rangeValid(RangeKind.GRADE, 7, 6).ok).toBe(false);
    expect(rules.rangeValid(RangeKind.AGE, 6, 18).ok).toBe(true);
    expect(rules.rangeValid(RangeKind.AGE, 6, undefined).ok).toBe(false);
    expect(rules.rangeValid(RangeKind.NONE, undefined, undefined).ok).toBe(true);
  });
  it('V-S12 unique login email across people, case-insensitive', () => {
    expect(rules.uniqueEmail('J@EXAMPLE.com', [volunteer]).ok).toBe(false);
    expect(rules.uniqueEmail('J@EXAMPLE.com', [volunteer], 'v1').ok).toBe(true);
  });
  it('V-S12 unique organization names', () => {
    const orgs = [
      {
        id: 'o1',
        name: 'Robolution CLT',
        timezone: 'America/New_York',
        description: '',
        createdAt: '2025-01-01',
        settings: defaultSettings(OrgSector.STEM),
      },
    ];
    expect(rules.uniqueOrgName('robolution clt', orgs).ok).toBe(false);
    expect(rules.uniqueOrgName('Eastside Robotics', orgs).ok).toBe(true);
  });
  it('an organization always keeps at least one Owner', () => {
    const m = (id: string, orgRole: OrgRole) => ({
      id,
      orgId: 'o1',
      userId: id,
      orgRole,
      createdAt: '2025-01-01',
    });
    expect(rules.keepsAnOwner([m('a', OrgRole.OWNER), m('b', OrgRole.ADMIN)], 'a').ok).toBe(false);
    expect(rules.keepsAnOwner([m('a', OrgRole.OWNER), m('b', OrgRole.OWNER)], 'a').ok).toBe(true);
    expect(rules.keepsAnOwner([m('a', OrgRole.OWNER), m('b', OrgRole.ADMIN)], 'b').ok).toBe(true);
  });
  it('V-S13 availability covers session', () => {
    expect(rules.availabilityCovers(volunteer, session).ok).toBe(true); // 2026-11-24 is a Tuesday
    expect(rules.availabilityCovers(volunteer, { ...session, date: '2026-11-25' }).ok).toBe(false);
  });
  it('V-S14 cannot delete with logged hours', () => {
    expect(rules.canDelete('site', 0).ok).toBe(true);
    expect(rules.canDelete('site', 3).ok).toBe(false);
  });
});

describe('format schemas', () => {
  it('V-F2 email', () => {
    expect(emailSchema.safeParse('a@b.co').success).toBe(true);
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
  it('V-F3 phone 10 digits', () => {
    expect(phoneSchema.safeParse('(704) 555-0123').success).toBe(true);
    expect(phoneSchema.safeParse('555-0123').success).toBe(false);
  });
  it('V-F4 ZIP 5 digits', () => {
    expect(zipSchema.safeParse('28205').success).toBe(true);
    expect(zipSchema.safeParse('2820').success).toBe(false);
  });
  it('V-F5 real dates only', () => {
    expect(dateSchema.safeParse('2026-02-28').success).toBe(true);
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false);
  });
  it('V-F6 hours are positive quarter-hours', () => {
    const base = { orgId: 'o1', date: '2026-11-01', description: 'Outreach' };
    expect(hourLogSchema.safeParse({ ...base, hours: 1.25 }).success).toBe(true);
    expect(hourLogSchema.safeParse({ ...base, hours: 1.3 }).success).toBe(false);
    expect(hourLogSchema.safeParse({ ...base, hours: -1 }).success).toBe(false);
  });
  it('V-F8 password strength', () => {
    expect(passwordSchema.safeParse('Onboard2026').success).toBe(true);
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('lettersonly').success).toBe(false);
  });
});

describe('org-scoped permissions', () => {
  it('ranks roles OWNER > ADMIN > COORDINATOR', () => {
    expect(can(OrgRole.COORDINATOR, 'hours.review')).toBe(true);
    expect(can(OrgRole.COORDINATOR, 'reports.view')).toBe(false);
    expect(can(OrgRole.ADMIN, 'reports.view')).toBe(true);
    expect(can(OrgRole.ADMIN, 'org.edit')).toBe(false);
    expect(can(OrgRole.OWNER, 'org.edit')).toBe(true);
    expect(can(null, 'volunteers.view')).toBe(false); // volunteering alone grants no management
  });
  it('limits who can appoint whom', () => {
    // Owner is never assigned directly: it takes an accepted offer (FR-3f).
    expect(assignableRoles(OrgRole.OWNER)).toEqual([OrgRole.ADMIN, OrgRole.COORDINATOR]);
    expect(assignableRoles(OrgRole.ADMIN)).toEqual([OrgRole.COORDINATOR]);
    expect(assignableRoles(OrgRole.COORDINATOR)).toEqual([]);
    expect(canManageMember(OrgRole.ADMIN, OrgRole.COORDINATOR)).toBe(true);
    expect(canManageMember(OrgRole.ADMIN, OrgRole.ADMIN)).toBe(false);
    expect(canManageMember(OrgRole.OWNER, OrgRole.OWNER)).toBe(true);
  });
});

describe('org terms (Phase 2)', () => {
  it('pluralizes UI nouns', () => {
    expect(pluralize('School')).toBe('Schools');
    expect(pluralize('Facility')).toBe('Facilities');
    expect(pluralize('Gear bag')).toBe('Gear bags');
    expect(pluralize('Equipment')).toBe('Equipment');
  });
  it('gives each sector its own words, and neutral words with no org', () => {
    const clinic = termsOf({ settings: defaultSettings(OrgSector.HEALTH) });
    expect(clinic.Sites).toBe('Clinics');
    expect(clinic.participants).toBe('patients');
    const league = termsOf({ settings: defaultSettings(OrgSector.SPORTS) });
    expect(league.EquipmentPlural).toBe('Gear bags');
    expect(league.rangeUnit).toBe('Age');
    expect(termsOf(null).Site).toBe('Site');
  });
  it('formats served ranges', () => {
    expect(rangeText(RangeKind.GRADE, 0, 5)).toBe('Grades K–5');
    expect(rangeText(RangeKind.AGE, 8, 8)).toBe('Age 8');
    expect(rangeText(RangeKind.NONE, 1, 2)).toBe('');
  });
});

describe('requirements checklist (Phase 3)', () => {
  const req = (id: string, validMonths?: number) => ({
    id,
    orgId: 'o1',
    name: id,
    description: '',
    validMonths,
    position: 0,
    archived: false,
  });
  it('computes expiry dates, clamping to the month end', () => {
    expect(expiryFor('2026-01-31', 1)).toBe('2026-02-28');
    expect(expiryFor('2026-03-15', 12)).toBe('2027-03-15');
    expect(expiryFor('2026-03-15', undefined)).toBeUndefined();
  });
  it('reports complete, expiring, expired and missing', () => {
    const today = '2026-11-21';
    expect(stateOf(undefined, today)).toBe(RequirementState.MISSING);
    expect(stateOf({ requirementId: 'a', completedAt: '2020-01-01', recordedBy: 'x' }, today)).toBe(
      RequirementState.COMPLETE,
    );
    const lapsing = { requirementId: 'a', completedAt: '2025-12-01', recordedBy: 'x' };
    expect(stateOf({ ...lapsing, expiresAt: '2026-12-01' }, today)).toBe(RequirementState.EXPIRING);
    expect(stateOf({ ...lapsing, expiresAt: '2026-11-20' }, today)).toBe(RequirementState.EXPIRED);
    expect(stateOf({ ...lapsing, expiresAt: '2027-06-01' }, today)).toBe(RequirementState.COMPLETE);
  });
  it('builds one row per active requirement', () => {
    const rows = checklist(
      [req('Training'), req('TB test', 12)],
      [{ requirementId: 'Training', completedAt: '2026-01-01', recordedBy: 'Alex' }],
      '2026-11-21',
    );
    expect(rows.map((r) => r.state)).toEqual([RequirementState.COMPLETE, RequirementState.MISSING]);
  });
});

/**
 * @file Demo seed data (FR-3), used by `server/prisma/seed.ts` and the unit tests.
 *
 * Two organizations show the multi-org identity model (§1.3):
 *  - **Robolution CLT** — the partner nonprofit, with six schools and weekly lessons (STEM sector: School · Students · Kit · Title I).
 *  - **Queen City STEM Alliance** — a partner org running a scrimmage that is open to guests.
 *
 * People deliberately hold several roles at once:
 *  - Alex Morgan  — OWNER of Robolution, ACTIVE volunteer at Robolution, COORDINATOR at Queen City.
 *  - Priya Patel  — OWNER of Queen City, ACTIVE volunteer at Robolution.
 *  - Marcus Johnson — ADMIN at Robolution. Maya Chen — COORDINATOR at Robolution.
 *  - Jordan Rivera — volunteer only; also has a one-time GUEST sign-up at Queen City.
 *
 * Every date is generated RELATIVE TO TODAY and a seeded PRNG keeps the data identical on every
 * reset, so the presentation can be rehearsed. All people are fictional (NFR-7).
 */
import {
  DEFAULT_ROLE,
  EquipmentCondition,
  ExperienceLevel,
  HourStatus,
  OrgRole,
  OrgSector,
  ProgramType,
  SessionStatus,
  SessionType,
  SignUpStatus,
  VolunteerStatus,
} from '@shared/enums';
import { addDays, durationHours, parseDate, todayIso } from '@shared/time';
import { defaultSettings } from '@shared/terms';
import { expiryFor } from '../domain/requirements';
import type { DataSnapshot, StoredUser } from '../domain/snapshot';
import type {
  Availability,
  FilterPreset,
  Equipment,
  HourLog,
  Membership,
  Organization,
  OrgVolunteer,
  Program,
  Requirement,
  Session,
  Site,
  SignUp,
  VolunteerProfile,
} from '@shared/types';

/** Robolution's own skill catalog (an org edits its catalog in Organization settings). */
export const ROBOLUTION_SKILLS: readonly string[] = [
  'VEX Build',
  'Block Coding',
  'Python',
  'Teaching',
  'Judging',
  'Refereeing',
  'Event Setup',
  'Bilingual (Spanish)',
];

/** Demo logins shown on the sign-in screen and in the README. */
export const DEMO_ACCOUNTS = [
  {
    key: 'owner',
    label: 'Alex — Owner + volunteer',
    email: 'alex.morgan@robolutionclt.org',
    password: 'Onboard2026',
  },
  {
    key: 'coordinator',
    label: 'Maya — Coordinator',
    email: 'maya.chen@example.com',
    password: 'Volunteer2026',
  },
  {
    key: 'volunteer',
    label: 'Jordan — Volunteer',
    email: 'jordan.rivera@example.com',
    password: 'Volunteer2026',
  },
] as const;

/**
 * Tiny non-cryptographic hash used ONLY by the mock layer to avoid storing plaintext.
 * The real API uses bcrypt (FR-1, NFR-7).
 * @param text - Input text.
 * @returns A hex digest string.
 */
export function mockHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a$${(h >>> 0).toString(16)}`;
}

/**
 * Mulberry32 seeded PRNG — deterministic demo data.
 * @param seed - Integer seed.
 * @returns A function returning floats in [0, 1).
 */
function createRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Moves a date forward to the next given weekday (inclusive).
 * @param iso - Starting date.
 * @param weekday - Target day, 0 = Sunday.
 * @returns The first date on or after `iso` that falls on `weekday`.
 */
function nextWeekday(iso: string, weekday: number): string {
  let d = iso;
  while (parseDate(d).getDay() !== weekday) d = addDays(d, 1);
  return d;
}

const FIRST = [
  'Jordan',
  'Maya',
  'Ethan',
  'Priya',
  'Marcus',
  'Sofia',
  'Tyler',
  'Aaliyah',
  'Daniel',
  'Grace',
  'Isaiah',
  'Chloe',
  'Kevin',
  'Nia',
  'Lucas',
  'Amara',
  'Ryan',
  'Elena',
  'Andre',
  'Hannah',
  'Omar',
  'Lily',
  'Caleb',
  'Zara',
  'Noah',
  'Jasmine',
  'Owen',
  'Talia',
];
const LAST = [
  'Rivera',
  'Chen',
  'Brooks',
  'Patel',
  'Johnson',
  'Ramirez',
  'Nguyen',
  'Williams',
  'Okafor',
  'Kim',
  'Thompson',
  'Davis',
  'Lopez',
  'Hughes',
  'Martin',
  'Bello',
  'Carter',
  'Morales',
  'Price',
  'Foster',
  'Haddad',
  'Park',
  'Bennett',
  'Ali',
  'Reed',
  'Coleman',
  'Shaw',
  'Grant',
];
const AFFILIATIONS = [
  'UNC Charlotte',
  'Central Piedmont CC',
  'Johnson C. Smith University',
  'Ardrey Kell High School (student)',
  'Myers Park High School (student)',
  'Duke Energy (professional)',
  'Bank of America (professional)',
  "Lowe's Tech (professional)",
  'Davidson College',
  'Retired engineer',
];
const ZIPS = [
  '28202',
  '28203',
  '28205',
  '28206',
  '28208',
  '28210',
  '28211',
  '28212',
  '28213',
  '28215',
  '28216',
  '28217',
  '28226',
  '28262',
  '28269',
  '28277',
];
const TOPICS = [
  'Intro to VEX IQ parts',
  'Build: drivetrain basics',
  'Block coding: first moves',
  'Sensors: bumper & touch LED',
  'Gear ratios challenge',
  'Claw & lift mechanisms',
  'Autonomous routines',
  'Driver practice & strategy',
  'Engineering notebook',
  'Python with VEXcode',
  'Team challenge scrimmage',
  'Debugging & iteration',
];

/** Indices into FIRST/LAST with special demo roles. */
const JORDAN = 0;
const MAYA = 1;
const PRIYA = 3;
const MARCUS = 4;
/** People who volunteer with BOTH orgs (cross-org standing). */
const QUEEN_CITY_VOLUNTEERS = [6, 7, 8, 9, 10, 11];

/** Options for {@link buildSeed}. */
export interface SeedOptions {
  /** Anchor date — everything is generated relative to it (injectable for tests). */
  today?: string;
  /** Password hasher. The server passes bcrypt; tests use the fast {@link mockHash}. */
  hash?: (password: string) => string;
}

/**
 * Builds a fresh, deterministic demo dataset.
 * @param options - Anchor date and password hasher.
 * @returns Every table, populated.
 */
export function buildSeed(options: SeedOptions = {}): DataSnapshot {
  const today = options.today ?? todayIso();
  // Only a few distinct demo passwords exist, so hash each once (bcrypt is deliberately slow).
  const hashCache = new Map<string, string>();
  const hashOf = (pw: string) =>
    hashCache.get(pw) ??
    (hashCache.set(pw, (options.hash ?? mockHash)(pw)), hashCache.get(pw) as string);
  const rng = createRng(20262027);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const sample = <T>(arr: readonly T[], n: number): T[] =>
    [...arr].sort(() => rng() - 0.5).slice(0, n);
  let seq = 1;
  const id = (prefix: string) => `${prefix}_${(seq++).toString(36)}`;

  // ---- Organizations ----
  const robolution: Organization = {
    id: id('org'),
    name: 'Robolution CLT',
    timezone: 'America/New_York',
    description: 'Free VEX IQ robotics enrichment for grades 4–9 at Title I schools in Charlotte.',
    createdAt: addDays(today, -900),
    settings: {
      ...defaultSettings(OrgSector.STEM),
      skills: [...ROBOLUTION_SKILLS],
      skillNotes: {
        'VEX Build': 'Helping students assemble robots from VEX IQ parts.',
        'Block Coding': 'Guiding students through VEXcode drag-and-drop blocks.',
        Judging: 'Scoring engineering notebooks and interviews at events.',
      },
      eventRoles: ['Referee', 'Judge', 'Field Setup', 'Check-in', 'Emcee'],
    },
  };
  const queenCity: Organization = {
    id: id('org'),
    name: 'Queen City STEM Alliance',
    timezone: 'America/New_York',
    description: 'Hosts regional STEM fairs and robotics scrimmages across Mecklenburg County.',
    createdAt: addDays(today, -400),
    settings: {
      ...defaultSettings(OrgSector.STEM),
      features: { equipment: false, prioritySites: true, guests: true },
      skills: ['Judging', 'Refereeing', 'Event Setup', 'Teaching'],
      eventRoles: ['Judge', 'Referee', 'Check-in', 'Emcee'],
    },
  };
  const organizations = [robolution, queenCity];

  // ---- Requirements checklists (Phase 3): each org decides what volunteers must complete ----
  const requirements: Requirement[] = [];
  const requirement = (
    orgId: string,
    name: string,
    description: string,
    validMonths?: number,
  ): Requirement => {
    const r: Requirement = {
      id: id('req'),
      orgId,
      name,
      description,
      validMonths,
      position: requirements.filter((x) => x.orgId === orgId).length,
      archived: false,
    };
    requirements.push(r);
    return r;
  };
  const rcTraining = requirement(
    robolution.id,
    'Volunteer training',
    'Two-hour orientation: lesson flow, VEX IQ basics and classroom management.',
  );
  const rcBackground = requirement(
    robolution.id,
    'Background check',
    'Criminal background check through the school district portal.',
    24,
  );
  const rcYouth = requirement(
    robolution.id,
    'Youth protection course',
    'Online youth-safety course, renewed every year.',
    12,
  );
  const qcBackground = requirement(
    queenCity.id,
    'Background check',
    'Any background check from the last two years is accepted.',
    24,
  );
  const qcBriefing = requirement(
    queenCity.id,
    'Judge & referee briefing',
    'Season rules briefing for scrimmage judges and referees.',
    12,
  );
  /** Requirements a volunteer finishes at each step: training first, the checks before ACTIVE. */
  const stepsFor = (orgId: string) =>
    orgId === robolution.id
      ? { trained: [rcTraining], cleared: [rcBackground, rcYouth] }
      : { trained: [qcBriefing], cleared: [qcBackground] };

  // ---- People (identity + reusable profile) ----
  const users: StoredUser[] = [];
  const profiles: VolunteerProfile[] = [];
  const orgVolunteers: OrgVolunteer[] = [];
  const memberships: Membership[] = [];
  const order = [
    VolunteerStatus.APPLIED,
    VolunteerStatus.INTERVIEWED,
    VolunteerStatus.TRAINED,
    VolunteerStatus.ACTIVE,
    VolunteerStatus.INACTIVE,
  ];

  /**
   * Records a volunteer standing with a plausible pipeline history.
   * @param orgId - Org.
   * @param userId - Person.
   * @param status - Current status.
   * @param joined - Date they applied.
   * @param by - Who moved them through the pipeline.
   */
  const addStanding = (
    orgId: string,
    userId: string,
    status: VolunteerStatus,
    joined: string,
    by: string,
  ) => {
    const history: OrgVolunteer['statusHistory'] = [
      {
        id: id('sc'),
        fromStatus: null,
        toStatus: VolunteerStatus.APPLIED,
        changedBy: 'Public form',
        changedAt: `${joined}T10:00:00`,
      },
    ];
    for (let s = 1; s <= order.indexOf(status); s++)
      history.push({
        id: id('sc'),
        fromStatus: order[s - 1],
        toStatus: order[s],
        changedBy: by,
        changedAt: `${addDays(joined, s * 7)}T15:00:00`,
      });
    const trained =
      status === VolunteerStatus.ACTIVE ||
      status === VolunteerStatus.TRAINED ||
      status === VolunteerStatus.INACTIVE;
    const cleared = status === VolunteerStatus.ACTIVE || status === VolunteerStatus.INACTIVE;
    const steps = stepsFor(orgId);
    const done = [...(trained ? steps.trained : []), ...(cleared ? steps.cleared : [])];
    orgVolunteers.push({
      id: id('ov'),
      orgId,
      userId,
      status,
      createdAt: joined,
      statusHistory: history,
      requirements: done.map((r, k) => {
        // Renew anything that would have lapsed already, so most volunteers are current.
        let completedAt = addDays(joined, 14 + k * 2);
        if ((expiryFor(completedAt, r.validMonths) ?? '9999') < today)
          completedAt = addDays(today, -(40 + Math.floor(rng() * 250)));
        return {
          requirementId: r.id,
          completedAt,
          expiresAt: expiryFor(completedAt, r.validMonths),
          recordedBy: by,
        };
      }),
    });
  };

  /**
   * Creates a person with a profile.
   * @param first - First name.
   * @param last - Last name.
   * @param email - Login email.
   * @param password - Demo password.
   * @param created - Account creation date.
   * @returns The new user id.
   */
  const addPerson = (
    first: string,
    last: string,
    email: string,
    password: string,
    created: string,
  ) => {
    const userId = id('usr');
    users.push({
      id: userId,
      firstName: first,
      lastName: last,
      email,
      phone: `(704) 555-${String(1000 + users.length * 37).slice(-4)}`,
      zip: pick(ZIPS),
      createdAt: created,
      tourCompleted: false,
      passwordHash: hashOf(password),
    });
    const availability: Availability[] = sample([1, 2, 3, 4, 5], 2 + Math.floor(rng() * 2)).map(
      (d) => ({ id: id('av'), dayOfWeek: d, startTime: '14:30', endTime: '18:00' }),
    );
    if (rng() > 0.45)
      availability.push({ id: id('av'), dayOfWeek: 6, startTime: '08:00', endTime: '17:00' });
    const lvl =
      users.length % 3 === 1
        ? ExperienceLevel.VETERAN
        : users.length % 3 === 2
          ? ExperienceLevel.INTERMEDIATE
          : ExperienceLevel.NEW;
    profiles.push({
      id: id('vp'),
      userId,
      affiliation: pick(AFFILIATIONS),
      experienceLevel: lvl,
      hasTransportation: rng() > 0.25,
      bio:
        users.length % 4 === 1
          ? 'Competed in VEX in high school; comfortable leading small groups.'
          : '',
      skills: sample(ROBOLUTION_SKILLS, 2 + Math.floor(rng() * 3)),
      availability,
    });
    return userId;
  };

  // Alex Morgan: Robolution co-founder.
  const alexId = addPerson(
    'Alex',
    'Morgan',
    DEMO_ACCOUNTS[0].email,
    DEMO_ACCOUNTS[0].password,
    addDays(today, -900),
  );
  const alexProfile = profiles[profiles.length - 1];
  alexProfile.skills = ['VEX Build', 'Python', 'Teaching', 'Judging'];
  alexProfile.experienceLevel = ExperienceLevel.VETERAN;
  alexProfile.affiliation = 'Robolution CLT (co-founder)';
  alexProfile.availability = [3, 6].map((d) => ({
    id: id('av'),
    dayOfWeek: d,
    startTime: d === 6 ? '08:00' : '14:00',
    endTime: d === 6 ? '17:00' : '18:00',
  }));
  addStanding(robolution.id, alexId, VolunteerStatus.ACTIVE, addDays(today, -880), 'Alex Morgan');

  // 28 community volunteers with Robolution standing.
  const people = FIRST.map((first, i) => {
    const created = addDays(today, -(220 - i * 6));
    const userId = addPerson(
      first,
      LAST[i],
      `${first.toLowerCase()}.${LAST[i].toLowerCase()}@example.com`,
      'Volunteer2026',
      created,
    );
    const status =
      i < 18
        ? VolunteerStatus.ACTIVE
        : i < 21
          ? VolunteerStatus.TRAINED
          : i < 24
            ? VolunteerStatus.INTERVIEWED
            : i < 26
              ? VolunteerStatus.APPLIED
              : VolunteerStatus.INACTIVE;
    addStanding(robolution.id, userId, status, created, 'Alex Morgan');
    return userId;
  });
  // Jordan (the demo volunteer) gets a predictable profile for the walkthrough.
  const jordanProfile = profiles.find((p) => p.userId === people[JORDAN]) as VolunteerProfile;
  jordanProfile.skills = ['VEX Build', 'Block Coding', 'Teaching', 'Judging'];
  jordanProfile.availability = [1, 2, 4].map((d) => ({
    id: id('av'),
    dayOfWeek: d,
    startTime: '14:00',
    endTime: '18:00',
  }));
  jordanProfile.availability.push({
    id: id('av'),
    dayOfWeek: 6,
    startTime: '08:00',
    endTime: '17:00',
  });
  const todayDow = parseDate(today).getDay();
  if (
    !jordanProfile.availability.some(
      (a) => a.dayOfWeek === todayDow && a.startTime <= '14:00' && a.endTime >= '17:00',
    )
  ) {
    jordanProfile.availability.push({
      id: id('av'),
      dayOfWeek: todayDow,
      startTime: '13:00',
      endTime: '18:00',
    });
  }
  (users.find((u) => u.id === people[JORDAN]) as StoredUser).zip = '28205';

  // Queen City standing for a handful of people (they serve BOTH orgs).
  for (const i of QUEEN_CITY_VOLUNTEERS)
    addStanding(
      queenCity.id,
      people[i],
      VolunteerStatus.ACTIVE,
      addDays(today, -200 + i),
      'Priya Patel',
    );
  addStanding(queenCity.id, people[20], VolunteerStatus.APPLIED, addDays(today, -4), 'Priya Patel');

  // Two requirement states worth demoing: a course about to lapse and an expired check.
  const setCompletion = (userId: string, r: Requirement, completedAt: string) => {
    const ov = orgVolunteers.find((o) => o.orgId === r.orgId && o.userId === userId);
    const c = ov?.requirements.find((x) => x.requirementId === r.id);
    if (c) Object.assign(c, { completedAt, expiresAt: expiryFor(completedAt, r.validMonths) });
  };
  setCompletion(people[5], rcYouth, addDays(today, -352)); // expires in about two weeks
  setCompletion(people[12], rcBackground, addDays(today, -745)); // lapsed a couple of weeks ago

  // ---- Memberships: roles are relationships, not account types ----
  const member = (orgId: string, userId: string, orgRole: OrgRole, days: number) =>
    memberships.push({ id: id('mem'), orgId, userId, orgRole, createdAt: addDays(today, -days) });
  member(robolution.id, alexId, OrgRole.OWNER, 900);
  member(robolution.id, people[MARCUS], OrgRole.ADMIN, 300);
  member(robolution.id, people[MAYA], OrgRole.COORDINATOR, 120);
  member(queenCity.id, people[PRIYA], OrgRole.OWNER, 400);
  member(queenCity.id, alexId, OrgRole.COORDINATOR, 90);

  // ---- Robolution schools & programs (fictional names, real program structure) ----
  const schoolDefs: Array<Omit<Site, 'id' | 'archived' | 'orgId'>> = [
    {
      name: 'Briarwood Elementary',
      address: '1001 Briarwood Rd, Charlotte, NC',
      zip: '28215',
      priority: true,
      rangeMin: 4,
      rangeMax: 5,
      contactName: 'Denise Walker',
      contactEmail: 'dwalker@briarwood.example.org',
    },
    {
      name: 'Westerly Hills Academy',
      address: '4420 Westerly Hills Dr, Charlotte, NC',
      zip: '28208',
      priority: true,
      rangeMin: 4,
      rangeMax: 8,
      contactName: 'Marcus Hill',
      contactEmail: 'mhill@westerly.example.org',
    },
    {
      name: 'Eastway Middle School',
      address: '3800 Eastway Dr, Charlotte, NC',
      zip: '28205',
      priority: true,
      rangeMin: 6,
      rangeMax: 8,
      contactName: 'Angela Torres',
      contactEmail: 'atorres@eastway.example.org',
    },
    {
      name: 'Northridge Middle School',
      address: '7601 Northridge Rd, Charlotte, NC',
      zip: '28213',
      priority: true,
      rangeMin: 6,
      rangeMax: 8,
      contactName: 'Kevin Osei',
      contactEmail: 'kosei@northridge.example.org',
    },
    {
      name: 'Sedgefield STEM Magnet',
      address: '715 Sedgefield Rd, Charlotte, NC',
      zip: '28209',
      priority: false,
      rangeMin: 4,
      rangeMax: 6,
      contactName: 'Rachel Kim',
      contactEmail: 'rkim@sedgefield.example.org',
    },
    {
      name: 'University Park Creative Arts',
      address: '2400 University Park Ln, Charlotte, NC',
      zip: '28216',
      priority: true,
      rangeMin: 4,
      rangeMax: 8,
      contactName: 'Lamar Greene',
      contactEmail: 'lgreene@upca.example.org',
    },
  ];
  const sites: Site[] = schoolDefs.map((s) => ({
    ...s,
    id: id('site'),
    orgId: robolution.id,
    archived: false,
  }));
  const programs: Program[] = sites.map((s, i) => ({
    id: id('prg'),
    siteId: s.id,
    name: `${s.name.split(' ')[0]} Robotics Club`,
    type: ProgramType.ONGOING,
    startDate: addDays(today, -84),
    endDate: addDays(today, 180),
    participantCount: 14 + Math.floor(rng() * 12),
    targetRatio: i % 2 === 0 ? 6 : 8,
    description: 'VEX IQ Foundations + Competition Prep',
    archived: false,
    oneOff: false,
  }));
  programs.push(
    {
      id: id('prg'),
      siteId: sites[0].id,
      name: 'Summer Robotics Camp — Session A',
      type: ProgramType.SEASONAL,
      startDate: addDays(today, -150),
      endDate: addDays(today, -136),
      participantCount: 24,
      targetRatio: 6,
      description: 'Two-week VEX IQ intensive',
      archived: false,
      oneOff: false,
    },
    {
      id: id('prg'),
      siteId: sites[2].id,
      name: 'Summer Robotics Camp — Session B',
      type: ProgramType.SEASONAL,
      startDate: addDays(today, -128),
      endDate: addDays(today, -114),
      participantCount: 20,
      targetRatio: 6,
      description: 'Two-week VEX IQ intensive',
      archived: false,
      oneOff: false,
    },
  );

  // ---- Queen City school & program ----
  const ridgeview: Site = {
    id: id('site'),
    orgId: queenCity.id,
    name: 'Ridgeview Middle School',
    address: '9100 Ridgeview Pkwy, Charlotte, NC',
    zip: '28262',
    priority: true,
    rangeMin: 6,
    rangeMax: 8,
    contactName: 'Tasha Greene',
    contactEmail: 'tgreene@ridgeview.example.org',
    archived: false,
  };
  sites.push(ridgeview);
  const qcProgram: Program = {
    id: id('prg'),
    siteId: ridgeview.id,
    name: 'Ridgeview Scrimmage Series',
    type: ProgramType.ONGOING,
    startDate: addDays(today, -40),
    endDate: addDays(today, 140),
    participantCount: 32,
    targetRatio: 8,
    description: 'VEX IQ competition practice',
    archived: false,
    oneOff: false,
  };
  programs.push(qcProgram);

  // ---- Sessions ----
  const sessions: Session[] = [];
  const base = { roleSlots: [], openToGuests: false };
  programs.forEach((p, pi) => {
    if (p.type === ProgramType.SEASONAL) {
      for (let d = 0; d <= 11; d++) {
        const date = addDays(p.startDate, d);
        const dow = parseDate(date).getDay();
        if (dow === 0 || dow === 6) continue;
        sessions.push({
          ...base,
          id: id('ses'),
          programId: p.id,
          type: SessionType.SHIFT,
          date,
          startTime: '09:00',
          endTime: '12:00',
          title: TOPICS[d % TOPICS.length],
          requiredSkills: ['VEX Build'],
          volunteersNeeded: 4,
          status: SessionStatus.COMPLETED,
        });
      }
      return;
    }
    const weekday = p === qcProgram ? 3 : 1 + (pi % 4);
    let date = nextWeekday(p.startDate, weekday);
    for (let lesson = 0; date <= addDays(today, 42); date = addDays(date, 7), lesson++) {
      sessions.push({
        ...base,
        id: id('ses'),
        programId: p.id,
        type: SessionType.SHIFT,
        date,
        startTime: p === qcProgram ? '16:00' : '15:00',
        endTime: p === qcProgram ? '17:30' : '16:30',
        title: TOPICS[lesson % TOPICS.length],
        requiredSkills: sample(
          ['VEX Build', 'Block Coding', 'Python', 'Teaching'],
          1 + (lesson % 2),
        ),
        volunteersNeeded: Math.ceil(p.participantCount / (p.targetRatio ?? 6)),
        status: date < today ? SessionStatus.COMPLETED : SessionStatus.SCHEDULED,
      });
    }
  });
  const showcase: Session = {
    id: id('ses'),
    programId: programs[1].id,
    type: SessionType.EVENT,
    date: nextWeekday(addDays(today, 20), 6),
    startTime: '08:30',
    endTime: '14:00',
    title: 'Robolution Winter Showcase Tournament',
    requiredSkills: ['Refereeing', 'Judging', 'Event Setup'],
    volunteersNeeded: 12,
    status: SessionStatus.SCHEDULED,
    openToGuests: false,
    roleSlots: [
      { role: 'Referee', needed: 3 },
      { role: 'Judge', needed: 4 },
      { role: 'Field Setup', needed: 2 },
      { role: 'Check-in', needed: 2 },
      { role: 'Emcee', needed: 1 },
    ],
  };
  const orientation: Session = {
    ...base,
    id: id('ses'),
    programId: programs[0].id,
    type: SessionType.TRAINING,
    date: nextWeekday(addDays(today, 6), 6),
    startTime: '10:00',
    endTime: '12:00',
    title: 'New Volunteer Orientation & Youth Safety',
    requiredSkills: [],
    volunteersNeeded: 15,
    status: SessionStatus.SCHEDULED,
  };
  const buildLab: Session = {
    ...base,
    id: id('ses'),
    programId: programs[2].id,
    type: SessionType.SHIFT,
    date: today,
    startTime: '14:00',
    endTime: '17:00',
    title: 'Open Build Lab',
    requiredSkills: ['VEX Build'],
    volunteersNeeded: 4,
    status: SessionStatus.SCHEDULED,
  };
  // Queen City's public scrimmage: OPEN TO GUESTS, so anyone can judge or referee once.
  const scrimmage: Session = {
    id: id('ses'),
    programId: qcProgram.id,
    type: SessionType.EVENT,
    date: nextWeekday(addDays(today, 13), 6),
    startTime: '09:00',
    endTime: '15:00',
    title: 'Queen City Regional VEX IQ Scrimmage',
    requiredSkills: ['Judging', 'Refereeing'],
    volunteersNeeded: 9,
    status: SessionStatus.SCHEDULED,
    openToGuests: true,
    roleSlots: [
      { role: 'Judge', needed: 4 },
      { role: 'Referee', needed: 3 },
      { role: 'Check-in', needed: 1 },
      { role: 'Emcee', needed: 1 },
    ],
  };
  // A one-time event (no repeating program): it lives in Briarwood's hidden "One-time events"
  // program, the same way the app files one-offs created from the session form.
  const fundraiserDate = nextWeekday(addDays(today, 24), 5);
  const oneOff: Program = {
    id: id('prg'),
    siteId: sites[0].id,
    name: 'One-time events',
    type: ProgramType.SEASONAL,
    startDate: fundraiserDate,
    endDate: fundraiserDate,
    participantCount: 0,
    description: 'Events that happen once, like a fundraiser or a cleanup day.',
    archived: false,
    oneOff: true,
  };
  programs.push(oneOff);
  const fundraiser: Session = {
    ...base,
    id: id('ses'),
    programId: oneOff.id,
    type: SessionType.EVENT,
    date: fundraiserDate,
    startTime: '17:30',
    endTime: '20:00',
    title: 'Family STEM Night fundraiser',
    requiredSkills: ['Event Setup'],
    volunteersNeeded: 6,
    status: SessionStatus.SCHEDULED,
  };
  sessions.push(showcase, orientation, buildLab, scrimmage, fundraiser);

  // ---- Sign-ups, attendance and hours ----
  const sessionOrg = new Map<string, string>();
  const siteOrg = new Map(sites.map((s) => [s.id, s.orgId]));
  const programSite = new Map(programs.map((p) => [p.id, p.siteId]));
  for (const s of sessions)
    sessionOrg.set(s.id, siteOrg.get(programSite.get(s.programId) as string) as string);
  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const activeIn = (orgId: string) =>
    orgVolunteers
      .filter((o) => o.orgId === orgId && o.status === VolunteerStatus.ACTIVE)
      .map((o) => o.userId);
  const booked = new Map<string, Array<{ date: string; start: string; end: string }>>();
  const isFree = (uid: string, s: Session) =>
    !(booked.get(uid) ?? []).some(
      (b) => b.date === s.date && b.start < s.endTime && s.startTime < b.end,
    );
  const covers = (uid: string, s: Session) =>
    (profileOf.get(uid)?.availability ?? []).some(
      (a) =>
        a.dayOfWeek === parseDate(s.date).getDay() &&
        a.startTime <= s.startTime &&
        a.endTime >= s.endTime,
    );
  const reliability = new Map(
    users.map((u, i) => [u.id, i % 7 === 4 ? 0.65 : 0.88 + rng() * 0.12]),
  );
  const quiet = new Set([people[15], people[16], people[17]]);
  const signUps: SignUp[] = [];
  const hourLogs: HourLog[] = [];

  /**
   * Books a person into a session, generating attendance and hours for past sessions.
   * @param s - Session.
   * @param uid - Person.
   * @param role - Role slot.
   * @param guest - Whether this is a one-time guest sign-up.
   */
  const book = (s: Session, uid: string, role: string, guest = false) => {
    booked.set(uid, [
      ...(booked.get(uid) ?? []),
      { date: s.date, start: s.startTime, end: s.endTime },
    ]);
    const su: SignUp = {
      id: id('su'),
      sessionId: s.id,
      userId: uid,
      role,
      status: SignUpStatus.SIGNED_UP,
      guest,
      createdAt: addDays(s.date, -10),
    };
    if (s.date < today) {
      if (rng() < (reliability.get(uid) ?? 0.9)) {
        su.status = SignUpStatus.COMPLETED;
        su.checkInAt = `${s.date}T${s.startTime}:00`;
        su.checkOutAt = `${s.date}T${s.endTime}:00`;
        const recent = s.date > addDays(today, -10);
        hourLogs.push({
          id: id('hl'),
          userId: uid,
          orgId: sessionOrg.get(s.id) as string,
          sessionId: s.id,
          date: s.date,
          hours: durationHours(s.startTime, s.endTime),
          description: s.title,
          status: recent && rng() < 0.6 ? HourStatus.PENDING : HourStatus.APPROVED,
          autoGenerated: true,
          reviewedBy: recent ? undefined : 'Alex Morgan',
        });
      } else su.status = SignUpStatus.NO_SHOW;
    }
    signUps.push(su);
  };

  for (const s of sessions) {
    if (s.type === SessionType.TRAINING || s === buildLab) continue;
    const future = s.date >= today;
    const fillRate = future
      ? s.date <= addDays(today, 7)
        ? 0.45 + rng() * 0.6
        : 0.2 + rng() * 0.5
      : 1;
    const target = Math.min(s.volunteersNeeded, Math.round(s.volunteersNeeded * fillRate));
    const pool = sample(activeIn(sessionOrg.get(s.id) as string), 999).filter(
      (uid) => !future || covers(uid, s),
    );
    let filled = 0;
    for (const uid of pool) {
      if (filled >= target) break;
      if (!isFree(uid, s)) continue;
      if (quiet.has(uid) && s.date > addDays(today, -40)) continue;
      if (uid === people[JORDAN] && future && s.date <= addDays(today, 3)) continue; // keep Jordan's week open for the demo
      book(
        s,
        uid,
        s.roleSlots.length ? s.roleSlots[filled % s.roleSlots.length].role : DEFAULT_ROLE,
      );
      filled++;
    }
  }
  // Today's build lab: Jordan + one other, so check-in can be demoed live (FR-16).
  book(buildLab, people[JORDAN], DEFAULT_ROLE);
  // Jordan's one-time GUEST sign-up at Queen City (not added to Jordan's org switcher).
  if (isFree(people[JORDAN], scrimmage)) book(scrimmage, people[JORDAN], 'Judge', true);

  // One full upcoming Robolution lesson with a waitlist (FR-14).
  const fullTarget = sessions.find(
    (s) =>
      sessionOrg.get(s.id) === robolution.id &&
      s.status === SessionStatus.SCHEDULED &&
      s.type === SessionType.SHIFT &&
      s.date > addDays(today, 8),
  );
  if (fullTarget) {
    let pos = 1;
    for (const uid of activeIn(robolution.id)) {
      if (
        signUps.some((x) => x.sessionId === fullTarget.id && x.userId === uid) ||
        !isFree(uid, fullTarget)
      )
        continue;
      const seated = signUps.filter(
        (x) => x.sessionId === fullTarget.id && x.status === SignUpStatus.SIGNED_UP,
      ).length;
      const waitlisted = seated >= fullTarget.volunteersNeeded;
      signUps.push({
        id: id('su'),
        sessionId: fullTarget.id,
        userId: uid,
        role: DEFAULT_ROLE,
        status: waitlisted ? SignUpStatus.WAITLISTED : SignUpStatus.SIGNED_UP,
        guest: false,
        waitlistPosition: waitlisted ? pos++ : undefined,
        createdAt: addDays(today, -3),
      });
      booked.set(uid, [
        ...(booked.get(uid) ?? []),
        { date: fullTarget.date, start: fullTarget.startTime, end: fullTarget.endTime },
      ]);
      if (pos > 2) break;
    }
  }
  // Manual hour logs (outreach events), some pending.
  hourLogs.push(
    {
      id: id('hl'),
      userId: people[JORDAN],
      orgId: robolution.id,
      date: addDays(today, -12),
      hours: 3,
      description: 'STEM night outreach booth at library',
      status: HourStatus.PENDING,
      autoGenerated: false,
    },
    {
      id: id('hl'),
      userId: people[2],
      orgId: robolution.id,
      date: addDays(today, -5),
      hours: 2,
      description: 'Kit inventory and repairs',
      status: HourStatus.PENDING,
      autoGenerated: false,
    },
    {
      id: id('hl'),
      userId: people[MARCUS],
      orgId: robolution.id,
      date: addDays(today, -30),
      hours: 4,
      description: 'Curriculum prep: sensor lesson',
      status: HourStatus.APPROVED,
      autoGenerated: false,
      reviewedBy: 'Alex Morgan',
    },
  );

  // ---- Equipment: Robolution lends robot kits ----
  const equipment: Equipment[] = Array.from({ length: 24 }, (_, i) => {
    const prog = i < 18 ? programs[i % 6] : undefined;
    const condition =
      i === 7
        ? EquipmentCondition.NEEDS_REPAIR
        : i === 13
          ? EquipmentCondition.MISSING_PARTS
          : i === 23
            ? EquipmentCondition.RETIRED
            : EquipmentCondition.GOOD;
    return {
      id: id('eq'),
      orgId: robolution.id,
      assetTag: `RC-${String(i + 1).padStart(4, '0')}`,
      name: i % 3 === 0 ? 'VEX IQ 2nd Gen Competition Kit' : 'VEX IQ 2nd Gen Education Kit',
      condition,
      programId: condition === EquipmentCondition.RETIRED ? undefined : prog?.id,
      checkedOutAt: prog ? addDays(today, -80) : undefined,
    };
  });

  const presets: FilterPreset[] = [
    {
      id: id('fp'),
      userId: alexId,
      name: 'Title I · needs volunteers · next 14 days',
      filters: { priorityOnly: true, needsVolunteersOnly: true, withinDays: 14 },
    },
    { id: id('fp'), userId: people[JORDAN], name: 'Saturday events', filters: { dayOfWeek: 6 } },
  ];

  return {
    organizations,
    users,
    memberships,
    profiles,
    orgVolunteers,
    requirements,
    sites,
    programs,
    sessions,
    signUps,
    hourLogs,
    equipment,
    presets,
    offers: [],
  };
}

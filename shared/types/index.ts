/**
 * @file Shared entity types and DTOs (§2.5).
 *
 * Identity is separated from organization and from volunteering:
 *  - {@link User} is a pure identity (one login per person, no role).
 *  - {@link Membership} grants management rights in ONE org (Owner / Admin / Coordinator).
 *  - {@link OrgVolunteer} is a person's volunteer standing in ONE org (pipeline, training).
 *  - {@link VolunteerProfile} holds reusable attributes (skills, availability) once per person.
 *  - {@link SignUp} and {@link HourLog} attach to the person, so they can serve any org.
 *
 * Dates travel as `YYYY-MM-DD` and times as 24-hour `HH:mm` so the JSON contract is identical
 * whether data comes from the mock layer or the real Express API.
 */
import type {
  EquipmentCondition,
  ExperienceLevel,
  HourStatus,
  OrgRole,
  OrgSector,
  ProgramType,
  RangeKind,
  RequirementState,
  RiskLevel,
  SessionStatus,
  SessionType,
  SignUpStatus,
  VolunteerStatus,
} from '../enums';

/** Primary-key type for every entity. */
export type Id = string;

/** Features an org can switch off when they don't apply to it. */
export interface OrgFeatures {
  /** Track lendable equipment (kits, cuffs, ball bags…). */
  equipment: boolean;
  /** Mark some sites as priority sites (e.g. Title I schools, underserved clinics). */
  prioritySites: boolean;
  /** Allow sessions to accept one-time guest volunteers (FR-3d). */
  guests: boolean;
}

/**
 * How an org describes itself: its sector and the words its screens use. A robotics nonprofit
 * says "School · Students · Kit · Title I"; a free clinic "Clinic · Patients · Equipment ·
 * Underserved area"; a youth soccer league "Field · Players · Gear bag · Scholarship site".
 */
export interface OrgSettings {
  sector: OrgSector;
  /** Singular word for a site, e.g. "School", "Clinic", "Field". */
  siteTerm: string;
  /** Plural word for the people served, e.g. "Students", "Patients", "Players". */
  participantTerm: string;
  /** Singular word for an equipment item, e.g. "Kit", "Equipment", "Gear bag". */
  equipmentTerm: string;
  /** Name of the priority flag on sites, e.g. "Title I". */
  priorityLabel: string;
  /** What a site's served range counts. */
  rangeKind: RangeKind;
  features: OrgFeatures;
  /** The org's skill catalog, in display order. */
  skills: string[];
  /** Optional one-line description per skill name, e.g. { Phlebotomy: 'Drawing blood…' }. */
  skillNotes: Record<string, string>;
  /** Role names offered on this org's events, in display order. */
  eventRoles: string[];
}

/** An organization — the tenant that owns sites, programs, sessions and equipment. */
export interface Organization {
  id: Id;
  name: string;
  timezone: string;
  /** One-line description shown in the organization directory. */
  description: string;
  createdAt: string;
  settings: OrgSettings;
}

/**
 * Something a volunteer must complete before serving shifts and events in one org — training,
 * a background check, a TB test, a coaching license… Archived instead of deleted.
 */
export interface Requirement {
  id: Id;
  orgId: Id;
  name: string;
  description: string;
  /** Months a completion stays valid; undefined = never expires. */
  validMonths?: number;
  /** Display order. */
  position: number;
  archived: boolean;
}

/** One volunteer's recorded completion of one requirement. */
export interface RequirementCompletion {
  requirementId: Id;
  completedAt: string;
  /** Date the completion lapses; undefined = never. */
  expiresAt?: string;
  /** Name of the person who recorded it. */
  recordedBy: string;
}

/** A requirement joined with one volunteer's standing on it, for checklists. */
export interface RequirementCheck {
  requirement: Requirement;
  state: RequirementState;
  completedAt?: string;
  expiresAt?: string;
  recordedBy?: string;
}

/** A person's login identity (FR-1). Holds no role — roles are relationships. */
export interface User {
  id: Id;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  zip?: string;
  createdAt: string;
  /** Whether the person has finished the first-run guided tour (FR-30). */
  tourCompleted: boolean;
}

/** Management rights for one person in one org (unique orgId + userId). */
export interface Membership {
  id: Id;
  orgId: Id;
  userId: Id;
  orgRole: OrgRole;
  createdAt: string;
}

/** A recurring weekly window when a person can serve. */
export interface Availability {
  id: Id;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** Reusable volunteer attributes, one per person, shared across every org they serve. */
export interface VolunteerProfile {
  id: Id;
  userId: Id;
  affiliation: string;
  experienceLevel: ExperienceLevel;
  hasTransportation: boolean;
  bio?: string;
  skills: string[];
  availability: Availability[];
}

/** One pipeline transition for audit history (FR-5). */
export interface StatusChange {
  id: Id;
  fromStatus: VolunteerStatus | null;
  toStatus: VolunteerStatus;
  changedBy: string;
  changedAt: string;
  note?: string;
}

/** A person's volunteer standing in one org (unique orgId + userId). */
export interface OrgVolunteer {
  id: Id;
  orgId: Id;
  userId: Id;
  status: VolunteerStatus;
  createdAt: string;
  statusHistory: StatusChange[];
  /** Recorded requirement completions (one per requirement at most). */
  requirements: RequirementCompletion[];
}

/** What ending someone's volunteer place at an org changed, for the confirmation message. */
export interface LeaveResult {
  /** Upcoming sign-ups at the org that were cancelled. */
  cancelledSignUps: number;
  /** Whether they still hold a role (Owner, Admin, Coordinator) there. */
  keepsRole: boolean;
}

/**
 * Read model: a person AS A VOLUNTEER OF ONE ORG — identity + profile + that org's standing,
 * joined by the repository layer. `id` is the person's user id.
 */
export interface Volunteer {
  id: Id;
  orgId: Id;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  zip: string;
  affiliation: string;
  hasTransportation: boolean;
  experienceLevel: ExperienceLevel;
  skills: string[];
  availability: Availability[];
  bio?: string;
  /** Standing in this org, or null when the person has none (e.g. a one-time guest). */
  status: VolunteerStatus | null;
  statusHistory: StatusChange[];
  /** The org's active requirements and where this person stands on each. */
  requirements: RequirementCheck[];
  /** Every active requirement is complete and current (expiring still counts). */
  cleared: boolean;
  /** Date the person joined this org as a volunteer. */
  createdAt: string;
}

/**
 * One row of the volunteers data grid: the volunteer plus per-org metrics that can be summed,
 * averaged, grouped and pivoted.
 */
export interface VolunteerGridRow extends Volunteer {
  /** Days of the week the person is available, e.g. ["Tuesday", "Thursday"]. */
  availableDays: string[];
  /** Requirements complete and current, e.g. 2 of 3. */
  requirementsDone: number;
  /** Active requirements in this org. */
  requirementsTotal: number;
  /** Sessions completed in this org. */
  sessionsCompleted: number;
  /** No-shows in this org. */
  noShows: number;
  /** completed ÷ (completed + no-shows), 0–100; null with no history. */
  attendancePct: number | null;
  /** Approved service hours in this org. */
  approvedHours: number;
  /** Hours waiting for review in this org. */
  pendingHours: number;
  /** Date of the last completed session in this org. */
  lastSessionDate: string | null;
}

/** The signed-in person's own profile: identity + reusable volunteer attributes. */
export interface MyProfile extends User {
  profile: VolunteerProfile;
}

/**
 * One row of the org switcher: an org the person is PART OF — a Membership and/or an ongoing
 * volunteer standing. One-time guest sign-ups never create an affiliation (FR-3d).
 */
export interface OrgAffiliation {
  org: Organization;
  /** Management role, or null if the person only volunteers here. */
  role: OrgRole | null;
  /** Volunteer standing, or null if the person only manages here. */
  volunteerStatus: VolunteerStatus | null;
}

/** An org in the public directory, with the viewer's relationship to it (if any). */
export interface OrgDirectoryEntry {
  org: Organization;
  role: OrgRole | null;
  volunteerStatus: VolunteerStatus | null;
  volunteerCount: number;
}

/** A member row for the Members screen. */
export interface MemberView {
  membership: Membership;
  user: User;
}

/**
 * A place where the org serves (FR-9): a school, clinic, field, pantry… Owned by one org; name
 * unique within that org. What it is called comes from {@link OrgSettings.siteTerm}.
 */
export interface Site {
  id: Id;
  orgId: Id;
  name: string;
  address: string;
  zip: string;
  /** Flagged as a priority site (the org names the flag, e.g. "Title I"). */
  priority: boolean;
  /** Lowest grade/age served, when the org keeps a range. */
  rangeMin?: number;
  /** Highest grade/age served, when the org keeps a range. */
  rangeMax?: number;
  contactName: string;
  contactEmail: string;
  archived: boolean;
}

/** A program run at a site (FR-10). */
export interface Program {
  id: Id;
  siteId: Id;
  name: string;
  type: ProgramType;
  startDate: string;
  endDate: string;
  /** People served per session (students, patients, players…). */
  participantCount: number;
  /** Participants per volunteer, e.g. 6 means 1 volunteer : 6 participants. Optional. */
  targetRatio?: number;
  /** What the program covers. */
  description: string;
  archived: boolean;
  /**
   * The hidden "One-time events" program of a site: it holds one-off sessions (a fundraiser, a
   * cleanup day) that don't belong to a repeating program. Never shown as a program.
   */
  oneOff: boolean;
}

/** A role slot on an event session (FR-12). `role` is one of the org's event roles. */
export interface RoleSlot {
  role: string;
  needed: number;
}

/** A single scheduled session (FR-11). */
export interface Session {
  id: Id;
  programId: Id;
  type: SessionType;
  date: string;
  startTime: string;
  endTime: string;
  /** What happens in the session, e.g. "Intro to sensors", "Flu shot clinic". */
  title: string;
  requiredSkills: string[];
  volunteersNeeded: number;
  status: SessionStatus;
  roleSlots: RoleSlot[];
  /** Allows one-time guest volunteers without ongoing standing in the org (FR-3d). */
  openToGuests: boolean;
}

/** A person's sign-up for a session (any org's session). */
export interface SignUp {
  id: Id;
  sessionId: Id;
  userId: Id;
  role: string;
  status: SignUpStatus;
  /** True when the person had no ongoing standing in the session's org (guest sign-up). */
  guest: boolean;
  waitlistPosition?: number;
  checkInAt?: string;
  checkOutAt?: string;
  createdAt: string;
}

/** A record of service hours (FR-18). Belongs to the person and the org served. */
export interface HourLog {
  id: Id;
  userId: Id;
  orgId: Id;
  sessionId?: Id;
  date: string;
  hours: number;
  description: string;
  status: HourStatus;
  /** `true` when generated from check-in/out rather than entered manually. */
  autoGenerated: boolean;
  reviewedBy?: string;
  reviewNote?: string;
}

/** A lendable equipment item (FR-21): a robot kit, a blood-pressure cuff, a gear bag… */
export interface Equipment {
  id: Id;
  orgId: Id;
  assetTag: string;
  name: string;
  condition: EquipmentCondition;
  programId?: Id;
  checkedOutAt?: string;
}

/** A roster entry: a sign-up joined with the person's view in the session's org. */
export type RosterEntry = SignUp & { volunteer: Volunteer };

/** Session joined with its program, site, org and staffing numbers — used by most screens. */
export interface SessionView extends Session {
  org: Organization;
  program: Program;
  site: Site;
  signedUpCount: number;
  waitlistCount: number;
  /** Sign-ups with their volunteer, excluding cancelled ones. */
  roster: RosterEntry[];
}

/** Whether an ownership offer is still open or was turned down. */
export type OfferStatus = 'PENDING' | 'DECLINED';

/**
 * An offer to make someone an Owner of an org (FR-3f). Nothing changes until they accept.
 * Offers end on their own 14 days after `createdAt`.
 */
export interface OwnershipOffer {
  id: Id;
  orgId: Id;
  fromUserId: Id;
  toUserId: Id;
  /** The person offering steps down when it's accepted (a hand-over). */
  stepDown: boolean;
  status: OfferStatus;
  /** ISO instant. */
  createdAt: string;
}

/** An ownership offer with the names needed to show it. */
export interface OwnershipOfferView {
  offer: OwnershipOffer;
  orgName: string;
  from: User;
  to: User;
  /** ISO instant after which it can no longer be accepted. */
  expiresAt: string;
}

/**
 * A session anyone may help at once without an account (FR-4c), as the public page shows it:
 * what, when and where, with no roster or contact details of other volunteers.
 */
export interface GuestSession {
  id: Id;
  title: string;
  type: SessionType;
  date: string;
  startTime: string;
  endTime: string;
  orgName: string;
  orgDescription: string;
  siteName: string;
  address: string;
  /** Spots still open across the whole session. */
  spotsOpen: number;
  /** For events split into roles: each role with spots left. */
  roles: Array<{ role: string; spotsOpen: number }>;
}

/** What a guest sees after signing up, so they know where to go and whom to ask. */
export interface GuestConfirmation {
  session: GuestSession;
  role?: string;
  firstName: string;
  contactName: string;
  contactEmail: string;
}

/** One factor's contribution to a match score, shown in "why recommended" (FR-22). */
export interface MatchFactor {
  key: 'skill' | 'reliability' | 'proximity' | 'experience' | 'fairness';
  label: string;
  /** Normalized 0–1 raw factor value. */
  value: number;
  /** Weighted points contributed to the 0–100 total. */
  points: number;
  /** Plain-language explanation, e.g. "Has Block Coding skill". */
  explanation: string;
}

/** A ranked recommendation for a session. */
export interface MatchResult {
  volunteer: Volunteer;
  score: number;
  factors: MatchFactor[];
  summary: string;
}

/** A session recommended to the signed-in person. */
export interface SessionSuggestion {
  session: SessionView;
  score: number;
  summary: string;
  /** Joining would be a one-time guest sign-up. */
  asGuest: boolean;
}

/** Staffing-risk alert for an upcoming session (FR-24). */
export interface SessionRisk {
  session: SessionView;
  level: RiskLevel;
  /** 0–1 risk score. */
  score: number;
  reason: string;
}

/** An active volunteer with no recent activity (FR-24). */
export interface InactivityAlert {
  volunteer: Volunteer;
  daysSinceLastSession: number | null;
}

/** Metrics supported by the report builder (FR-26). */
export type ReportMetric =
  | 'hours'
  | 'staffedPct'
  | 'attendanceRate'
  | 'noShowRate'
  | 'activeVolunteers'
  | 'newRecruits'
  | 'equipmentInUse';

/** Group-by dimensions supported by the report builder. */
export type ReportGroupBy = 'volunteer' | 'site' | 'program' | 'month' | 'skill' | 'priority';

/** Chart types supported by the report builder. */
export type ChartType = 'bar' | 'line' | 'pie';

/** Parameters for the custom report builder (always scoped to one org). */
export interface ReportParams {
  metric: ReportMetric;
  groupBy: ReportGroupBy;
  from: string;
  to: string;
  siteId?: Id;
  programType?: ProgramType;
  volunteerStatus?: VolunteerStatus;
  skill?: string;
  chartType: ChartType;
}

/** One aggregated row in a report. */
export interface ReportRow {
  group: string;
  value: number;
  /** Number of records behind the value. */
  count: number;
}

/** A computed report. */
export interface ReportResult {
  title: string;
  orgName: string;
  params: ReportParams;
  rows: ReportRow[];
  total: number;
  unit: string;
  generatedAt: string;
}

/** Summary numbers for the Manage dashboard. */
export interface AdminDashboardStats {
  activeVolunteers: number;
  applicantsInPipeline: number;
  upcomingSessions: number;
  pendingHourLogs: number;
  hoursThisMonth: number;
  staffedPct: number;
  /** Volunteers with a requirement expiring in the next 30 days or already expired. */
  requirementsDue: number;
}

/** Saved smart-filter preset (FR-25), owned by one person. */
export interface FilterPreset {
  id: Id;
  userId: Id;
  name: string;
  filters: SessionFilters;
}

/** Combinable session filters (FR-25). */
export interface SessionFilters {
  search?: string;
  priorityOnly?: boolean;
  dayOfWeek?: number;
  skill?: string;
  type?: SessionType;
  withinDays?: number;
  needsVolunteersOnly?: boolean;
  siteId?: Id;
  /** Limit a cross-org browse to one org. */
  orgId?: Id;
  /** Only sessions that accept one-time guests. */
  guestsOnly?: boolean;
  /** Include past and cancelled sessions (manage views). */
  includePast?: boolean;
}

/** Help-assistant reply (FR-23). */
export interface AssistantReply {
  text: string;
  /** Optional deep link: "Take me there". */
  link?: { label: string; to: string };
  /** Suggested follow-up questions. */
  suggestions?: string[];
}

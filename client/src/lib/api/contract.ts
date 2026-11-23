/**
 * @file The API contract between the React UI and the backend.
 *
 * The UI only ever talks to an {@link ApiClient}, implemented by `httpApi.ts` over same-origin
 * HTTP to the local Express API (`/api`). Every method documents the REST route it maps to.
 *
 * Scoping (§2.5): management endpoints live under `/api/orgs/:orgId/…` and require a
 * Membership with enough rank in THAT org. Personal endpoints under `/api/me/…` act for the
 * signed-in person across every org.
 */
import type { HourStatus, OrgRole, VolunteerStatus } from '@shared/enums';
import type {
  AddVolunteerInput,
  AppointMemberInput,
  CompletionInput,
  HourLogInput,
  EquipmentInput,
  GuestSignUpInput,
  OwnershipOfferInput,
  LoginInput,
  NewOrganizationInput,
  OrgSettingsInput,
  ProgramInput,
  RepeatInput,
  RequirementInput,
  SiteInput,
  SessionInput,
  VolunteerApplicationInput,
  VolunteerProfileInput,
} from '@shared/schemas';
import type {
  AdminDashboardStats,
  AssistantReply,
  FilterPreset,
  GuestConfirmation,
  GuestSession,
  LeaveResult,
  OwnershipOfferView,
  HourLog,
  Id,
  InactivityAlert,
  Equipment,
  MatchResult,
  MemberView,
  MyProfile,
  OrgAffiliation,
  OrgDirectoryEntry,
  Organization,
  OrgVolunteer,
  Program,
  ReportParams,
  ReportResult,
  Requirement,
  Site,
  SessionFilters,
  SessionRisk,
  SessionSuggestion,
  SessionView,
  SignUp,
  User,
  Volunteer,
  VolunteerGridRow,
} from '@shared/types';

/** Successful login payload. */
export interface AuthResult {
  user: User;
  token: string;
}

/** Query parameters for listing an org's volunteers (FR-8). */
export interface VolunteerQuery {
  search?: string;
  status?: VolunteerStatus;
  skill?: string;
}

/** Hour log joined for display. */
export type HourRow = HourLog & { volunteer: Volunteer; session?: SessionView; orgName: string };

/** A person's sign-up joined with its session (any org). */
export type MySignUp = SignUp & { session: SessionView };

/** Outcome of adding a volunteer directly. */
export interface AddVolunteerResult {
  volunteer: Volunteer;
  /** Only for brand-new accounts: give it to the person so they can sign in. */
  tempPassword?: string;
  message: string;
}

/** Outcome of a sign-up attempt — may land on the waitlist (FR-14). */
export interface SignUpOutcome {
  signUp: SignUp;
  waitlisted: boolean;
  message: string;
}

/** What the server reports about itself. */
export interface ServerStatus {
  ok: boolean;
  /** Demo mode: the "Reset demo data" button is available. */
  demoMode: boolean;
}

/** Full Onboard API surface. */
export interface ApiClient {
  auth: {
    /** `POST /api/auth/login` — FR-1. */
    login(input: LoginInput): Promise<AuthResult>;
    /** `GET /api/auth/me` — restore session from stored token. */
    me(): Promise<User | null>;
    /** `POST /api/auth/logout`. */
    logout(): Promise<void>;
    /** `POST /api/me/tour-complete` — FR-30. */
    completeTour(): Promise<User>;
    /** `GET /api/public/orgs` — orgs an applicant can choose on the public form. */
    publicOrgs(): Promise<Organization[]>;
    /**
     * `POST /api/public/applications` — creates an account (and, if an org was chosen, an APPLIED
     * standing there) and signs the person in (FR-4).
     */
    apply(input: VolunteerApplicationInput): Promise<User>;
    /** `GET /api/public/guest-sessions` — events anyone can help at once, no account (FR-4c). */
    guestSessions(): Promise<GuestSession[]>;
    /** `POST /api/public/guest-signups` — a one-time sign-up without an account (FR-4c). */
    guestSignUp(input: GuestSignUpInput): Promise<GuestConfirmation>;
  };
  orgs: {
    /** `GET /api/me/orgs` — the org switcher: every org the person is PART OF (FR-3c). */
    mine(): Promise<OrgAffiliation[]>;
    /** `GET /api/orgs` — directory of all orgs with the viewer's relationship. */
    directory(): Promise<OrgDirectoryEntry[]>;
    /** `POST /api/orgs` — create an org; the creator becomes its first Owner (FR-3c). */
    create(input: NewOrganizationInput): Promise<Organization>;
    /** `POST /api/orgs/:orgId/volunteers/me` — apply to volunteer, reusing the profile. */
    joinAsVolunteer(orgId: Id): Promise<OrgVolunteer>;
    /** `GET /api/orgs/:orgId/members`. */
    members(orgId: Id): Promise<MemberView[]>;
    /** `POST /api/orgs/:orgId/members` — appoint an existing person by email. */
    appoint(orgId: Id, input: AppointMemberInput): Promise<MemberView>;
    /** `PUT /api/orgs/:orgId/members/:membershipId`. */
    changeRole(orgId: Id, membershipId: Id, role: OrgRole): Promise<MemberView>;
    /** `DELETE /api/orgs/:orgId/members/:membershipId`. */
    removeMember(orgId: Id, membershipId: Id): Promise<void>;
    /** `POST /api/orgs/:orgId/members/me/step-down` — refused for the last Owner. */
    stepDown(orgId: Id): Promise<void>;
    /** `GET /api/orgs/:orgId/ownership-offers` — the open offer and any declined (FR-3f). */
    ownershipOffers(orgId: Id): Promise<OwnershipOfferView[]>;
    /** `POST /api/orgs/:orgId/ownership-offers` — offer ownership (Owners only). */
    offerOwnership(orgId: Id, input: OwnershipOfferInput): Promise<OwnershipOfferView>;
    /** `GET /api/me/ownership-offers` — offers waiting for my answer. */
    myOwnershipOffers(): Promise<OwnershipOfferView[]>;
    /** `POST /api/ownership-offers/:id/accept|decline`. */
    answerOwnershipOffer(offerId: Id, accept: boolean): Promise<OwnershipOfferView>;
    /** `DELETE /api/ownership-offers/:id` — cancel an offer or clear a declined one. */
    withdrawOwnershipOffer(offerId: Id): Promise<void>;
  };
  profile: {
    /** `GET /api/me/profile` — identity + reusable volunteer profile. */
    get(): Promise<MyProfile>;
    /** `PUT /api/me/profile` — FR-7; applies to every org the person serves. */
    update(input: VolunteerProfileInput): Promise<MyProfile>;
  };
  volunteers: {
    /** `GET /api/orgs/:orgId/volunteers` — FR-8. */
    list(orgId: Id, query?: VolunteerQuery): Promise<Volunteer[]>;
    /** `POST /api/orgs/:orgId/volunteers` — add someone directly (new people get a temporary password). */
    add(orgId: Id, input: AddVolunteerInput): Promise<AddVolunteerResult>;
    /**
     * `DELETE /api/orgs/:orgId/volunteers/:userId` — remove someone's volunteer place (Admins+).
     * Upcoming shifts there are cancelled; past hours stay.
     */
    remove(orgId: Id, userId: Id): Promise<LeaveResult>;
    /** `DELETE /api/orgs/:orgId/volunteers/me` — leave an org as a volunteer. */
    leave(orgId: Id): Promise<LeaveResult>;
    /** `GET /api/orgs/:orgId/volunteers/metrics` — data-grid rows with hours and attendance. */
    metrics(orgId: Id): Promise<VolunteerGridRow[]>;
    /** `GET /api/orgs/:orgId/volunteers/:userId`. */
    get(orgId: Id, userId: Id): Promise<Volunteer>;
    /** `POST /api/orgs/:orgId/volunteers/:userId/status` — FR-5. */
    setStatus(orgId: Id, userId: Id, status: VolunteerStatus, note?: string): Promise<Volunteer>;
    /** `PUT /api/orgs/:orgId/volunteers/:userId/requirements/:requirementId` — record a completion. */
    recordCompletion(
      orgId: Id,
      userId: Id,
      requirementId: Id,
      input: CompletionInput,
    ): Promise<Volunteer>;
    /** `DELETE /api/orgs/:orgId/volunteers/:userId/requirements/:requirementId` — undo one. */
    clearCompletion(orgId: Id, userId: Id, requirementId: Id): Promise<Volunteer>;
  };
  settings: {
    /** `PUT /api/orgs/:orgId/settings` — sector, terms, features, skills, event roles. */
    update(orgId: Id, input: OrgSettingsInput): Promise<Organization>;
    /** `GET /api/orgs/:orgId/requirements` — the org's active checklist, in order. */
    requirements(orgId: Id): Promise<Requirement[]>;
    /** `POST /api/orgs/:orgId/requirements`. */
    createRequirement(orgId: Id, input: RequirementInput): Promise<Requirement>;
    /** `PUT /api/requirements/:id`. */
    updateRequirement(id: Id, input: RequirementInput): Promise<Requirement>;
    /** `POST /api/requirements/:id/move` — `-1` up, `1` down; returns the new order. */
    moveRequirement(id: Id, direction: -1 | 1): Promise<Requirement[]>;
    /** `DELETE /api/requirements/:id` — archives it (completions are kept). */
    archiveRequirement(id: Id): Promise<void>;
  };
  sites: {
    /** `GET /api/orgs/:orgId/sites`. */
    list(orgId: Id, includeArchived?: boolean): Promise<Site[]>;
    /** `POST /api/orgs/:orgId/sites` — FR-9. */
    create(orgId: Id, input: SiteInput): Promise<Site>;
    /** `PUT /api/sites/:id`. */
    update(id: Id, input: SiteInput): Promise<Site>;
    /** `DELETE /api/sites/:id` — V-S14 may refuse. */
    remove(id: Id): Promise<void>;
    /** `POST /api/sites/:id/archive` (toggles). */
    archive(id: Id): Promise<Site>;
  };
  programs: {
    /** `GET /api/orgs/:orgId/programs`. */
    list(orgId: Id, includeArchived?: boolean): Promise<Program[]>;
    /** `POST /api/programs` — FR-10; the site decides the org. */
    create(input: ProgramInput): Promise<Program>;
    /** `PUT /api/programs/:id`. */
    update(id: Id, input: ProgramInput): Promise<Program>;
    /** `DELETE /api/programs/:id` — V-S14 may refuse. */
    remove(id: Id): Promise<void>;
    /** `POST /api/programs/:id/archive` (toggles). */
    archive(id: Id): Promise<Program>;
  };
  sessions: {
    /** `GET /api/orgs/:orgId/sessions` — manage view, FR-25 filters. */
    list(orgId: Id, filters?: SessionFilters): Promise<SessionView[]>;
    /** `GET /api/me/sessions/open` — sessions the person may join, across all orgs (FR-13). */
    browse(filters?: SessionFilters): Promise<SessionView[]>;
    /** `GET /api/sessions/:id`. */
    get(id: Id): Promise<SessionView>;
    /** `POST /api/sessions` — FR-11. */
    create(input: SessionInput): Promise<SessionView>;
    /** `POST /api/sessions/bulk` — "Repeat weekly": one session per picked weekday up to `until`. */
    createRepeating(input: SessionInput, repeat: RepeatInput): Promise<SessionView[]>;
    /** `PUT /api/sessions/:id`. */
    update(id: Id, input: SessionInput): Promise<SessionView>;
    /** `POST /api/sessions/:id/cancel`. */
    cancel(id: Id): Promise<SessionView>;
  };
  signups: {
    /** `POST /api/sessions/:id/signups` — the signed-in person joins (member or guest). */
    signUp(sessionId: Id, role?: string): Promise<SignUpOutcome>;
    /** `POST /api/sessions/:id/assign` — FR-15, a manager assigns someone. */
    assign(sessionId: Id, userId: Id, role?: string): Promise<SignUpOutcome>;
    /** `POST /api/signups/:id/cancel` — auto-promotes the waitlist (FR-14). */
    cancel(signUpId: Id): Promise<{ promoted?: Volunteer }>;
    /** `POST /api/signups/:id/check-in` — FR-16. */
    checkIn(signUpId: Id): Promise<SignUp>;
    /** `POST /api/signups/:id/check-out` — FR-16/18, auto-creates an hour log. */
    checkOut(signUpId: Id): Promise<SignUp>;
    /** `POST /api/signups/:id/no-show` — FR-16. */
    markNoShow(signUpId: Id): Promise<SignUp>;
    /** `GET /api/me/signups` — across every org. */
    mine(): Promise<MySignUp[]>;
    /** `GET /api/orgs/:orgId/volunteers/:userId/signups`. */
    forVolunteer(orgId: Id, userId: Id): Promise<MySignUp[]>;
  };
  hours: {
    /** `GET /api/me/hours` — the person's hours across every org. */
    mine(): Promise<HourRow[]>;
    /** `GET /api/orgs/:orgId/hours` — FR-19 review queue. */
    list(orgId: Id, query?: { status?: HourStatus; userId?: Id }): Promise<HourRow[]>;
    /** `POST /api/me/hours` — FR-18 manual log for one org. */
    create(input: HourLogInput): Promise<HourLog>;
    /** `POST /api/hours/:id/review` — FR-19. */
    review(id: Id, status: HourStatus, note?: string): Promise<HourLog>;
  };
  equipment: {
    /** `GET /api/orgs/:orgId/equipment`. */
    list(orgId: Id): Promise<Equipment[]>;
    /** `POST /api/orgs/:orgId/equipment`. */
    create(orgId: Id, input: EquipmentInput): Promise<Equipment>;
    /** `POST /api/equipment/:id/checkout` — V-S10. */
    checkOut(equipmentId: Id, programId: Id): Promise<Equipment>;
    /** `POST /api/equipment/:id/return`. */
    returnEquipment(equipmentId: Id): Promise<Equipment>;
  };
  matching: {
    /** `GET /api/sessions/:id/recommendations` — FR-22. */
    recommend(sessionId: Id, limit?: number): Promise<MatchResult[]>;
    /** `GET /api/me/recommended-sessions` — "Recommended for you", across orgs. */
    forMe(limit?: number): Promise<SessionSuggestion[]>;
  };
  risk: {
    /** `GET /api/orgs/:orgId/alerts/staffing` — FR-24. */
    sessions(orgId: Id): Promise<SessionRisk[]>;
    /** `GET /api/orgs/:orgId/alerts/inactivity` — FR-24. */
    inactivity(orgId: Id): Promise<InactivityAlert[]>;
  };
  reports: {
    /** `POST /api/orgs/:orgId/reports/run` — FR-26/27. */
    run(orgId: Id, params: ReportParams): Promise<ReportResult>;
  };
  dashboard: {
    /** `GET /api/orgs/:orgId/dashboard`. */
    admin(orgId: Id): Promise<AdminDashboardStats>;
  };
  assistant: {
    /** `POST /api/assistant/ask` — FR-23; `orgId` is the org being managed, if any. */
    ask(question: string, orgId: Id | null): Promise<AssistantReply>;
  };
  presets: {
    /** `GET /api/me/filter-presets` — FR-25. */
    list(): Promise<FilterPreset[]>;
    /** `POST /api/me/filter-presets`. */
    save(name: string, filters: SessionFilters): Promise<FilterPreset>;
    /** `DELETE /api/me/filter-presets/:id`. */
    remove(id: Id): Promise<void>;
  };
  meta: {
    /** `GET /api/meta/skills`. */
    skills(): Promise<string[]>;
    /** `GET /api/health` — whether demo mode (and so the reset button) is on. */
    status(): Promise<ServerStatus>;
    /** `POST /api/meta/reset-demo` — reloads seed data (FR-3); only in demo mode. */
    resetDemo(): Promise<void>;
  };
}

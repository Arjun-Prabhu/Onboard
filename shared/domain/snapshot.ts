/**
 * @file The in-memory data snapshot the domain algorithms work on (§2.6).
 *
 * Matching, staffing risk, reports, the assistant and the read-model joins are pure functions
 * over this shape: plain arrays of shared entity types. The server's repository layer loads
 * it from SQLite through Prisma, and the domain code builds `Map`/`Set` indexes over it, so
 * the same algorithms run unchanged in tests, in the server, and in the domain unit tests.
 */
import type {
  FilterPreset,
  OwnershipOffer,
  HourLog,
  Equipment,
  Membership,
  Organization,
  OrgVolunteer,
  Program,
  Requirement,
  Session,
  Site,
  SignUp,
  User,
  VolunteerProfile,
} from '../types';

/** A person as stored, including the password hash. Never sent to the browser. */
export interface StoredUser extends User {
  passwordHash: string;
}

/** Every table, as arrays of shared entity types. */
export interface DataSnapshot {
  organizations: Organization[];
  users: StoredUser[];
  memberships: Membership[];
  profiles: VolunteerProfile[];
  orgVolunteers: OrgVolunteer[];
  requirements: Requirement[];
  sites: Site[];
  programs: Program[];
  sessions: Session[];
  signUps: SignUp[];
  hourLogs: HourLog[];
  equipment: Equipment[];
  presets: FilterPreset[];
  offers: OwnershipOffer[];
}

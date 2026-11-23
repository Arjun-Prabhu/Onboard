/**
 * @file Shared Zod schemas — the single source of truth for FORMAT (syntactic) validation.
 *
 * The same schemas run in the browser (on blur/submit) and, later, in the Express
 * `validate(schema)` middleware, so the client is never trusted (§2.7).
 * Each rule maps to an ID from §1.6 (V-F1 … V-F8) noted in comments.
 */
import { z } from 'zod';
import {
  EquipmentCondition,
  ExperienceLevel,
  OrgRole,
  OrgSector,
  ProgramType,
  RangeKind,
  SessionType,
  VolunteerStatus,
} from '../enums';

/** Max length for short text fields (V-F7). */
export const MAX_NAME_LENGTH = 60;
/** Max length for long text fields (V-F7). */
export const MAX_TEXT_LENGTH = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Builds a required, trimmed text field (V-F1, V-F7).
 * @param label - Field name used in the error message.
 * @param max - Maximum length.
 * @returns A Zod string schema.
 */
export function requiredText(label: string, max = MAX_NAME_LENGTH) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
}

/** Person name: required, valid characters only (V-F1, V-F7). */
export const nameSchema = (label: string) =>
  requiredText(label).regex(
    NAME_RE,
    `${label} can only contain letters, spaces, hyphens, and apostrophes.`,
  );

/** Email address (V-F2). */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(254, 'Email is too long.')
  .regex(EMAIL_RE, 'Enter a valid email, like name@example.com.');

/** US phone: exactly 10 digits after removing formatting (V-F3). */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required.')
  .refine(
    (v) => v.replace(/\D/g, '').length === 10,
    'Enter a 10-digit US phone number, like (704) 555-0123.',
  );

/** 5-digit ZIP (V-F4). */
export const zipSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, 'ZIP code must be exactly 5 digits.');

/** Real calendar date in `YYYY-MM-DD` (V-F5). */
export const dateSchema = z
  .string()
  .regex(DATE_RE, 'Enter a valid date.')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'That date does not exist.');

/** 24-hour time `HH:mm` (V-F5). */
export const timeSchema = z.string().regex(TIME_RE, 'Enter a valid time.');

/** Password strength: 8+ chars with a letter and a number (V-F8). */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .regex(/[A-Za-z]/, 'Password must include at least one letter.')
  .regex(/\d/, 'Password must include at least one number.');

/** Login form (FR-1). */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});
/** Parsed login payload. */
export type LoginInput = z.infer<typeof loginSchema>;

/** Availability window as entered in forms. */
export const availabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
});

/** Public volunteer application (FR-4). */
export const volunteerApplicationSchema = z.object({
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  email: emailSchema,
  phone: phoneSchema,
  affiliation: requiredText('Workplace, school or affiliation', 80),
  zip: zipSchema,
  // Optional: an org may keep no skill catalog at all.
  skills: z.array(z.string().trim().min(1).max(40)).max(40, 'Choose up to 40 skills.'),
  availability: z.array(availabilitySchema).min(1, 'Add at least one time you are available.'),
  experienceLevel: z.enum([
    ExperienceLevel.NEW,
    ExperienceLevel.INTERMEDIATE,
    ExperienceLevel.VETERAN,
  ]),
  hasTransportation: z.boolean(),
  bio: z.string().trim().max(MAX_TEXT_LENGTH, `Keep this under ${MAX_TEXT_LENGTH} characters.`),
  /** Organization to volunteer with right away; empty or absent means "I'll choose later". */
  orgId: z.string().max(60).optional(),
  password: passwordSchema,
});
/** Parsed application payload. */
export type VolunteerApplicationInput = z.infer<typeof volunteerApplicationSchema>;

/**
 * One-time help without an account (FR-4c): a name and a way to reach the person, for one
 * session that its organization opened to guests.
 */
export const guestSignUpSchema = z.object({
  sessionId: z.string().min(1, 'Choose an event.'),
  /** Event role, for events split into roles. */
  role: z.string().trim().max(40).optional(),
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  email: emailSchema,
  phone: phoneSchema,
});
/** Parsed guest sign-up payload. */
export type GuestSignUpInput = z.infer<typeof guestSignUpSchema>;

/** Self-service profile edit (FR-7) — person-level, shared by every org they serve. */
export const volunteerProfileSchema = volunteerApplicationSchema
  .omit({ password: true, email: true, orgId: true })
  .extend({ availability: z.array(availabilitySchema) });
/** Parsed profile payload. */
export type VolunteerProfileInput = z.infer<typeof volunteerProfileSchema>;

/** Site create/edit (FR-9). */
export const siteSchema = z.object({
  name: requiredText('Site name', 80),
  address: requiredText('Address', 120),
  zip: zipSchema,
  priority: z.boolean(),
  // Optional: only orgs that track grades or ages served fill these in (checked by V-S11).
  rangeMin: z.number({ error: 'Lowest value must be a number.' }).int().min(0).max(120).optional(),
  rangeMax: z.number({ error: 'Highest value must be a number.' }).int().min(0).max(120).optional(),
  contactName: nameSchema('Contact name'),
  contactEmail: emailSchema,
});
/** Parsed site payload. */
export type SiteInput = z.infer<typeof siteSchema>;

/** Program create/edit (FR-10). */
export const programSchema = z.object({
  siteId: z.string().min(1, 'Choose a site.'),
  name: requiredText('Program name', 80),
  type: z.enum([ProgramType.ONGOING, ProgramType.SEASONAL]),
  startDate: dateSchema,
  endDate: dateSchema,
  participantCount: z
    .number({ error: 'Participants must be a number.' })
    .int('Participants must be a whole number.')
    .min(0, 'Participants cannot be negative.')
    .max(5000, 'That looks too high (max 5,000).'),
  targetRatio: z
    .number({ error: 'Ratio must be a number.' })
    .int()
    .min(1, 'Ratio must be at least 1.')
    .max(100, 'Ratio must be 100 or fewer per volunteer.')
    .optional(),
  description: requiredText('Description', 120),
});
/** Parsed program payload. */
export type ProgramInput = z.infer<typeof programSchema>;

/**
 * Session create/edit (FR-11). A session belongs to a program, or — for a one-time event like a
 * fundraiser — just to a place (`siteId`, with `programId` left empty).
 */
export const sessionSchema = z
  .object({
    programId: z.string(),
    /** Place of a one-time event (only when `programId` is empty). */
    siteId: z.string().optional(),
    type: z.enum([SessionType.SHIFT, SessionType.EVENT, SessionType.TRAINING]),
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    title: requiredText('Title', 100),
    requiredSkills: z.array(z.string()),
    volunteersNeeded: z
      .number({ error: 'Volunteers needed must be a number.' })
      .int('Volunteers needed must be a whole number.')
      .min(1, 'At least 1 volunteer is needed.')
      .max(50, 'Volunteers needed must be 50 or fewer.'),
    openToGuests: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.programId && !v.siteId)
      ctx.addIssue({
        code: 'custom',
        path: ['programId'],
        message: 'Choose a program, or make it a one-time event at a place.',
      });
  });
/** Parsed session payload. */
export type SessionInput = z.infer<typeof sessionSchema>;

/** Repeat a new session weekly (bulk create). */
export const repeatSchema = z.object({
  /** Days of the week to repeat on, 0 = Sunday. */
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Pick at least one day of the week.')
    .max(7),
  /** Last date to create a session on (inclusive). */
  until: dateSchema,
});
/** Parsed repeat payload. */
export type RepeatInput = z.infer<typeof repeatSchema>;

/** Most sessions one "Repeat weekly" can create, so a typo can't flood the calendar. */
export const MAX_REPEAT_SESSIONS = 100;

/** Create an organization (FR-3c). */
export const organizationSchema = z.object({
  name: requiredText('Organization name', 80),
  description: requiredText('Description', 160),
  timezone: z.string().min(1, 'Choose a time zone.'),
  /** Picks the starting terms, skills and event roles; all editable later. */
  sector: z.enum([
    OrgSector.STEM,
    OrgSector.HEALTH,
    OrgSector.SPORTS,
    OrgSector.COMMUNITY,
    OrgSector.OTHER,
  ]),
});
/** Parsed organization payload. */
export type OrganizationInput = z.infer<typeof organizationSchema>;

/** A short term such as "School" or "Gear bag". */
const termSchema = (label: string) => requiredText(label, 30);

/** A list of short, unique names (skills, event roles). */
const nameListSchema = (label: string, max: number) =>
  z
    .array(
      z
        .string()
        .trim()
        .min(1, `${label} can't be blank.`)
        .max(40, `Keep each ${label.toLowerCase()} under 40 characters.`),
    )
    .max(max, `Up to ${max} ${label.toLowerCase()}s.`)
    .refine(
      (list) => new Set(list.map((v) => v.toLowerCase())).size === list.length,
      `Each ${label.toLowerCase()} must be unique.`,
    );

/** Organization settings (Phase 2): sector, terms, range kind, features, catalogs. */
export const orgSettingsSchema = z.object({
  sector: z.enum([
    OrgSector.STEM,
    OrgSector.HEALTH,
    OrgSector.SPORTS,
    OrgSector.COMMUNITY,
    OrgSector.OTHER,
  ]),
  siteTerm: termSchema('Site term'),
  participantTerm: termSchema('Participant term'),
  equipmentTerm: termSchema('Equipment term'),
  priorityLabel: termSchema('Priority label'),
  rangeKind: z.enum([RangeKind.GRADE, RangeKind.AGE, RangeKind.NONE]),
  features: z.object({
    equipment: z.boolean(),
    prioritySites: z.boolean(),
    guests: z.boolean(),
  }),
  skills: nameListSchema('Skill', 40),
  /** Optional one-line description per skill. */
  skillNotes: z.record(
    z.string(),
    z.string().trim().max(120, 'Keep each skill description under 120 characters.'),
  ),
  eventRoles: nameListSchema('Event role', 20),
});
/** Parsed settings payload. */
export type OrgSettingsInput = z.infer<typeof orgSettingsSchema>;

/**
 * Create an organization together with its settings, so the new-org wizard is saved in one step:
 * either the org and everything chosen in the wizard exist, or nothing does.
 */
export const newOrganizationSchema = organizationSchema.extend({
  settings: orgSettingsSchema.optional(),
});
/** Parsed new-organization payload. */
export type NewOrganizationInput = z.infer<typeof newOrganizationSchema>;

/** Create or edit a requirement (Phase 3). */
export const requirementSchema = z.object({
  name: requiredText('Requirement name', 60),
  description: z.string().trim().max(200, 'Keep this under 200 characters.'),
  validMonths: z
    .number({ error: 'Months must be a number.' })
    .int('Months must be a whole number.')
    .min(1, 'At least 1 month.')
    .max(120, 'At most 120 months.')
    .optional(),
});
/** Parsed requirement payload. */
export type RequirementInput = z.infer<typeof requirementSchema>;

/** Record that a volunteer completed a requirement (Phase 3). */
export const completionSchema = z.object({
  completedAt: dateSchema,
});
/** Parsed completion payload. */
export type CompletionInput = z.infer<typeof completionSchema>;

/**
 * An organizer adds a volunteer directly (FR-4 alternative): an existing person by email, or a
 * new person who gets an account with a temporary password.
 */
export const addVolunteerSchema = z.object({
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  email: emailSchema,
  phone: phoneSchema.or(z.literal('')).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(40),
  /** Step to start at: a new application, or already Ready to serve. */
  status: z.enum([VolunteerStatus.APPLIED, VolunteerStatus.ACTIVE]),
});
/** Parsed add-volunteer payload. */
export type AddVolunteerInput = z.infer<typeof addVolunteerSchema>;

/** Appoint a member (FR-3c): an existing person, by email, to a management role. */
export const appointMemberSchema = z.object({
  email: emailSchema,
  orgRole: z.enum([OrgRole.OWNER, OrgRole.ADMIN, OrgRole.COORDINATOR]),
});
/** Parsed appointment payload. */
export type AppointMemberInput = z.infer<typeof appointMemberSchema>;

/**
 * Offering to make someone an Owner (FR-3f). `stepDown` hands the org over: the person offering
 * steps down when it's accepted.
 */
export const ownershipOfferSchema = z.object({
  toUserId: z.string().min(1, 'Choose who to offer it to.'),
  stepDown: z.boolean().default(false),
});
/** Parsed ownership-offer payload. */
export type OwnershipOfferInput = z.input<typeof ownershipOfferSchema>;

/** Manual hour log (FR-18). */
export const hourLogSchema = z.object({
  orgId: z.string().min(1, 'Choose the organization you volunteered for.'),
  sessionId: z.string().optional(),
  date: dateSchema,
  hours: z
    .number({ error: 'Hours must be a number.' })
    .positive('Hours must be greater than 0.')
    .max(24, 'Hours cannot exceed 24.')
    .refine((v) => Math.round(v * 4) === v * 4, 'Use quarter-hour increments (e.g. 1.25).'),
  description: requiredText('Description', 200),
});
/** Parsed hour-log payload. */
export type HourLogInput = z.infer<typeof hourLogSchema>;

/** Equipment create (FR-21). */
export const equipmentSchema = z.object({
  assetTag: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/,
      'Use 2–20 letters, numbers or dashes, e.g. KIT-0012.',
    ),
  name: requiredText('Name', 60),
  condition: z.enum([
    EquipmentCondition.GOOD,
    EquipmentCondition.NEEDS_REPAIR,
    EquipmentCondition.MISSING_PARTS,
    EquipmentCondition.RETIRED,
  ]),
});
/** Parsed item payload. */
export type EquipmentInput = z.infer<typeof equipmentSchema>;

/**
 * Converts a Zod error into a `{ field: message }` map for inline form errors.
 * Only the first message per field is kept so the UI stays calm.
 * @param error - A ZodError from `safeParse`.
 * @returns Field-path → message map.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

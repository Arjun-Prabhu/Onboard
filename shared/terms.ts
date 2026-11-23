/**
 * @file The words each organization uses for its own things (Phase 2).
 *
 * A robotics nonprofit serves *students* at *schools* with robot *kits*; a free clinic serves
 * *patients* at *clinics* with *equipment*; a youth soccer league serves *players* at *fields*
 * with *gear bags*. Screens, rule messages, reports and the assistant read these terms instead
 * of hard-coding one org's vocabulary. A new org starts from its sector's defaults.
 */
import { OrgSector, RangeKind } from './enums';
import type { Organization, OrgSettings } from './types';

/**
 * English plural of a noun, good enough for UI terms: "School" → "Schools", "Facility" →
 * "Facilities", "Gear bag" → "Gear bags", "Equipment" → "Equipment".
 * @param word - Singular noun (may be several words; the last one is pluralized).
 * @returns The plural.
 */
export function pluralize(word: string): string {
  const w = word.trim();
  if (!w) return w;
  if (/(equipment|gear|staff|information|furniture)$/i.test(w)) return w;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  return `${w}s`;
}

/**
 * Default settings for a new organization of each sector. The skill catalog, event roles and
 * requirements start with a few typical entries the org can edit in Organization settings.
 */
export const SECTOR_DEFAULTS: Record<OrgSector, Omit<OrgSettings, 'sector' | 'skillNotes'>> = {
  STEM: {
    siteTerm: 'School',
    participantTerm: 'Students',
    equipmentTerm: 'Kit',
    priorityLabel: 'Title I',
    rangeKind: RangeKind.GRADE,
    features: { equipment: true, prioritySites: true, guests: true },
    skills: ['Teaching', 'Coding', 'Building', 'Event setup', 'Bilingual (Spanish)'],
    eventRoles: ['Judge', 'Referee', 'Check-in', 'Setup'],
  },
  HEALTH: {
    siteTerm: 'Clinic',
    participantTerm: 'Patients',
    equipmentTerm: 'Equipment',
    priorityLabel: 'Underserved area',
    rangeKind: RangeKind.NONE,
    features: { equipment: true, prioritySites: true, guests: false },
    skills: [
      'Patient intake',
      'Phlebotomy',
      'Health education',
      'Interpreting (Spanish)',
      'Data entry',
    ],
    eventRoles: ['Screener', 'Greeter', 'Registration', 'Educator'],
  },
  SPORTS: {
    siteTerm: 'Field',
    participantTerm: 'Players',
    equipmentTerm: 'Gear bag',
    priorityLabel: 'Scholarship site',
    rangeKind: RangeKind.AGE,
    features: { equipment: true, prioritySites: false, guests: true },
    skills: ['Coaching', 'Refereeing', 'First aid', 'Field setup', 'Scorekeeping'],
    eventRoles: ['Referee', 'Scorekeeper', 'Concessions', 'Field marshal'],
  },
  COMMUNITY: {
    siteTerm: 'Location',
    participantTerm: 'Neighbors',
    equipmentTerm: 'Supply kit',
    priorityLabel: 'High-need area',
    rangeKind: RangeKind.NONE,
    features: { equipment: false, prioritySites: true, guests: true },
    skills: ['Food handling', 'Driving', 'Tutoring', 'Translation', 'Event setup'],
    eventRoles: ['Greeter', 'Sorter', 'Driver', 'Setup'],
  },
  OTHER: {
    siteTerm: 'Site',
    participantTerm: 'Participants',
    equipmentTerm: 'Item',
    priorityLabel: 'Priority site',
    rangeKind: RangeKind.NONE,
    features: { equipment: false, prioritySites: false, guests: true },
    skills: [],
    eventRoles: ['Setup', 'Check-in'],
  },
};

/**
 * Full default settings for a sector.
 * @param sector - Org sector.
 * @returns Settings a new org of that sector starts with.
 */
export function defaultSettings(sector: OrgSector): OrgSettings {
  const d = SECTOR_DEFAULTS[sector];
  return {
    sector,
    ...d,
    features: { ...d.features },
    skills: [...d.skills],
    skillNotes: {},
    eventRoles: [...d.eventRoles],
  };
}

/** Ready-to-use word forms for one org, so callers never pluralize or recase by hand. */
export interface Terms {
  /** "School" */
  Site: string;
  /** "Schools" */
  Sites: string;
  /** "school" */
  site: string;
  /** "schools" */
  sites: string;
  /** "Students" */
  Participants: string;
  /** "students" */
  participants: string;
  /** "Kit" */
  Equipment: string;
  /** "Kits" */
  EquipmentPlural: string;
  /** "kit" */
  equipment: string;
  /** "kits" */
  equipmentPlural: string;
  /** "Title I" */
  priority: string;
  /** "Grade" / "Age" / "" */
  rangeUnit: string;
}

/** Neutral words used before an org is known (e.g. the sign-in screen, the cross-org browse). */
export const GENERIC_TERMS: Terms = termsFor({
  siteTerm: 'Site',
  participantTerm: 'Participants',
  equipmentTerm: 'Equipment',
  priorityLabel: 'Priority site',
  rangeKind: RangeKind.NONE,
});

/**
 * Builds the word forms for a settings object.
 * @param s - The org's settings (only the term fields are read).
 * @returns Word forms.
 */
export function termsFor(
  s: Pick<
    OrgSettings,
    'siteTerm' | 'participantTerm' | 'equipmentTerm' | 'priorityLabel' | 'rangeKind'
  >,
): Terms {
  const lower = (w: string) => w.toLowerCase();
  const sites = pluralize(s.siteTerm);
  const equipmentPlural = pluralize(s.equipmentTerm);
  return {
    Site: s.siteTerm,
    Sites: sites,
    site: lower(s.siteTerm),
    sites: lower(sites),
    Participants: s.participantTerm,
    participants: lower(s.participantTerm),
    Equipment: s.equipmentTerm,
    EquipmentPlural: equipmentPlural,
    equipment: lower(s.equipmentTerm),
    equipmentPlural: lower(equipmentPlural),
    priority: s.priorityLabel,
    rangeUnit:
      s.rangeKind === RangeKind.GRADE ? 'Grade' : s.rangeKind === RangeKind.AGE ? 'Age' : '',
  };
}

/**
 * Word forms for an org (or the generic set when there is none).
 * @param org - The organization, if known.
 * @returns Word forms.
 */
export function termsOf(org: Pick<Organization, 'settings'> | null | undefined): Terms {
  return org ? termsFor(org.settings) : GENERIC_TERMS;
}

/**
 * Formats a site's served range, e.g. "Grades 4–8", "Ages 6–12", "Grade K–5".
 * @param kind - The org's range kind.
 * @param min - Lowest value.
 * @param max - Highest value.
 * @returns Display text, or an empty string when the org keeps no range or none is set.
 */
export function rangeText(kind: RangeKind, min?: number, max?: number): string {
  if (kind === RangeKind.NONE || min === undefined || max === undefined) return '';
  const show = (n: number) => (kind === RangeKind.GRADE && n === 0 ? 'K' : String(n));
  const unit = kind === RangeKind.GRADE ? 'Grades' : 'Ages';
  return min === max ? `${unit.slice(0, -1)} ${show(min)}` : `${unit} ${show(min)}–${show(max)}`;
}

/**
 * @file Navigation built from permissions (FR-2, FR-3b, §1.2a, §2.10).
 *
 * The app has two **modes**, so a first-time user only ever sees one short menu:
 *  - **Volunteer** — your own shifts and hours, across every organization.
 *  - **Organize** — run the organization chosen in the switcher; items appear only if your role
 *    there grants them.
 * Each menu has about six items. Related screens are grouped as **tabs** under one item
 * (e.g. Volunteers → People · New volunteers), so the sidebar stays short and every core task is
 * still within 3 clicks (NFR-5).
 */
import {
  BarChart3,
  CalendarCheck,
  Clock,
  Home,
  LifeBuoy,
  type LucideIcon,
  Search,
  Settings,
  SlidersHorizontal,
  Trophy,
  UserRound,
  Users,
  CalendarDays,
} from 'lucide-react';
import type { Permission } from '@shared/permissions';
import type { Terms } from '@shared/terms';
import type { OrgFeatures } from '@shared/types';

/** Which half of the app the person is using. */
export type Mode = 'volunteer' | 'organize';

/** One navigation link. */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Matches only the exact path. */
  end?: boolean;
  /** Required permission in the active org (organize items only). */
  permission?: Permission;
  /** Shown only when the active org uses this optional feature. */
  feature?: keyof OrgFeatures;
  /** Optional `data-tour` hook. */
  tour?: string;
  /** Other paths that should highlight this item (its tabs). */
  alsoActive?: RegExp;
}

/** One tab inside a group of related screens. */
export interface TabItem {
  to: string;
  label: string;
  permission?: Permission;
  feature?: keyof OrgFeatures;
}

/** A group of related screens shown as tabs under one title. */
export interface TabGroup {
  title: string;
  tabs: TabItem[];
}

/**
 * Organize-mode menu in the active org's own words.
 * @returns Every organize item (filter with {@link visibleOrganizeItems}).
 */
export function organizeItems(): NavItem[] {
  return [
    { to: '/', label: 'Home', icon: Home, end: true, permission: 'volunteers.view' },
    {
      to: '/sessions',
      label: 'Schedule',
      icon: CalendarDays,
      permission: 'volunteers.view',
      alsoActive: /^\/(sessions|calendar|programs)(\/|$)/,
      tour: 'schedule',
    },
    {
      to: '/volunteers',
      label: 'Volunteers',
      icon: Users,
      permission: 'volunteers.view',
      alsoActive: /^\/(volunteers|recruitment)(\/|$)/,
    },
    { to: '/hours', label: 'Hours', icon: Clock, permission: 'hours.review' },
    { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.view' },
    {
      to: '/org/settings',
      label: 'Settings',
      icon: SlidersHorizontal,
      // Coordinators can still see the team list, so they get the item too.
      permission: 'volunteers.view',
      alsoActive: /^\/(org\/settings|org\/members|sites|equipment)(\/|$)/,
    },
  ];
}

/**
 * The organize items a person sees in the active org.
 * @param can - Permission check for the person's role there.
 * @returns Visible items.
 */
export function visibleOrganizeItems(can: (p: Permission) => boolean): NavItem[] {
  return organizeItems()
    .filter((i) => !i.permission || can(i.permission))
    .map((i) =>
      // Coordinators can't edit org settings; their Settings item opens the team list instead.
      i.to === '/org/settings' && !can('org.settings') ? { ...i, to: '/org/members' } : i,
    );
}

/**
 * Organize-mode menu for someone who doesn't run an organization yet: just Home, which invites
 * them to create one.
 */
export const NO_ORG_ITEMS: NavItem[] = [{ to: '/', label: 'Home', icon: Home, end: true }];

/** Where the last-chosen mode is remembered (per browser). */
const MODE_KEY = 'onboard.mode';

/**
 * The mode the person last chose, if any.
 * @returns The saved mode, or null when nothing is saved (or storage is unavailable).
 */
export function savedMode(): Mode | null {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'volunteer' || m === 'organize' ? m : null;
  } catch {
    return null;
  }
}

/**
 * Remembers the mode, ignoring storage failures.
 * @param mode - Mode to remember.
 */
export function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* not saved; harmless */
  }
}

/** Volunteer-mode menu — available to every person. */
export const VOLUNTEER_ITEMS: NavItem[] = [
  { to: '/me', label: 'Home', icon: Home, end: true },
  { to: '/me/find', label: 'Find a shift', icon: Search, tour: 'find' },
  {
    to: '/me/schedule',
    label: 'My shifts',
    icon: CalendarCheck,
    alsoActive: /^\/me\/(schedule|calendar)$/,
  },
  { to: '/me/hours', label: 'My hours', icon: Clock },
  {
    to: '/me/profile',
    label: 'Profile',
    icon: UserRound,
    alsoActive: /^\/me\/(profile|orgs)$/,
  },
];

/** Account-menu items — available to every person, tucked under their name. */
export const ACCOUNT_ITEMS: NavItem[] = [
  { to: '/settings', label: 'App settings', icon: Settings },
  { to: '/help', label: 'Help Center', icon: LifeBuoy },
  { to: '/challenge', label: 'FBLA challenge', icon: Trophy },
];

/**
 * Groups of related screens, shown as tabs under one title. The org's own words name them.
 * @param t - The active org's terms.
 * @returns Every group.
 */
export function tabGroups(t: Terms): TabGroup[] {
  return [
    {
      title: 'Schedule',
      tabs: [
        { to: '/sessions', label: 'Sessions' },
        { to: '/calendar', label: 'Calendar' },
        { to: '/programs', label: 'Programs' },
      ],
    },
    {
      title: 'Volunteers',
      tabs: [
        { to: '/volunteers', label: 'People' },
        { to: '/recruitment', label: 'New volunteers', permission: 'volunteers.pipeline' },
      ],
    },
    {
      title: 'Settings',
      tabs: [
        { to: '/org/settings', label: 'Organization', permission: 'org.settings' },
        { to: '/sites', label: t.Sites, permission: 'sites.edit' },
        {
          to: '/equipment',
          label: t.EquipmentPlural,
          permission: 'equipment.manage',
          feature: 'equipment',
        },
        { to: '/org/members', label: 'Team & roles', permission: 'volunteers.view' },
      ],
    },
    {
      title: 'My shifts',
      tabs: [
        { to: '/me/schedule', label: 'List' },
        { to: '/me/calendar', label: 'Calendar' },
      ],
    },
    {
      title: 'Profile',
      tabs: [
        { to: '/me/profile', label: 'About me' },
        { to: '/me/orgs', label: 'My organizations' },
      ],
    },
  ];
}

/**
 * Which mode a path belongs to. Shared pages (a session's details, help, settings) belong to
 * neither, so the sidebar keeps whatever mode the person was in.
 * @param path - URL pathname.
 * @returns The mode, or null for shared pages.
 */
export function modeForPath(path: string): Mode | null {
  if (/^\/me(\/|$)/.test(path)) return 'volunteer';
  if (
    path === '/' ||
    /^\/(calendar|programs|hours|recruitment|volunteers|sites|equipment|reports|org)(\/|$)/.test(
      path,
    ) ||
    path === '/sessions'
  )
    return 'organize';
  return null;
}

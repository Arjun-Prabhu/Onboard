/**
 * @file Tabs for a group of related screens (e.g. Volunteers → People · New volunteers).
 *
 * Grouping keeps the sidebar to about six items per mode while every screen stays one click
 * away. Tabs the person's role or the org's features don't allow are hidden; a group with a
 * single visible tab shows no tab bar at all.
 */
import { NavLink, useLocation } from 'react-router-dom';
import { GENERIC_TERMS } from '@shared/terms';
import { useOrgIfAny } from '@/context/OrgContext';
import { cn } from '@/lib/cn';
import { tabGroups, type TabGroup, type TabItem } from './navigation';

/**
 * The tab group the current page belongs to, with only the tabs this person may see.
 * @returns The group, or null when the page isn't part of one.
 */
export function useTabGroup(): TabGroup | null {
  const { pathname } = useLocation();
  const org = useOrgIfAny();
  const terms = org?.terms ?? GENERIC_TERMS;
  const group = tabGroups(terms).find((g) => g.tabs.some((t) => t.to === pathname));
  if (!group) return null;
  const allowed = (t: TabItem) =>
    (!t.permission || !!org?.can(t.permission)) &&
    (!t.feature || !!org?.activeOrg?.settings.features[t.feature]);
  return { ...group, tabs: group.tabs.filter(allowed) };
}

/**
 * The tab bar for a group.
 * @param props - The group.
 * @returns The tabs, or null with fewer than two.
 */
export function SectionTabs({ group }: { group: TabGroup }) {
  if (group.tabs.length < 2) return null;
  return (
    <nav aria-label={`${group.title} sections`} className="mt-4 border-b border-line">
      <ul className="-mb-px flex flex-wrap gap-1">
        {group.tabs.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end
              className={({ isActive }) =>
                cn(
                  'inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-semibold transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )
              }
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
